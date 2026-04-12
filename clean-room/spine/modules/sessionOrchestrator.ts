import type { KvStore, SessionStore } from './contracts';
import type { FeishuAgentBinding, FeishuRuntimeAppConfig } from './feishuRuntime';
import { getOrCreateFeishuSession } from './feishuSessionSpine';
import type { InboundRequest } from './inbound';
import { formatTraceLog, type RequestTrace } from './requestTrace';
import { prepareContinueSession, prepareNewSession } from './sessionIngress';

export interface SessionExecutor {
  startSession(
    sessionId: string,
    prompt: string,
    options?: {
      skipInitialUserMessage?: boolean;
      skillIds?: string[];
      systemPrompt?: string;
      zenMode?: boolean;
      autoApprove?: boolean;
      workspaceRoot?: string;
      confirmationMode?: 'modal' | 'text';
      imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
    }
  ): Promise<void>;
  continueSession(
    sessionId: string,
    prompt: string,
    options?: {
      skipInitialUserMessage?: boolean;
      systemPrompt?: string;
      skillIds?: string[];
      zenMode?: boolean;
      autoApprove?: boolean;
      workspaceRoot?: string;
      confirmationMode?: 'modal' | 'text';
      imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
    }
  ): Promise<void>;
  runChannelFastTurn(
    sessionId: string,
    prompt: string,
    options?: {
      systemPrompt?: string;
      autoApprove?: boolean;
      workspaceRoot?: string;
      confirmationMode?: 'modal' | 'text';
      imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
    }
  ): Promise<void>;
  isSessionActive(sessionId: string): boolean;
}

export interface ContinuityBootstrap {
  source: 'shared-thread' | 'durable-memory' | 'none';
  text: string;
}

export interface OrchestratedTurn {
  sessionId: string;
  continuity: ContinuityBootstrap;
  traceLog: string[];
}

function buildTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.split('\n')[0]?.trim() || 'New Session';
  return firstLine.slice(0, 50) || 'New Session';
}

function buildMessageMetadata(request: InboundRequest): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (request.skillIds?.length) {
    metadata.skillIds = request.skillIds;
  }
  if (request.zenMode) {
    metadata.zenMode = true;
  }
  if (request.imageAttachments?.length) {
    metadata.imageAttachments = request.imageAttachments;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function launchDetachedTurn(
  task: Promise<void>,
  trace: RequestTrace,
  stage: string
): void {
  void task.catch((error) => {
    console.error(`[sessionOrchestrator] ${formatTraceLog(trace, stage)} failed:`, error);
  });
}

export function resolveContinuityBootstrap(
  _sessionStore: SessionStore,
  _agentRoleKey: string,
  _now: Date = new Date()
): ContinuityBootstrap {
  // {标记} P0-CONTINUITY-SINGLE-SOURCE: 编排层不再拥有 continuity 真相逻辑。
  // {标记} DISPLAY_ONLY: 这里保留的只是无副作用占位壳，避免 route/orchestrator 再提前 seed/shared-thread。
  // Web/Feishu live continuity bootstrap must be executed only inside the real executor.
  // The orchestrator keeps a zero-side-effect placeholder to avoid duplicate seeding and
  // source drift before the actual turn begins.
  const continuity = {
    source: 'none' as const,
    promptText: '',
  };
  return {
    source: continuity.source,
    text: continuity.promptText,
  };
}

export async function orchestrateWebTurn(params: {
  sessionStore: SessionStore;
  executor: SessionExecutor;
  trace: RequestTrace;
  request: InboundRequest;
  defaultCwd: string;
}): Promise<OrchestratedTurn> {
  const { sessionStore, executor, trace, request, defaultCwd } = params;
  const continuity = resolveContinuityBootstrap(sessionStore, request.agentRoleKey);
  // {标记} DISPLAY_ONLY: orchestrator.traceLog 里的 continuity source 不是执行器最终真相，只是当前入口层占位信息。
  const messageMetadata = buildMessageMetadata(request);

  let sessionId = request.sessionId;
  let traceLog: string[] = [];

  if (sessionId) {
    const prepared = prepareContinueSession(sessionStore, trace, {
      sessionId,
      prompt: request.text,
      metadata: messageMetadata,
    });
    sessionId = prepared.session.id;
    traceLog = prepared.traceLog;
    launchDetachedTurn(
      executor.continueSession(sessionId, request.text, {
        skipInitialUserMessage: true,
        systemPrompt: request.systemPrompt,
        skillIds: request.skillIds,
        zenMode: request.zenMode,
        autoApprove: request.autoApprove,
        workspaceRoot: request.cwd,
        confirmationMode: request.confirmationMode ?? 'modal',
        imageAttachments: request.imageAttachments,
      }),
      trace,
      'continue-session'
    );
  } else {
    const prepared = prepareNewSession(sessionStore, trace, {
      title: request.title?.trim() || buildTitleFromPrompt(request.text),
      cwd: request.cwd || defaultCwd,
      prompt: request.text,
      systemPrompt: request.systemPrompt,
      skillIds: request.skillIds,
      agentRoleKey: request.agentRoleKey,
      modelId: request.modelId,
      metadata: messageMetadata,
    });
    sessionId = prepared.session.id;
    traceLog = prepared.traceLog;
    launchDetachedTurn(
      executor.startSession(sessionId, request.text, {
        skipInitialUserMessage: true,
        skillIds: request.skillIds,
        systemPrompt: request.systemPrompt,
        zenMode: request.zenMode,
        autoApprove: request.autoApprove,
        workspaceRoot: request.cwd || defaultCwd,
        confirmationMode: request.confirmationMode ?? 'modal',
        imageAttachments: request.imageAttachments,
      }),
      trace,
      'start-session'
    );
  }

  traceLog.push(formatTraceLog(trace, 'continuity', `source=${continuity.source}`));
  return {
    sessionId,
    continuity,
    traceLog,
  };
}

export async function orchestrateFeishuTurn(params: {
  sessionStore: SessionStore;
  kvStore: KvStore;
  executor: SessionExecutor;
  trace: RequestTrace;
  request: InboundRequest;
  app: FeishuRuntimeAppConfig;
  binding: FeishuAgentBinding;
  defaultCwd: string;
}): Promise<OrchestratedTurn | { busy: true; traceLog: string[]; sessionId: string }> {
  const { sessionStore, kvStore, executor, trace, request, app, binding, defaultCwd } = params;
  const session = getOrCreateFeishuSession(
    sessionStore,
    kvStore,
    app,
    binding,
    request.channelId,
    defaultCwd
  );

  const traceLog = [
    formatTraceLog(trace, 'feishu-session', `session=${session.id}`),
  ];

  if (executor.isSessionActive(session.id) || session.status === 'running') {
    traceLog.push(formatTraceLog(trace, 'busy', `session=${session.id}`));
    return { busy: true, traceLog, sessionId: session.id };
  }

  const continuity = resolveContinuityBootstrap(sessionStore, request.agentRoleKey);
  // {标记} DISPLAY_ONLY: 这里的 continuity source 不能替代执行器真正写入 assistant metadata 的 continuitySource。
  traceLog.push(formatTraceLog(trace, 'continuity', `source=${continuity.source}`));

  await executor.runChannelFastTurn(session.id, request.text, {
    systemPrompt: request.systemPrompt,
    autoApprove: request.autoApprove ?? true,
    workspaceRoot: session.cwd,
    confirmationMode: request.confirmationMode ?? 'text',
    imageAttachments: request.imageAttachments,
  });

  return {
    sessionId: session.id,
    continuity,
    traceLog,
  };
}
