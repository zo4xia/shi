import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { SessionExecutor } from '../../clean-room/spine/modules/sessionOrchestrator';
import type {
  CoworkMessage,
  CoworkMessageMetadata,
  CoworkStore,
} from '../../src/main/coworkStore';
import { buildOpenAIChatCompletionsURL } from '../../src/main/libs/coworkFormatTransform';
import {
  pickNextApiKey,
  resolveAgentRolesFromConfig,
  resolveSupportedDesignerImageApiType,
  type AgentRoleKey,
} from '../../src/shared/agentRoleConfig';
import type { SqliteStore } from '../sqliteStore.web';
import { getProjectRoot, resolveRuntimeUserDataPath } from '../../src/shared/runtimeDataPaths';
import {
  BROWSER_EYES_CURRENT_PAGE_STORE_KEY,
  type BrowserEyesCurrentPageState,
} from '../../src/shared/browserEyesState';
import {
  buildNativeCapabilitySystemPrompts,
  createNativeCapabilitySdkTools,
  tryHandleNativeCapabilityDirectTurn,
} from '../../src/shared/nativeCapabilities';
import { readCurrentBrowserEyesStateFromConfigStore } from '../../src/shared/browserObserverRuntime';
import { z } from 'zod';
import {
  getRoleRoot,
  getRoleSkillConfigsRoot,
  getRoleSkillSecretsRoot,
  getRoleSkillsIndexPath,
} from './roleSkillFiles';
import {
  getRoleCapabilitySnapshotPath,
  getRoleNotesPath,
  getRolePitfallsPath,
} from './roleRuntimeViews';
import {
  emitSessionComplete,
  emitSessionError,
  emitSessionMessage,
  emitSessionMessageUpdate,
  emitSessionsChanged,
} from './sessionEventSink';
import { resolveContinuityBootstrap } from './continuityBootstrap';
import { SessionTurnFinalizer } from './sessionTurnFinalizer';
import { parseFile } from './fileParser';
import {
  buildAttachmentInlineManifestPrompt,
  buildAttachmentManifestText,
  buildAttachmentRuntimeContext,
  buildAttachmentToolPrompt,
  decorateAttachmentManifestInput,
  decorateAttachmentReadInput,
  formatAttachmentReadResult,
  readAttachmentText,
} from './attachmentRuntime';
import {
  buildTurnCacheKey,
  getTurnCacheEntry,
  putTurnCacheEntry,
} from './turnCache';
import { appendToIdentityThread } from './identityThreadHelper';
import {
  extractAssistantToolCalls,
  extractTextFromResponsesOutput,
  isToolLoopCompatibilityError,
  normalizeAssistantMessageContent,
  summarizeOpenAIToolPayload,
  summarizeRawToolResponseBody,
  type OpenAIToolCallCompat,
} from './toolRuntimeCompat';
import { buildToolCompletionRequest } from './toolRuntimeRequest';

type ImageAttachment = {
  name: string;
  mimeType: string;
  base64Data: string;
};

type GeneratedImage = {
  name: string;
  mimeType?: string;
  base64Data?: string;
  url?: string;
};

type AssistantOutput = {
  text: string;
  generatedImages: GeneratedImage[];
};

type BuiltSystemPromptResult = {
  prompt: string;
  continuitySource: 'shared-thread' | 'durable-memory' | 'none' | null;
};

type SkillPromptBuilder = (skillIds: string[]) => string | null | Promise<string | null>;

type TurnOptions = {
  skipInitialUserMessage?: boolean;
  skillIds?: string[];
  systemPrompt?: string;
  zenMode?: boolean;
  autoApprove?: boolean;
  workspaceRoot?: string;
  confirmationMode?: 'modal' | 'text';
  imageAttachments?: ImageAttachment[];
};

type ActiveExecution = {
  abortController: AbortController;
};

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text';
    text: string;
  } | {
    type: 'image_url';
    image_url: {
      url: string;
    };
  }>;
};

type OpenAIToolCall = OpenAIToolCallCompat;

type OpenAIAssistantToolCallMessage = {
  role: 'assistant';
  content: OpenAIMessage['content'] | null;
  tool_calls: OpenAIToolCall[];
};

type OpenAIToolResultMessage = {
  role: 'tool';
  tool_call_id: string;
  content: string;
};

type OpenAIRequestMessage = OpenAIMessage | OpenAIAssistantToolCallMessage | OpenAIToolResultMessage;

type ExecutorToolDefinition = {
  name: string;
  spec: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  decorateInput?: (args: Record<string, unknown>) => Record<string, unknown>;
  handler: (args: any) => Promise<{ text: string; isError?: boolean }>;
};

const DEFAULT_OPENAI_MAX_TOKENS = 4096;
const CACHE_REPLAY_CHUNK_SIZE = 48;
const CACHE_REPLAY_CHUNK_DELAY_MS = 10;
const FORWARDED_RAW_CONTEXT_MESSAGE_LIMIT = 3;
const BOUNDED_LOOP_MAX_STEPS = 10;
const DEFAULT_BOUNDED_LOOP_MAX_DURATION_MS = 180_000;
const LONG_FORM_BOUNDED_LOOP_MAX_DURATION_MS = 420_000;
const ATTACHMENT_BOUNDED_LOOP_MAX_DURATION_MS = 480_000;
const UPSTREAM_RETRY_DELAY_MS = 1_200;
const MIN_CONFIGURED_BOUNDED_LOOP_TIMEOUT_MS = 30_000;
const MAX_CONFIGURED_BOUNDED_LOOP_TIMEOUT_MS = 900_000;
const PER_TURN_TOOL_LIMITS: Record<string, number> = {
  broadcast_board_write: 1,
};
const MAX_PARSED_ATTACHMENT_COUNT = 4;
const MAX_PARSED_ATTACHMENT_TOTAL_CHARS = 24000;
const MAX_PARSED_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const BLINGBLING_LITTLE_EYE_SKILL_ID = 'blingbling-little-eye';
const BLINGBLING_OBSERVER_SCRIPT = path.join('scripts', 'observe-page.mjs');
const BLINGBLING_OBSERVER_TIMEOUT_MS = 12000;
const BLINGBLING_OBSERVER_PROMPT_MAX_CHARS = 5000;
const BLINGBLING_CURRENT_PAGE_MAX_AGE_MS = 15 * 60 * 1000;

type DirectApiConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  agentRoleKey: AgentRoleKey;
  imageApiType?: string;
};

function isVolcengineV3BaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3')
    || normalized.includes('ark.cn-beijing.volces.com/api/coding/v3');
}

export class HttpSessionExecutor implements SessionExecutor {
  private readonly activeSessions = new Map<string, ActiveExecution>();
  private readonly finalizer: SessionTurnFinalizer;

  constructor(
    private readonly store: CoworkStore,
    private readonly configStore: SqliteStore,
    private readonly buildSelectedSkillsPrompt: SkillPromptBuilder | null = null
  ) {
    this.finalizer = new SessionTurnFinalizer(store);
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  stopSession(sessionId: string): boolean {
    const active = this.activeSessions.get(sessionId);
    if (!active) {
      return false;
    }

    active.abortController.abort();
    this.activeSessions.delete(sessionId);
    this.store.updateSession(sessionId, { status: 'idle' });
    emitSessionsChanged(sessionId, 'stopped');
    return true;
  }

  async startSession(sessionId: string, prompt: string, options: TurnOptions = {}): Promise<void> {
    await this.executeTurn(sessionId, prompt, options, 'start');
  }

  async continueSession(sessionId: string, prompt: string, options: TurnOptions = {}): Promise<void> {
    await this.executeTurn(sessionId, prompt, options, 'continue');
  }

  async runChannelFastTurn(sessionId: string, prompt: string, options: TurnOptions = {}): Promise<void> {
    await this.executeTurn(sessionId, prompt, options, 'channel');
  }

  private async executeTurn(
    sessionId: string,
    prompt: string,
    options: TurnOptions,
    mode: 'start' | 'continue' | 'channel'
  ): Promise<void> {
    // {路标} FLOW-EXECUTOR-HTTP-TURN
    // {FLOW} EXECUTOR-HTTP-TURN: Web/Feishu 一期现役执行主干，负责状态切换、消息写入、模型请求、完成收尾。
    // 【1.0链路】HTTP-EXEC-TURN: 当前稳定执行主链，负责状态切换、消息写入、直连 OpenAI 兼容流式请求。
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is already running`);
    }

    const existingSession = this.store.getSession(sessionId);
    if (!existingSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const abortController = new AbortController();
    const streamState = createStreamState();
    this.activeSessions.set(sessionId, { abortController });

    try {
      this.store.updateSession(sessionId, { status: 'running' });
      if (options.workspaceRoot?.trim()) {
        this.store.updateSession(sessionId, { cwd: path.resolve(options.workspaceRoot) });
      }
      emitSessionsChanged(sessionId, 'running');

      if (mode === 'channel' || !options.skipInitialUserMessage) {
        this.ensureLatestUserMessage(sessionId, prompt, options);
      }

      this.finalizer.prepareTurn(sessionId);

      const session = this.store.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} disappeared during execution`);
      }

      const apiConfig = this.resolveDirectApiConfig(session.agentRoleKey);
      if (!apiConfig) {
        throw new Error('API configuration not found. Please configure model settings.');
      }

      const mergedSkillIds = this.resolveMergedSkillIds(session, options);
      const builtSystemPrompt = await this.buildSystemPrompt(sessionId, session.systemPrompt || '', options, mode);
      const systemPrompt = builtSystemPrompt.prompt;
      streamState.metadata = {
        ...(streamState.metadata || {}),
        ...(builtSystemPrompt.continuitySource ? { continuitySource: builtSystemPrompt.continuitySource } : {}),
      };
      const effectiveImageApiType = resolveSupportedDesignerImageApiType(apiConfig.imageApiType);
      if (apiConfig.agentRoleKey === 'designer' && effectiveImageApiType === 'google') {
        await this.runGoogleGenerateContent(sessionId, session, systemPrompt, apiConfig, streamState, abortController.signal);
      } else if (apiConfig.agentRoleKey === 'designer' && effectiveImageApiType === 'images') {
        await this.runOpenAIImagesGeneration(sessionId, session, systemPrompt, apiConfig, streamState, abortController.signal);
      } else if (this.shouldPreferBoundedToolLoop(session, prompt, mergedSkillIds)) {
        // {BREAKPOINT} DIRECT-EXECUTOR-BOUNDED-LOOP
        // {FLOW} PHASE1-DIRECT-AGENTIC-DEFAULT: 现役非图片主链默认把工具决定权交给 agent，
        // 不再依赖窄启发式把大多数回合挡在单轮之外。
        // {标记} P0-BOUND-LOOP-COMPAT: 仍保留 10 步 / 90 秒受控边界，并在上游不兼容 tools 时回退 single-shot。
        await this.runBoundedToolLoopOrFallback(
          sessionId,
          session,
          prompt,
          systemPrompt,
          apiConfig,
          streamState,
          abortController.signal,
          options
        );
      } else {
        await this.runOpenAIStream(sessionId, session, systemPrompt, apiConfig, streamState, abortController.signal);
      }

      this.finishAssistantMessage(sessionId, streamState);
      this.store.updateSession(sessionId, { status: 'completed' });
      if (mode === 'channel') {
        this.finalizeChannelTurnInBackground(sessionId);
      } else {
        await this.finalizer.finalize(sessionId);
      }
      emitSessionComplete(sessionId, null);
      emitSessionsChanged(sessionId, 'completed');
    } catch (error) {
      if (abortController.signal.aborted) {
        this.store.updateSession(sessionId, { status: 'idle' });
        emitSessionsChanged(sessionId, 'aborted');
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.finishAssistantMessage(sessionId, streamState);
      this.store.updateSession(sessionId, { status: 'error' });
      const systemMessage = this.store.addMessage(sessionId, {
        type: 'system',
        content: `Error: ${message}`,
        metadata: { error: message },
      });
      emitSessionMessage(sessionId, systemMessage);
      if (mode === 'channel') {
        this.finalizeChannelTurnInBackground(sessionId);
      } else {
        await this.finalizer.finalize(sessionId);
      }
      emitSessionError(sessionId, message);
      emitSessionsChanged(sessionId, 'error');
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  private finalizeChannelTurnInBackground(sessionId: string): void {
    queueMicrotask(() => {
      void this.finalizer.finalize(sessionId).catch((error) => {
        console.error('[HttpSessionExecutor] Channel finalizer failed:', error);
      });
    });
  }

  private resolveDirectApiConfig(agentRoleKey: string | null | undefined): DirectApiConfig | null {
    const resolvedRoleKey = resolveRuntimeAgentRoleKey(agentRoleKey);
    const appConfig = this.configStore.get<Record<string, unknown>>('app_config');
    const roles = resolveAgentRolesFromConfig(appConfig as Parameters<typeof resolveAgentRolesFromConfig>[0]);
    const role = roles[resolvedRoleKey];

    if (!role) {
      return null;
    }

    const effectiveApiFormat = role.apiFormat === 'openai' || isVolcengineV3BaseUrl(role.apiUrl)
      ? 'openai'
      : role.apiFormat;
    if (effectiveApiFormat !== 'openai') {
      throw new Error(`Role ${resolvedRoleKey} is configured as ${role.apiFormat}. Web direct executor currently only supports openai-compatible streaming.`);
    }

    const baseURL = role.apiUrl.trim();
    const model = role.modelId.trim();
    if (!baseURL || !model) {
      return null;
    }

    const apiKey = pickNextApiKey(role.apiKey, `web-session-executor:${resolvedRoleKey}`) || role.apiKey.trim();

    return {
      baseURL,
      apiKey,
      model,
      agentRoleKey: resolvedRoleKey,
      imageApiType: role.imageApiType,
    };
  }

  private ensureLatestUserMessage(sessionId: string, prompt: string, options: TurnOptions): void {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const lastMessage = session.messages[session.messages.length - 1];
    if (lastMessage?.type === 'user' && lastMessage.content === prompt) {
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (options.skillIds?.length) {
      metadata.skillIds = options.skillIds;
    }
    if (options.zenMode) {
      metadata.zenMode = true;
    }
    if (options.imageAttachments?.length) {
      metadata.imageAttachments = options.imageAttachments;
    }

    const userMessage = this.store.addMessage(sessionId, {
      type: 'user',
      content: prompt,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
    emitSessionMessage(sessionId, userMessage);
    emitSessionsChanged(sessionId, 'user-message');
  }

  private async buildSystemPrompt(
    sessionId: string,
    baseSystemPrompt: string,
    options: TurnOptions,
    mode: 'start' | 'continue' | 'channel'
  ): Promise<BuiltSystemPromptResult> {
    // {BREAKPOINT} continuity-system-prompt-assembly-001
    // {路标} FLOW-EXECUTOR-SYSTEM-PROMPT
    // {FLOW} EXECUTOR-PROMPT-ASSEMBLY: system prompt 由显式提示、角色技能、native capabilities、连续性提示等拼装而成。
    // 【1.0链路】PROMPT-BUILD: 系统提示 = 显式 systemPrompt + 角色技能提示 + 连续性共享记忆提示。
    // {BUG} bug-broadcast-visibility-chain-001
    // {说明} 现役主链把 continuity 放进 system prompt；旧 CoworkRunner 则放进 prompt prefix。
    // {波及} 这会造成“广播板数据明明在，但 agent 口头有时说看得到、有时说看不到”的不一致。
    const session = this.store.getSession(sessionId);
    if (!session) {
      return {
        prompt: baseSystemPrompt,
        continuitySource: null,
      };
    }

    const promptSections: string[] = [];
    const mergedSkillIds = this.resolveMergedSkillIds(session, options);
    const zenModeEnabled = Boolean(options.zenMode);

    if (options.systemPrompt?.trim()) {
      promptSections.push(options.systemPrompt.trim());
    } else if (baseSystemPrompt.trim()) {
      promptSections.push(baseSystemPrompt.trim());
    }

    if (mergedSkillIds.length > 0 && this.buildSelectedSkillsPrompt) {
      const skillPrompt = await this.buildSelectedSkillsPrompt(mergedSkillIds);
      if (skillPrompt?.trim()) {
        promptSections.push(skillPrompt.trim());
      }
    }

    promptSections.push(...buildNativeCapabilitySystemPrompts({
      roleKey: resolveRuntimeAgentRoleKey(session.agentRoleKey),
      appConfig: this.configStore.get<Record<string, unknown>>('app_config') as Record<string, unknown> | null,
      readCurrentBrowserPage: () => readCurrentBrowserEyesStateFromConfigStore(this.configStore),
    }));

    const browserEyesFirstPrompt = this.buildBrowserEyesFirstPrompt(
      resolveRuntimeAgentRoleKey(session.agentRoleKey),
      mergedSkillIds
    );
    if (browserEyesFirstPrompt) {
      promptSections.push(browserEyesFirstPrompt);
    }

    const preloadedPageObservation = await this.buildPreloadedPageObservationPrompt(
      session,
      mergedSkillIds
    );
    if (preloadedPageObservation) {
      promptSections.push(preloadedPageObservation);
    }

    let continuitySource: BuiltSystemPromptResult['continuitySource'] = null;
    if (session.agentRoleKey) {
      const runtimeMcpAwareness = this.buildRuntimeMcpAwareness(resolveRuntimeAgentRoleKey(session.agentRoleKey));
      if (runtimeMcpAwareness) {
        promptSections.push(runtimeMcpAwareness);
      }

      const roleHomePrompt = this.buildRoleHomePrompt(resolveRuntimeAgentRoleKey(session.agentRoleKey));
      if (roleHomePrompt) {
        promptSections.push(roleHomePrompt);
      }

      if (zenModeEnabled) {
        promptSections.push([
          '## Zen Mode',
          '- Broadcast baton is disabled for this turn.',
          '- Do not read from, write to, summarize from, or rely on the 24h shared broadcast board in this turn.',
          '- Keep using the current conversation, explicit tool results, selected skills, and direct database-backed tools when needed.',
        ].join('\n'));
      } else {
        const continuity = resolveContinuityBootstrap({
          db: this.store.getDatabase(),
          saveDb: this.store.getSaveFunction(),
          agentRoleKey: session.agentRoleKey,
          stateStore: this.configStore,
        });
        continuitySource = continuity.source;
        if (continuity.wakeupText.trim()) {
          promptSections.push(continuity.wakeupText.trim());
        }
        if (continuity.promptText.trim()) {
          promptSections.push(continuity.promptText.trim());
        }

        promptSections.push(this.buildBroadcastBoardOperatingPrompt());
      }
    }

    const latestUserMessage = [...session.messages].reverse().find((message) => message.type === 'user');
    if (latestUserMessage?.content) {
      const attachmentPrompt = buildAttachmentToolPrompt(
        buildAttachmentRuntimeContext(latestUserMessage.content)
      );
      if (attachmentPrompt) {
        promptSections.push(attachmentPrompt);
      }
    }

    return {
      prompt: promptSections.filter((section) => section.trim()).join('\n\n'),
      continuitySource,
    };
  }

  private buildRoleHomePrompt(roleKey: AgentRoleKey): string {
    try {
      const userDataPath = resolveRuntimeUserDataPath();
      const projectRoot = getProjectRoot();
      const toRelative = (targetPath: string): string => {
        const relativePath = path.relative(projectRoot, targetPath).replace(/\\/g, '/');
        return relativePath || '.';
      };

      const roleRoot = toRelative(getRoleRoot(userDataPath, roleKey));
      const skillsIndex = toRelative(getRoleSkillsIndexPath(userDataPath, roleKey));
      const capabilitySnapshot = toRelative(getRoleCapabilitySnapshotPath(userDataPath, roleKey));
      const configsRoot = toRelative(getRoleSkillConfigsRoot(userDataPath, roleKey));
      const secretsRoot = toRelative(getRoleSkillSecretsRoot(userDataPath, roleKey));
      const roleNotesPath = toRelative(getRoleNotesPath(userDataPath, roleKey));
      const pitfallsPath = toRelative(getRolePitfallsPath(userDataPath, roleKey));

      return [
        '## Role Home',
        `- Your role home is \`${roleRoot}/\`. This folder is also your home for current capabilities, supported skills, MCP awareness, and mistake notes.`,
        `- Supported skills index: \`${skillsIndex}\`.`,
        `- Runtime capability snapshot (including current MCP awareness): \`${capabilitySnapshot}\`.`,
        `- Role skill configs live under: \`${configsRoot}/\`.`,
        `- Role skill secrets live under: \`${secretsRoot}/\`.`,
        `- Your role notes live at: \`${roleNotesPath}\`.`,
        `- Your pitfalls / mistake notebook lives at: \`${pitfallsPath}\`.`,
        '- Use these relative paths as the ground truth for what belongs to your current role.',
        '- If a skill is not present in the role skills index, do not assume it is already available for this role.',
        '- If an MCP tool is not present in the runtime capability snapshot, do not assume it is currently live for this role.',
        '- Treat the pitfalls notebook as your role-specific mistake book: use it to avoid repeating known errors, not as a source of runtime truth.',
      ].join('\n');
    } catch {
      return '';
    }
  }

  private buildBroadcastBoardOperatingPrompt(): string {
    return [
      '## Broadcast Baton',
      '- You have a `broadcast_board_write` tool for leaving a short baton note to your same-role future self.',
      '- Use it during the turn when one of these becomes clear: key user requirement, important judgment, freshly confirmed pitfall, fix already completed, or next-step handoff.',
      '- Keep each baton factual and compact. It is a 24h relay note, not a full transcript.',
      '- At most one `broadcast_board_write` call is allowed per turn. If a baton note is already written in this turn, continue the user-facing answer instead of writing another.',
      '- The default continuity path is: broadcast board first, then the most recent raw messages, then longer history only when exact detail is needed.',
      '',
      '## Tool Grounding',
      '- If this turn already produced one or more tool results, treat those results as real successful observations or actions from the current session.',
      '- Do not say you cannot access, cannot call, or cannot use a tool when a tool result is already present in the conversation state.',
      '- After a tool result arrives, answer from that result directly. If the result is incomplete, say what is missing; do not pretend the tool was unavailable.',
    ].join('\n');
  }

  private buildToolCompatibilityFallbackPrompt(systemPrompt: string, compatibilityReason: string): string {
    const addition = [
      '## Tool Compatibility Notice',
      '- The current provider/model did not execute tool completions for this turn.',
      '- Do not say the tool is missing from the project, hidden by the UI, or unconfigured if this turn already attempted tool completion.',
      '- If the user asked for a tool call, explain that the current provider/model could not execute tool completions for this request shape, then continue with the best non-tool answer you can provide.',
      `- Compatibility reason: ${compatibilityReason}`,
    ].join('\n');

    return [systemPrompt, addition].filter((section) => section.trim()).join('\n\n');
  }

  private resolveMergedSkillIds(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    options: TurnOptions
  ): string[] {
    const selectedSkillIds = options.skillIds?.length ? options.skillIds : session.activeSkillIds;
    const roleBoundSkillIds = session.agentRoleKey
      ? this.readRuntimeRoleSkillIds(resolveRuntimeAgentRoleKey(session.agentRoleKey))
      : [];

    return Array.from(new Set([
      ...roleBoundSkillIds,
      ...(selectedSkillIds ?? []),
    ]));
  }

  private emitNativeAssistantMessage(sessionId: string, content: string, metadata?: Record<string, unknown>): void {
    const assistantMessage = this.store.addMessage(sessionId, {
      type: 'assistant',
      content,
      metadata: {
        isFinal: true,
        nativeTool: 'native-capability',
        ...(metadata ?? {}),
      },
    });
    emitSessionMessage(sessionId, assistantMessage);
  }

  private emitPreToolStatusMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    const trimmed = String(content || '').trim();
    if (!trimmed) {
      return;
    }

    const statusMessage = this.store.addMessage(sessionId, {
      type: 'assistant',
      content: trimmed,
      metadata: {
        isFinal: false,
        stage: 'pre_tool',
        ...(metadata ?? {}),
      },
    });
    emitSessionMessage(sessionId, statusMessage);
  }

  private async tryHandleNativeImaTurn(
    sessionId: string,
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    prompt: string,
    _skillIds: string[]
  ): Promise<boolean> {
    void session;
    void _skillIds;
    return tryHandleNativeCapabilityDirectTurn({
      prompt,
      emitResult: (content, metadata) => {
        this.emitNativeAssistantMessage(sessionId, content, metadata);
      },
    }, {
      roleKey: resolveRuntimeAgentRoleKey(session.agentRoleKey),
      appConfig: this.configStore.get<Record<string, unknown>>('app_config') as Record<string, unknown> | null,
      readCurrentBrowserPage: () => readCurrentBrowserEyesStateFromConfigStore(this.configStore),
    });
  }

  private buildBrowserEyesFirstPrompt(
    roleKey: AgentRoleKey,
    skillIds: string[]
  ): string | null {
    if (roleKey !== 'organizer' || !skillIds.includes(BLINGBLING_LITTLE_EYE_SKILL_ID)) {
      return null;
    }

    return [
      '## Browser Eyes First',
      '- If the current task is about understanding a webpage with likely readable DOM structure, inspect with `blingbling小眼睛` first.',
      '- Good first-look cases include forms, settings pages, admin panels, search/list/filter pages, and ordinary documentation-like pages.',
      '- Do not jump into heavy browser automation, repeated screenshots, or permission-heavy interaction before this first look unless direct action is already clearly necessary.',
      '- Escalate to heavier browser interaction only when `blingbling小眼睛` reports limits or when real page interaction is required.',
      '- If the page is canvas-heavy, visual-only, blocked, or DOM-poor, say that clearly and then switch strategy.',
    ].join('\n');
  }

  private async buildPreloadedPageObservationPrompt(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    skillIds: string[]
  ): Promise<string | null> {
    if (resolveRuntimeAgentRoleKey(session.agentRoleKey) !== 'organizer') {
      return null;
    }
    if (!skillIds.includes(BLINGBLING_LITTLE_EYE_SKILL_ID)) {
      return null;
    }

    const latestUserMessage = [...session.messages].reverse().find((message) => message.type === 'user');
    const attachmentContext = buildAttachmentRuntimeContext(latestUserMessage?.content || '');
    if (attachmentContext.attachments.length > 0) {
      return null;
    }
    const resolvedTarget = this.resolveObservationTarget(latestUserMessage?.content || '');
    if (!resolvedTarget) {
      return null;
    }

    const observation = await this.runBlingblingObserver(resolvedTarget.target);
    if (!observation) {
      return null;
    }

    const compact = JSON.stringify(observation, null, 2);
    const clipped = compact.length > BLINGBLING_OBSERVER_PROMPT_MAX_CHARS
      ? `${compact.slice(0, BLINGBLING_OBSERVER_PROMPT_MAX_CHARS)}\n...`
      : compact;

    return [
      '## Preloaded Page Observation',
      resolvedTarget.description,
      'Treat it as helpful DOM-first reconnaissance, not perfect live-browser truth.',
      '```json',
      clipped,
      '```',
    ].join('\n');
  }

  private resolveObservationTarget(
    text: string
  ): {
    target: { mode: 'url' | 'file'; value: string };
    description: string;
  } | null {
    const attachmentContext = buildAttachmentRuntimeContext(text);
    if (attachmentContext.attachments.length > 0) {
      return null;
    }

    const explicitTarget = this.extractFirstObservationTarget(text);
    if (explicitTarget) {
      return {
        target: explicitTarget,
        description: `A lightweight first look was generated from the target in the user message using \`${BLINGBLING_LITTLE_EYE_SKILL_ID}\`.`,
      };
    }

    if (!this.userMessageLikelyRefersToCurrentPage(text)) {
      return null;
    }

    const currentPage = this.readCurrentBrowserEyesState();
    if (!currentPage) {
      return null;
    }

    return {
      target: { mode: 'url', value: currentPage.url },
      description: `A lightweight first look was generated from the current embedded browser page using \`${BLINGBLING_LITTLE_EYE_SKILL_ID}\`${currentPage.title ? ` (${currentPage.title})` : ''}.`,
    };
  }

  private extractFirstObservationTarget(text: string): { mode: 'url' | 'file'; value: string } | null {
    const rawText = String(text || '');
    const attachmentContext = buildAttachmentRuntimeContext(rawText);
    const attachmentPaths = new Set(
      attachmentContext.attachments.map((attachment) => path.resolve(attachment.path))
    );

    const httpMatch = rawText.match(/https?:\/\/[^\s<>"')\]]+/i);
    if (httpMatch?.[0]) {
      return { mode: 'url', value: httpMatch[0] };
    }

    const fileUrlMatch = rawText.match(/file:\/\/\/?[^\s<>"')\]]+/i);
    if (fileUrlMatch?.[0]) {
      try {
        const parsedUrl = new URL(fileUrlMatch[0]);
        const decodedPath = decodeURIComponent(parsedUrl.pathname || '');
        const windowsPath = decodedPath.replace(/^\/([A-Za-z]:\/)/, '$1');
        return { mode: 'file', value: windowsPath };
      } catch {
        return null;
      }
    }

    const htmlPathMatch = rawText.match(/(?:[A-Za-z]:\\|\/)[^\s"'<>]+\.html?\b/i);
    if (htmlPathMatch?.[0]) {
      const resolvedPath = path.resolve(htmlPathMatch[0]);
      if (attachmentPaths.has(resolvedPath)) {
        return null;
      }
      return { mode: 'file', value: htmlPathMatch[0] };
    }

    return null;
  }

  private userMessageLikelyRefersToCurrentPage(text: string): boolean {
    return /(current|this)\s+(page|webpage|tab|site)|look at (the|this) page|inspect (the|this) page|what(?:'s| is) on (the|this) page|当前页|这个页面|这个网页|看看(?:这个)?页面|看一下(?:这个)?页面|先看(?:这个)?页面/i.test(
      String(text || '')
    );
  }

  private readCurrentBrowserEyesState(): BrowserEyesCurrentPageState | null {
    try {
      const raw = this.configStore.get(BROWSER_EYES_CURRENT_PAGE_STORE_KEY) as BrowserEyesCurrentPageState | null;
      if (!raw || typeof raw !== 'object') {
        return null;
      }

      const url = String(raw.url || '').trim();
      const updatedAt = Number(raw.updatedAt || 0);
      if (!url || !Number.isFinite(updatedAt) || updatedAt <= 0) {
        return null;
      }

      if (Date.now() - updatedAt > BLINGBLING_CURRENT_PAGE_MAX_AGE_MS) {
        return null;
      }

      return {
        source: 'embedded-browser',
        url,
        title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
        updatedAt,
      };
    } catch {
      return null;
    }
  }

  private resolveBlingblingObserverScriptPath(): string | null {
    const userDataPath = resolveRuntimeUserDataPath();
    const runtimePath = path.join(userDataPath, 'SKILLs', BLINGBLING_LITTLE_EYE_SKILL_ID, BLINGBLING_OBSERVER_SCRIPT);
    if (fs.existsSync(runtimePath)) {
      return runtimePath;
    }
    const projectPath = path.join(getProjectRoot(), 'SKILLs', BLINGBLING_LITTLE_EYE_SKILL_ID, BLINGBLING_OBSERVER_SCRIPT);
    return fs.existsSync(projectPath) ? projectPath : null;
  }

  private async runBlingblingObserver(target: { mode: 'url' | 'file'; value: string }): Promise<Record<string, unknown> | null> {
    const scriptPath = this.resolveBlingblingObserverScriptPath();
    if (!scriptPath) {
      return null;
    }

    const args = target.mode === 'url'
      ? [scriptPath, '--url', target.value, '--compact']
      : [scriptPath, '--file', target.value, '--compact'];

    const child = spawn(process.execPath, args, {
      cwd: path.dirname(path.dirname(scriptPath)),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, BLINGBLING_OBSERVER_TIMEOUT_MS);

    return await new Promise((resolve) => {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 || !stdout.trim()) {
          if (stderr.trim()) {
            console.warn('[HttpSessionExecutor] blingbling observer failed:', stderr.trim());
          }
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          if (!parsed || typeof parsed !== 'object') {
            resolve(null);
            return;
          }
          resolve(parsed);
        } catch {
          resolve(null);
        }
      });
    });
  }

  private readRuntimeRoleSkillIds(roleKey: AgentRoleKey): string[] {
    try {
      const userDataPath = resolveRuntimeUserDataPath();
      const indexPath = getRoleSkillsIndexPath(userDataPath, roleKey);
      if (!fs.existsSync(indexPath)) {
        return [];
      }

      const raw = fs.readFileSync(indexPath, 'utf8').trim();
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as { skills?: Array<{ id?: string; enabled?: boolean }> };
      if (!Array.isArray(parsed.skills)) {
        return [];
      }

      return parsed.skills
        .filter((entry) => entry && entry.enabled !== false)
        .map((entry) => String(entry.id ?? '').trim())
        .filter(Boolean);
    } catch (error) {
      console.warn('[HttpSessionExecutor] Failed to read runtime role skill ids:', error);
      return [];
    }
  }

  private buildRuntimeMcpAwareness(roleKey: AgentRoleKey): string | null {
    try {
      const userDataPath = resolveRuntimeUserDataPath();
      const snapshotPath = getRoleCapabilitySnapshotPath(userDataPath, roleKey);
      if (!fs.existsSync(snapshotPath)) {
        return null;
      }

      const raw = fs.readFileSync(snapshotPath, 'utf8').trim();
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as {
        runtimeMcpTools?: Array<{ name?: string }>;
      };
      const toolNames = Array.isArray(parsed.runtimeMcpTools)
        ? parsed.runtimeMcpTools
          .map((entry) => String(entry?.name ?? '').trim())
          .filter(Boolean)
        : [];

      if (toolNames.length === 0) {
        return null;
      }

      return [
        '## Runtime Capability Snapshot',
        `Configured external MCP tools for this role: ${toolNames.join(', ')}.`,
        'Important: this note only applies to external MCP tools from the runtime capability snapshot.',
        'It does not apply to built-in native capabilities such as browser eyes or IMA when those tools are actually available in the current session.',
        'Do not tell the user that browser eyes / IMA are unavailable just because external MCP auto-execution is limited.',
        'You may mention configured external MCP capabilities when asked, but do not claim you used one unless a real external MCP tool call occurred.',
      ].join('\n');
    } catch (error) {
      console.warn('[HttpSessionExecutor] Failed to read runtime MCP awareness:', error);
      return null;
    }
  }

  private needsBoundedToolLoop(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    prompt: string,
    mergedSkillIds: string[]
  ): boolean {
    const normalizedPrompt = String(prompt || '').trim().toLowerCase();
    if (!normalizedPrompt) {
      return false;
    }

    const attachmentContext = buildAttachmentRuntimeContext(prompt);
    if (attachmentContext.shouldPreferToolReading) {
      return true;
    }

    const hasBrowserEyesSkill = mergedSkillIds.includes(BLINGBLING_LITTLE_EYE_SKILL_ID);
    if (hasBrowserEyesSkill && this.promptLikelyNeedsBrowserTool(prompt)) {
      return true;
    }

    if (this.promptLikelyNeedsImaTool(prompt)) {
      return true;
    }

    if (this.promptLikelyNeedsMemoryTool(prompt)) {
      return true;
    }

    const hasActionIntent = this.promptHasActionIntent(prompt);
    if (!hasActionIntent) {
      return false;
    }

    const roleKey = resolveRuntimeAgentRoleKey(session.agentRoleKey);
    const runtimeMcpCount = this.readRuntimeMcpToolCount(roleKey);
    const likelyAgenticLoop = this.promptLikelyNeedsAgenticLoop(prompt);

    if (mergedSkillIds.length > 0) {
      return true;
    }

    if (runtimeMcpCount > 0) {
      return true;
    }

    if (session.sourceType === 'external' && likelyAgenticLoop) {
      return true;
    }

    return likelyAgenticLoop;
  }

  private shouldPreferBoundedToolLoop(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    prompt: string,
    mergedSkillIds: string[]
  ): boolean {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
      return false;
    }

    return this.needsBoundedToolLoop(session, prompt, mergedSkillIds);
  }

  private promptLikelyLongFormCreation(prompt: string): boolean {
    return /(长文|文章|稿子|专栏|博客|推文|公众号|文案|方案|报告|小说|故事|大纲|章节|润色|扩写|续写|write\s+(?:a|an)\s+(?:long\s+)?article|draft\s+(?:an?\s+)?article|long-form|blog\s+post|essay|story|outline|chapter)/i.test(
      String(prompt || '').trim()
    );
  }

  private readConfiguredBoundedLoopTimeoutMs(): number | null {
    try {
      const appConfig = this.configStore.get<Record<string, unknown>>('app_config') as Record<string, unknown> | null;
      const coworkConfig = appConfig?.cowork;
      if (!coworkConfig || typeof coworkConfig !== 'object') {
        return null;
      }

      const rawValue = (coworkConfig as Record<string, unknown>).boundedToolLoopTimeoutMs;
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        return null;
      }

      return Math.max(
        MIN_CONFIGURED_BOUNDED_LOOP_TIMEOUT_MS,
        Math.min(MAX_CONFIGURED_BOUNDED_LOOP_TIMEOUT_MS, Math.round(rawValue))
      );
    } catch {
      return null;
    }
  }

  private resolveBoundedToolLoopDurationMs(prompt: string, hasChunkedSources: boolean): number {
    const configuredTimeoutMs = this.readConfiguredBoundedLoopTimeoutMs();
    if (configuredTimeoutMs !== null) {
      return configuredTimeoutMs;
    }

    if (hasChunkedSources) {
      return ATTACHMENT_BOUNDED_LOOP_MAX_DURATION_MS;
    }

    if (this.promptLikelyLongFormCreation(prompt)) {
      return LONG_FORM_BOUNDED_LOOP_MAX_DURATION_MS;
    }

    return DEFAULT_BOUNDED_LOOP_MAX_DURATION_MS;
  }

  private async fetchUpstreamResponseWithSingleRetry(
    label: string,
    request: () => Promise<Response>,
    signal: AbortSignal,
  ): Promise<Response> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await request();
        if (response.ok || !isRetryableUpstreamStatus(response.status) || attempt === 2) {
          return response;
        }

        console.warn(
          `[HttpSessionExecutor] ${label} failed with retryable status ${response.status}; retrying once...`
        );
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        if (!isRetryableUpstreamFetchError(error) || attempt === 2) {
          throw error;
        }

        console.warn(
          `[HttpSessionExecutor] ${label} transient error; retrying once: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      await sleep(UPSTREAM_RETRY_DELAY_MS);
    }

    throw new Error(`${label} failed after retry`);
  }

  private async runBoundedToolLoopOrFallback(
    sessionId: string,
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    prompt: string,
    systemPrompt: string,
    apiConfig: DirectApiConfig,
    streamState: StreamState,
    signal: AbortSignal,
    options: TurnOptions
  ): Promise<void> {
    try {
      await this.runBoundedToolLoop(
        sessionId,
        session,
        prompt,
        systemPrompt,
        apiConfig,
        streamState,
        signal,
        options
      );
    } catch (error) {
      if (!isToolLoopCompatibilityError(error)) {
        throw error;
      }

      console.warn(
        `[HttpSessionExecutor] Tool loop unsupported for role=${resolveRuntimeAgentRoleKey(session.agentRoleKey)} model=${apiConfig.model}; fallback to single-shot stream: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await this.runOpenAIStream(
        sessionId,
        session,
        this.buildToolCompatibilityFallbackPrompt(
          systemPrompt,
          error instanceof Error ? error.message : String(error)
        ),
        apiConfig,
        streamState,
        signal
      );
    }
  }

  private promptLikelyNeedsAgenticLoop(prompt: string): boolean {
    const normalized = String(prompt || '').trim();
    if (!normalized) {
      return false;
    }

    return this.promptHasActionIntent(normalized) && this.promptHasConcreteTarget(normalized);
  }

  private promptHasActionIntent(prompt: string): boolean {
    return /(帮我|帮忙|请你|请帮|请先|去|打开|查看|读取|搜索|查找|找出|列出|浏览|整理|分析|总结|归纳|保存|导出|创建|新建|修改|删除|更新|执行|运行|调用|使用|检查|排查|修复|验证|测试|搜一下|看看|看下|read|open|search|find|list|browse|summari[sz]e|analy[sz]e|save|export|create|update|delete|run|use|inspect|check|debug|fix|test)/i.test(
      String(prompt || '').trim()
    );
  }

  private promptHasConcreteTarget(prompt: string): boolean {
    return /(https?:\/\/|[A-Za-z]:\\|\/[^ \n\r\t]+|页面|网页|当前页|目录|文件|文档|链接|网址|笔记|对话|历史|记忆|工具|mcp|browser|playwright|ima|note|file|folder|directory|page|url|link|history|memory|tool|server)/i.test(
      String(prompt || '').trim()
    );
  }

  private promptLikelyNeedsBrowserTool(prompt: string): boolean {
    return /(当前页|这个页面|这个网页|看(?:看|一下).*页面|观察.*页面|inspect.*page|observe.*page|analy[sz]e.*page|https?:\/\/|\.html?\b)/i.test(
      prompt
    );
  }

  private promptLikelyNeedsImaTool(prompt: string): boolean {
    return /(?:\bima\b|腾讯ima|ima笔记|ima\s*note)/i.test(prompt);
  }

  private promptLikelyNeedsMemoryTool(prompt: string): boolean {
    return /(之前|上次|还记得|昨天|前天|最近聊天|最近对话|历史对话|history|recent chats|conversation search|记住|记下来|更新记忆|删除记忆|memory)/i.test(
      prompt
    );
  }

  private readRuntimeMcpToolCount(roleKey: AgentRoleKey): number {
    try {
      const userDataPath = resolveRuntimeUserDataPath();
      const snapshotPath = getRoleCapabilitySnapshotPath(userDataPath, roleKey);
      if (!fs.existsSync(snapshotPath)) {
        return 0;
      }

      const raw = fs.readFileSync(snapshotPath, 'utf8').trim();
      if (!raw) {
        return 0;
      }

      const parsed = JSON.parse(raw) as {
        runtimeMcpTools?: unknown[];
      };
      return Array.isArray(parsed.runtimeMcpTools) ? parsed.runtimeMcpTools.length : 0;
    } catch {
      return 0;
    }
  }

  private async runBoundedToolLoop(
    sessionId: string,
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    prompt: string,
    systemPrompt: string,
    apiConfig: DirectApiConfig,
    streamState: StreamState,
    signal: AbortSignal,
    options: TurnOptions
  ): Promise<void> {
    const toolDefinitions = this.buildExecutorTools(session, prompt, options);
    if (toolDefinitions.length === 0) {
      await this.runOpenAIStream(sessionId, session, systemPrompt, apiConfig, streamState, signal);
      return;
    }

    const attachmentContext = buildAttachmentRuntimeContext(prompt);
    const boundedLoopMaxSteps = attachmentContext.hasChunkedSources ? 24 : BOUNDED_LOOP_MAX_STEPS;
    const boundedLoopMaxDurationMs = this.resolveBoundedToolLoopDurationMs(
      prompt,
      attachmentContext.hasChunkedSources
    );
    const toolInvocationCounts = new Map<string, number>();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new Error('bounded-tool-loop-timeout'));
    }, boundedLoopMaxDurationMs);
    const effectiveSignal = AbortSignal.any([signal, timeoutController.signal]);

    try {
      const messages = await this.buildOpenAIRequestMessages(session, systemPrompt);
      for (let step = 1; step <= boundedLoopMaxSteps; step += 1) {
        if (effectiveSignal.aborted) {
          throw abortReasonToError(effectiveSignal.reason, 'bounded tool loop aborted');
        }

        const responsePayload = await this.fetchOpenAIChatCompletion({
          apiConfig,
          messages,
          tools: toolDefinitions.map((tool) => tool.spec),
          toolChoice: 'auto',
          signal: effectiveSignal,
        });

        const toolCalls = extractAssistantToolCalls(responsePayload);
        const messageContent = normalizeAssistantMessageContent(
          responsePayload?.choices?.[0]?.message?.content
        );

        if (toolCalls.length === 0) {
          const usageMetadata = extractUsageMetadata(responsePayload);
          if (usageMetadata) {
            streamState.metadata = {
              ...(streamState.metadata || {}),
              ...usageMetadata,
            };
          }
          const output = extractAssistantOutput(responsePayload);
          if (output.text || output.generatedImages.length > 0) {
            this.appendAssistantOutput(sessionId, streamState, output);
            return;
          }
          if (messageContent && typeof messageContent === 'string' && messageContent.trim()) {
            this.appendAssistantOutput(sessionId, streamState, {
              text: messageContent,
              generatedImages: [],
            });
            return;
          }
          const responseSummary = summarizeOpenAIToolPayload(responsePayload);
          if (Number(responseSummary.choiceCount) === 0 && responsePayload?.model) {
            throw new Error(
              `Provider does not appear to support tool completions for this request shape: usage-only response without assistant choices. summary=${JSON.stringify(responseSummary)}`
            );
          }
          console.warn(
            `[HttpSessionExecutor] Empty bounded-loop payload session=${sessionId} role=${resolveRuntimeAgentRoleKey(session.agentRoleKey)} model=${apiConfig.model} summary=${JSON.stringify(responseSummary)}`
          );
          throw new Error(`上游返回了空响应，未产出最终 assistant 内容。summary=${JSON.stringify(responseSummary)}`);
        }

        const { assistantText: preToolStatusText } = splitAssistantToolTraceSections(messageContent ?? '');
        if (preToolStatusText) {
          this.emitPreToolStatusMessage(sessionId, preToolStatusText, {
            toolCallCount: toolCalls.length,
          });
        }

        messages.push({
          role: 'assistant',
          content: messageContent,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const resolvedTool = toolDefinitions.find((entry) => entry.name === toolCall.function.name);
          const rawToolInput = tryParseJson(toolCall.function.arguments) ?? {};
          const toolInput = resolvedTool?.decorateInput
            ? resolvedTool.decorateInput(rawToolInput)
            : rawToolInput;
          this.emitToolUseMessage(sessionId, toolCall, toolInput);

          const toolName = toolCall.function.name || '';
          const currentInvocationCount = toolInvocationCounts.get(toolName) ?? 0;
          const perTurnLimit = PER_TURN_TOOL_LIMITS[toolName];
          if (perTurnLimit && currentInvocationCount >= perTurnLimit) {
            const limitedText = [
              'action=skip',
              'success=0',
              'reason=per-turn-tool-limit-reached',
              `tool=${toolName}`,
              `limit=${perTurnLimit}`,
              'hint=continue-with-final-answer',
            ].join('\n');
            this.emitToolResultMessage(sessionId, toolCall, limitedText, false);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: limitedText,
            });
            continue;
          }

          if (!resolvedTool) {
            const unsupportedText = `Unsupported executor tool: ${toolCall.function.name || '(empty)'}`;
            this.emitToolResultMessage(sessionId, toolCall, unsupportedText, true);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: unsupportedText,
            });
            continue;
          }

          toolInvocationCounts.set(toolName, currentInvocationCount + 1);
          const toolResult = await resolvedTool.handler(toolInput);
          this.emitToolResultMessage(sessionId, toolCall, toolResult.text, Boolean(toolResult.isError));
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult.text,
          });
        }
      }

      throw new Error(`工具回环超过 ${boundedLoopMaxSteps} 步，已按安全边界停止。`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchOpenAIChatCompletion(params: {
    apiConfig: DirectApiConfig;
    messages: OpenAIRequestMessage[];
    tools: Array<ExecutorToolDefinition['spec']>;
    toolChoice: 'auto' | 'required';
    signal: AbortSignal;
  }): Promise<any> {
    const request = buildToolCompletionRequest({
      apiConfig: params.apiConfig,
      messages: params.messages,
      tools: params.tools,
      toolChoice: params.toolChoice,
      maxTokens: DEFAULT_OPENAI_MAX_TOKENS,
    });
    console.info(
      `[HttpSessionExecutor] Tool completion request summary=${JSON.stringify(request.summary)}`
    );

    const response = await this.fetchUpstreamResponseWithSingleRetry(
      'tool completion',
      () => fetch(request.url, {
        ...request.init,
        signal: params.signal,
      }),
      params.signal,
    );

    if (!response.ok) {
      throw new Error(await buildUpstreamError(response));
    }

    const rawText = await response.text();
    console.info(
      `[HttpSessionExecutor] Tool completion raw body summary=${JSON.stringify(
        summarizeRawToolResponseBody(rawText)
      )}`
    );
    const payload = parseToolCompletionResponseBody(rawText);
    console.info(
      `[HttpSessionExecutor] Tool completion payload role=${params.apiConfig.agentRoleKey} model=${params.apiConfig.model} summary=${JSON.stringify(
        summarizeOpenAIToolPayload(payload)
      )}`
    );
    return payload;
  }

  private async buildOpenAIRequestMessages(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string
  ): Promise<OpenAIRequestMessage[]> {
    return await this.buildOpenAIMessages(session, systemPrompt);
  }

  private emitToolUseMessage(sessionId: string, toolCall: OpenAIToolCall, toolInput: Record<string, unknown>): void {
    const toolUseMessage = this.store.addMessage(sessionId, {
      type: 'tool_use',
      content: '',
      metadata: {
        toolName: toolCall.function.name,
        toolInput,
        toolUseId: toolCall.id,
      },
    });
    emitSessionMessage(sessionId, toolUseMessage);
  }

  private emitToolResultMessage(
    sessionId: string,
    toolCall: OpenAIToolCall,
    text: string,
    isError: boolean
  ): void {
    const toolResultMessage = this.store.addMessage(sessionId, {
      type: 'tool_result',
      content: text,
      metadata: {
        toolName: toolCall.function.name,
        toolResult: text,
        toolUseId: toolCall.id,
        isError,
        ...(isError ? { error: text } : {}),
      },
    });
    emitSessionMessage(sessionId, toolResultMessage);
  }

  private buildExecutorTools(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    prompt: string,
    options: Pick<TurnOptions, 'zenMode'> = {}
  ): ExecutorToolDefinition[] {
    // {BUG} bug-tool-surface-routing-001
    // {说明} 当前回合 agent 真正能看到哪些工具，是从这里收口的。
    // {波及} 任何“为什么突然带了某个能力 / 为什么工具用错了”的问题，都先查这里，再查 app_config 与 role 房间清单。
    const roleKey = resolveRuntimeAgentRoleKey(session.agentRoleKey);
    const attachmentContext = buildAttachmentRuntimeContext(prompt);
    const allowMemoryUserEdits = this.promptLikelyNeedsMemoryTool(prompt);
    const nativeCapabilityContext = {
      roleKey,
      appConfig: this.configStore.get<Record<string, unknown>>('app_config') as Record<string, unknown> | null,
      readCurrentBrowserPage: () => readCurrentBrowserEyesStateFromConfigStore(this.configStore),
    };

    const tools: ExecutorToolDefinition[] = [
      {
        name: 'conversation_search',
        spec: {
          type: 'function',
          function: {
            name: 'conversation_search',
            description: 'Search prior conversations by query and return compact <chat> blocks.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                max_results: { type: 'integer', minimum: 1, maximum: 10 },
                before: { type: 'string' },
                after: { type: 'string' },
              },
              required: ['query'],
              additionalProperties: false,
            },
          },
        },
        handler: async (args: {
          query: string;
          max_results?: number;
          before?: string;
          after?: string;
        }) => ({
          text: this.runConversationSearchTool(args, {
            agentRoleKey: session.agentRoleKey,
          }),
        }),
      },
      {
        name: 'recent_chats',
        spec: {
          type: 'function',
          function: {
            name: 'recent_chats',
            description: 'List recent chats for the current role bucket and return compact <chat> blocks.',
            parameters: {
              type: 'object',
              properties: {
                n: { type: 'integer', minimum: 1, maximum: 20 },
                sort_order: { type: 'string', enum: ['asc', 'desc'] },
                before: { type: 'string' },
                after: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        handler: async (args: {
          n?: number;
          sort_order?: 'asc' | 'desc';
          before?: string;
          after?: string;
        }) => ({
          text: this.runRecentChatsTool(args, {
            agentRoleKey: session.agentRoleKey,
          }),
        }),
      },
    ];

    if (!options.zenMode) {
      tools.push({
        name: 'broadcast_board_write',
        spec: {
          type: 'function',
          function: {
            name: 'broadcast_board_write',
            description: 'Write a short baton note to the 24h broadcast board for your same-role future self. Use for key requirements, decisions, fixes, pitfalls, or next-step handoff.',
            parameters: {
              type: 'object',
              properties: {
                content: { type: 'string', minLength: 1, maxLength: 400 },
              },
              required: ['content'],
              additionalProperties: false,
            },
          },
        },
        handler: async (args: { content: string }) => this.runBroadcastBoardWriteTool(args, session),
      });
    }

    if (attachmentContext.attachments.length > 0) {
      tools.push({
        name: 'attachment_manifest',
        spec: {
          type: 'function',
          function: {
            name: 'attachment_manifest',
            description: 'List attachment sources and part counts for the current turn. Use this when the user uploaded chunked or multiple files and you need a grounded manifest before reading.',
            parameters: {
              type: 'object',
              properties: {
                source_name: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        decorateInput: (args: Record<string, unknown>) => decorateAttachmentManifestInput(attachmentContext, args),
        handler: async (args: { source_name?: string }) => ({
          text: buildAttachmentManifestText(
            attachmentContext,
            typeof args.source_name === 'string' ? args.source_name.trim() : undefined
          ),
        }),
      });

      tools.push({
        name: 'attachment_read',
        spec: {
          type: 'function',
          function: {
            name: 'attachment_read',
            description: 'Read one attachment or one attachment part from the current turn. Use source_name + part_number for chunked files, or file_path for one exact file.',
            parameters: {
              type: 'object',
              properties: {
                source_name: { type: 'string' },
                file_path: { type: 'string' },
                part_number: { type: 'integer', minimum: 1 },
                max_characters: { type: 'integer', minimum: 1000, maximum: 24000 },
              },
              additionalProperties: false,
            },
          },
        },
        decorateInput: (args: Record<string, unknown>) => decorateAttachmentReadInput(attachmentContext, args),
        handler: async (args: {
          source_name?: string;
          file_path?: string;
          part_number?: number;
          max_characters?: number;
        }) => ({
          text: formatAttachmentReadResult(await readAttachmentText(attachmentContext, args)),
        }),
      });
    }

    if (this.store.getConfig().memoryEnabled && allowMemoryUserEdits) {
      tools.push({
        name: 'memory_user_edits',
        spec: {
          type: 'function',
          function: {
            name: 'memory_user_edits',
            description: 'Manage user memories. action=list|add|update|delete.',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['list', 'add', 'update', 'delete'] },
                id: { type: 'string' },
                text: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                status: { type: 'string', enum: ['created', 'stale', 'deleted'] },
                is_explicit: { type: 'boolean' },
                limit: { type: 'integer', minimum: 1, maximum: 200 },
                query: { type: 'string' },
              },
              required: ['action'],
              additionalProperties: false,
            },
          },
        },
        handler: async (args: {
          action: 'list' | 'add' | 'update' | 'delete';
          id?: string;
          text?: string;
          confidence?: number;
          status?: 'created' | 'stale' | 'deleted';
          is_explicit?: boolean;
          limit?: number;
          query?: string;
        }) => this.runMemoryUserEditsTool(args, {
          agentRoleKey: session.agentRoleKey,
          modelId: session.modelId,
        }),
      });
    }

    tools.push(...(
      createNativeCapabilitySdkTools((name, description, schema, handler) => ({
        name,
        spec: {
          type: 'function' as const,
          function: {
            name,
            description,
            parameters: normalizeToolParametersSchema(
              z.toJSONSchema(z.object(schema as Record<string, z.ZodTypeAny>), {
                target: 'draft-7',
                io: 'input',
              }) as Record<string, unknown>
            ),
          },
        },
        handler: async (args: any) => {
          const result = await handler(args);
          return {
            text: extractToolResultText(result),
            isError: Boolean(result?.isError),
          };
        },
      }), nativeCapabilityContext) as ExecutorToolDefinition[]
    ));

    return tools;
  }

  private formatChatSearchOutput(records: Array<{
    url: string;
    updatedAt: number;
    title: string;
    human: string;
    assistant: string;
  }>): string {
    if (records.length === 0) {
      return 'No matching chats found.';
    }

    return records.map((record) => {
      const updatedAtIso = new Date(record.updatedAt || Date.now()).toISOString();
      return [
        `<chat url="${escapeXml(record.url)}" updated_at="${updatedAtIso}">`,
        `Title: ${record.title || 'Untitled'}`,
        `Human: ${(record.human || '').trim() || '(empty)'}`,
        `Assistant: ${(record.assistant || '').trim() || '(empty)'}`,
        '</chat>',
      ].join('\n');
    }).join('\n\n');
  }

  private formatMemoryUserEditsResult(input: {
    action: 'list' | 'add' | 'update' | 'delete';
    successCount: number;
    failedCount: number;
    changedIds: string[];
    reason?: string;
    payload?: string;
  }): string {
    const parts = [
      `action=${input.action}`,
      `success=${input.successCount}`,
      `failed=${input.failedCount}`,
      `changed_ids=${input.changedIds.join(',') || '-'}`,
    ];
    if (input.reason) {
      parts.push(`reason=${input.reason}`);
    }
    if (input.payload) {
      parts.push(input.payload);
    }
    return parts.join('\n');
  }

  private runConversationSearchTool(args: {
    query: string;
    max_results?: number;
    before?: string;
    after?: string;
  }, identity?: { agentRoleKey?: string }): string {
    const chats = this.store.conversationSearch({
      query: args.query,
      maxResults: args.max_results,
      before: args.before,
      after: args.after,
      agentRoleKey: identity?.agentRoleKey,
    });
    return this.formatChatSearchOutput(chats);
  }

  private runRecentChatsTool(args: {
    n?: number;
    sort_order?: 'asc' | 'desc';
    before?: string;
    after?: string;
  }, identity?: { agentRoleKey?: string }): string {
    const chats = this.store.recentChats({
      n: args.n,
      sortOrder: args.sort_order,
      before: args.before,
      after: args.after,
      agentRoleKey: identity?.agentRoleKey,
    });
    return this.formatChatSearchOutput(chats);
  }

  private async runBroadcastBoardWriteTool(
    args: { content: string },
    session: NonNullable<ReturnType<CoworkStore['getSession']>>
  ): Promise<{ text: string; isError: boolean }> {
    const agentRoleKey = session.agentRoleKey?.trim();
    const content = String(args.content || '').trim();
    if (!agentRoleKey) {
      return {
        text: 'action=write\nsuccess=0\nreason=missing agentRoleKey',
        isError: true,
      };
    }
    if (!content) {
      return {
        text: 'action=write\nsuccess=0\nreason=empty content',
        isError: true,
      };
    }

    const channelHint = this.inferIdentityThreadChannelHint(session);
    appendToIdentityThread(
      this.store.getDatabase(),
      agentRoleKey,
      {
        role: 'assistant',
        content,
      },
      channelHint
    );
    this.store.getSaveFunction()();

    return {
      text: [
        'action=write',
        'success=1',
        `role=${agentRoleKey}`,
        `channel=${channelHint}`,
        `content=${content}`,
      ].join('\n'),
      isError: false,
    };
  }

  private inferIdentityThreadChannelHint(
    session: Pick<NonNullable<ReturnType<CoworkStore['getSession']>>, 'systemPrompt' | 'title' | 'sourceType'>
  ): string {
    if (session.sourceType === 'desktop') {
      return 'desktop';
    }
    if (session.sourceType === 'external') {
      const scope = session.systemPrompt?.trim() ?? '';
      if (
        scope.startsWith('im:feishu:chat:')
        || scope.startsWith('im:feishu:ws:')
        || scope.startsWith('im:feishu:app:')
      ) {
        return 'feishu';
      }
      if (scope.startsWith('im:dingtalk:chat:')) {
        return 'dingtalk';
      }
      if (scope.startsWith('im:wechatbot:user:')) {
        return 'wechatbot';
      }
      return 'external';
    }

    const scope = session.systemPrompt?.trim() ?? '';
    if (
      scope.startsWith('im:feishu:chat:')
      || scope.startsWith('im:feishu:ws:')
      || scope.startsWith('im:feishu:app:')
    ) {
      return 'feishu';
    }
    if (scope.startsWith('im:dingtalk:chat:')) {
      return 'dingtalk';
    }
    if (scope.startsWith('im:wechatbot:user:')) {
      return 'wechatbot';
    }

    const title = session.title?.trim() ?? '';
    if (title.endsWith(' - 飞书对话')) {
      return 'feishu';
    }
    if (title.endsWith(' - 钉钉对话')) {
      return 'dingtalk';
    }

    return 'desktop';
  }

  private runMemoryUserEditsTool(args: {
    action: 'list' | 'add' | 'update' | 'delete';
    id?: string;
    text?: string;
    confidence?: number;
    status?: 'created' | 'stale' | 'deleted';
    is_explicit?: boolean;
    limit?: number;
    query?: string;
  }, identity?: { agentRoleKey?: string; modelId?: string }): { text: string; isError: boolean } {
    if (args.action === 'list') {
      const entries = this.store.listUserMemories({
        query: args.query,
        status: 'all',
        includeDeleted: true,
        limit: args.limit ?? 20,
        offset: 0,
        agentRoleKey: identity?.agentRoleKey,
      });
      const payload = entries.length === 0
        ? 'memories=(empty)'
        : entries
          .map((entry) => `${entry.id} | ${entry.status} | explicit=${entry.isExplicit ? 1 : 0} | ${entry.text}`)
          .join('\n');
      return {
        text: this.formatMemoryUserEditsResult({
          action: 'list',
          successCount: entries.length,
          failedCount: 0,
          changedIds: entries.map((entry) => entry.id),
          payload,
        }),
        isError: false,
      };
    }

    if (args.action === 'add') {
      const text = String(args.text || '').trim();
      if (!text) {
        return {
          text: this.formatMemoryUserEditsResult({
            action: 'add',
            successCount: 0,
            failedCount: 1,
            changedIds: [],
            reason: 'text is required',
          }),
          isError: true,
        };
      }
      const entry = this.store.createUserMemory({
        text,
        confidence: args.confidence,
        isExplicit: args.is_explicit ?? true,
        agentRoleKey: identity?.agentRoleKey,
        modelId: identity?.modelId,
      });
      return {
        text: this.formatMemoryUserEditsResult({
          action: 'add',
          successCount: 1,
          failedCount: 0,
          changedIds: [entry.id],
        }),
        isError: false,
      };
    }

    if (args.action === 'update') {
      if (!args.id?.trim()) {
        return {
          text: this.formatMemoryUserEditsResult({
            action: 'update',
            successCount: 0,
            failedCount: 1,
            changedIds: [],
            reason: 'id is required',
          }),
          isError: true,
        };
      }
      const updated = this.store.updateUserMemory({
        id: args.id.trim(),
        text: args.text,
        confidence: args.confidence,
        status: args.status,
        isExplicit: args.is_explicit,
      });
      if (!updated) {
        return {
          text: this.formatMemoryUserEditsResult({
            action: 'update',
            successCount: 0,
            failedCount: 1,
            changedIds: [],
            reason: 'memory not found',
          }),
          isError: true,
        };
      }
      return {
        text: this.formatMemoryUserEditsResult({
          action: 'update',
          successCount: 1,
          failedCount: 0,
          changedIds: [updated.id],
        }),
        isError: false,
      };
    }

    if (!args.id?.trim()) {
      return {
        text: this.formatMemoryUserEditsResult({
          action: 'delete',
          successCount: 0,
          failedCount: 1,
          changedIds: [],
          reason: 'id is required',
        }),
        isError: true,
      };
    }

    const deleted = this.store.deleteUserMemory(args.id.trim());
    return deleted
      ? {
        text: this.formatMemoryUserEditsResult({
          action: 'delete',
          successCount: 1,
          failedCount: 0,
          changedIds: [args.id.trim()],
        }),
        isError: false,
      }
      : {
        text: this.formatMemoryUserEditsResult({
          action: 'delete',
          successCount: 0,
          failedCount: 1,
          changedIds: [],
          reason: 'memory not found',
        }),
        isError: true,
      };
  }

  private async runOpenAIStream(
    sessionId: string,
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string,
    apiConfig: DirectApiConfig,
    streamState: StreamState,
    signal: AbortSignal
  ): Promise<void> {
    // {BREAKPOINT} DIRECT-EXECUTOR-SINGLE-SHOT
    // {FLOW} PHASE1-DIRECT-ONE-SHOT: 当前轻执行器这里只发起一次 openai-compatible chat completion，
    // 不做 assistant->tool->assistant 多轮代理循环，因此单个用户 turn 最终只会产出一个 assistant 消息。
    // {FLOW} PHASE1-NO-AUTO-TOOL-LOOP: browser eyes / IMA / MCP 若未命中 direct turn，则不会在这里自动进入工具回路。
    const messages = await this.buildOpenAIMessages(session, systemPrompt);
    const requestHash = buildTurnCacheKey({
      agentRoleKey: resolveIdentityAgentRoleKey(session.agentRoleKey),
      baseURL: apiConfig.baseURL,
      model: apiConfig.model,
      messages,
    });
    const cachedTurn = getTurnCacheEntry({
      db: this.store.getDatabase(),
      saveDb: this.store.getSaveFunction(),
      requestHash,
    });
    if (cachedTurn) {
      console.info(`[TurnCache] HIT session=${sessionId} role=${resolveIdentityAgentRoleKey(session.agentRoleKey)} model=${apiConfig.model}`);
      await this.replayCachedAssistantText(sessionId, streamState, cachedTurn.assistantText, signal);
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiConfig.apiKey.trim()) {
      headers.Authorization = `Bearer ${apiConfig.apiKey.trim()}`;
    }

    const response = await this.fetchUpstreamResponseWithSingleRetry(
      'openai stream',
      () => fetch(buildOpenAIChatCompletionsURL(apiConfig.baseURL), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: apiConfig.model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: DEFAULT_OPENAI_MAX_TOKENS,
          messages,
        }),
        signal,
      }),
      signal,
    );

    if (!response.ok) {
      throw new Error(await buildUpstreamError(response));
    }

    await consumeSSE(response, (payload) => {
      if (payload === '[DONE]') {
        return;
      }
      const parsed = tryParseJson(payload);
      const usageMetadata = extractUsageMetadata(parsed);
      if (usageMetadata) {
        streamState.metadata = {
          ...(streamState.metadata || {}),
          ...usageMetadata,
        };
      }
      const output = extractAssistantOutput(parsed);
      if (output.text || output.generatedImages.length > 0) {
        this.appendAssistantOutput(sessionId, streamState, output);
      }
    }, signal);

    if (streamState.content.trim()) {
      putTurnCacheEntry({
        db: this.store.getDatabase(),
        saveDb: this.store.getSaveFunction(),
        requestHash,
        agentRoleKey: resolveIdentityAgentRoleKey(session.agentRoleKey),
        baseURL: apiConfig.baseURL,
        model: apiConfig.model,
        assistantText: streamState.content,
      });
      console.info(`[TurnCache] STORE session=${sessionId} role=${resolveIdentityAgentRoleKey(session.agentRoleKey)} model=${apiConfig.model}`);
    }
  }

  private async runGoogleGenerateContent(
    sessionId: string,
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string,
    apiConfig: DirectApiConfig,
    streamState: StreamState,
    signal: AbortSignal
  ): Promise<void> {
    const requestBody = await this.buildGoogleGenerateContentRequest(session, systemPrompt);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiConfig.apiKey.trim()) {
      headers.Authorization = `Bearer ${apiConfig.apiKey.trim()}`;
    }

    const response = await this.fetchUpstreamResponseWithSingleRetry(
      'google generateContent',
      () => fetch(buildGoogleGenerateContentURL(apiConfig.baseURL, apiConfig.model, apiConfig.apiKey), {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal,
      }),
      signal,
    );

    if (!response.ok) {
      throw new Error(await buildUpstreamError(response));
    }

    const parsed = await response.json().catch(() => null);
    const output = extractAssistantOutput(parsed);
    if (output.text || output.generatedImages.length > 0) {
      this.appendAssistantOutput(sessionId, streamState, output);
    }
  }

  private async runOpenAIImagesGeneration(
    sessionId: string,
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string,
    apiConfig: DirectApiConfig,
    streamState: StreamState,
    signal: AbortSignal
  ): Promise<void> {
    const requestBody = await this.buildOpenAIImagesGenerationRequest(session, systemPrompt);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiConfig.apiKey.trim()) {
      headers.Authorization = `Bearer ${apiConfig.apiKey.trim()}`;
    }

    const response = await this.fetchUpstreamResponseWithSingleRetry(
      'images generation',
      () => fetch(buildOpenAIImagesGenerationURL(apiConfig.baseURL), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: apiConfig.model,
          ...requestBody,
        }),
        signal,
      }),
      signal,
    );

    if (!response.ok) {
      throw new Error(await buildUpstreamError(response));
    }

    const parsed = await response.json().catch(() => null);
    const output = extractAssistantOutput(parsed);
    if (output.generatedImages.length > 0 && !output.text) {
      output.text = '已生成图片。';
    }
    if (output.text || output.generatedImages.length > 0) {
      this.appendAssistantOutput(sessionId, streamState, output);
    }
  }

  private appendAssistantOutput(sessionId: string, streamState: StreamState, output: AssistantOutput): void {
    if (!output.text && output.generatedImages.length === 0) {
      return;
    }

    if (!streamState.messageId) {
      const initialGeneratedImages = output.generatedImages.length > 0 ? output.generatedImages : undefined;
      const message = this.store.addMessage(sessionId, {
        type: 'assistant',
        content: '',
        metadata: {
          stage: 'final_result',
          isStreaming: true,
          isFinal: false,
          ...(initialGeneratedImages ? { generatedImages: initialGeneratedImages } : {}),
        },
      });
      streamState.messageId = message.id;
      emitSessionMessage(sessionId, message);
    }

    if (output.text) {
      streamState.content += output.text;
    }
    if (output.generatedImages.length > 0) {
      for (const image of output.generatedImages) {
        const dedupeKey = buildGeneratedImageKey(image);
        if (streamState.generatedImageKeys.has(dedupeKey)) {
          continue;
        }
        streamState.generatedImageKeys.add(dedupeKey);
        streamState.generatedImages.push(image);
      }
    }
    const metadata: CoworkMessageMetadata = {
      ...(streamState.metadata || {}),
      stage: 'final_result',
      isStreaming: true,
      isFinal: false,
      ...(streamState.generatedImages.length > 0 ? { generatedImages: streamState.generatedImages } : {}),
    };
    streamState.metadata = metadata;
    this.store.updateMessage(sessionId, streamState.messageId, {
      content: streamState.content,
      metadata,
    });
    emitSessionMessageUpdate(sessionId, streamState.messageId, streamState.content);
  }

  private async replayCachedAssistantText(
    sessionId: string,
    streamState: StreamState,
    content: string,
    signal: AbortSignal
  ): Promise<void> {
    if (!content.trim()) {
      return;
    }

    streamState.metadata = {
      ...(streamState.metadata || {}),
      cacheHit: true,
      cacheSource: 'turn_cache',
    };

    for (const chunk of splitTextForReplay(content)) {
      if (signal.aborted) {
        return;
      }
      this.appendAssistantOutput(sessionId, streamState, {
        text: chunk,
        generatedImages: [],
      });
      await sleep(CACHE_REPLAY_CHUNK_DELAY_MS);
    }
  }

  private finishAssistantMessage(sessionId: string, streamState: StreamState): void {
    if (!streamState.messageId) {
      return;
    }

    const { assistantText, traceText } = splitAssistantToolTraceSections(streamState.content);
    const metadata: CoworkMessageMetadata = {
      ...(streamState.metadata || {}),
      stage: 'final_result',
      isStreaming: false,
      isFinal: true,
      ...(streamState.generatedImages.length > 0 ? { generatedImages: streamState.generatedImages } : {}),
    };
    this.store.updateMessage(sessionId, streamState.messageId, {
      content: assistantText,
      metadata,
    });
    emitSessionMessageUpdate(sessionId, streamState.messageId, assistantText);

    void traceText;
  }

  private async buildOpenAIMessages(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string
  ): Promise<OpenAIMessage[]> {
    // 【1.0链路】RAW-CONTEXT-3: 原始对话正文只向上游转发最近 3 条，其余依赖广播板共享记忆和系统提示承接。
    const messages: OpenAIMessage[] = [];
    if (systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    const rawConversation = (await Promise.all(
      session.messages.map((message) => normalizeConversationMessage(message))
    ))
      .filter((message): message is OpenAIMessage => Boolean(message));

    // Keep only the latest raw conversation messages. Shared memory and baton
    // continuity are injected through the system prompt, not through full-chat replay.
    for (const message of rawConversation.slice(-FORWARDED_RAW_CONTEXT_MESSAGE_LIMIT)) {
      messages.push(message);
    }

    return messages;
  }

  private async buildGoogleGenerateContentRequest(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string
  ): Promise<Record<string, unknown>> {
    const openAIMessages = await this.buildOpenAIMessages(session, '');
    const contents = openAIMessages
      .filter((message) => message.role !== 'system')
      .map(convertOpenAIMessageToGoogleContent)
      .filter((message): message is Record<string, unknown> => Boolean(message));

    const requestBody: Record<string, unknown> = {
      contents,
    };

    if (systemPrompt.trim()) {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt.trim() }],
      };
    }

    return requestBody;
  }

  private async buildOpenAIImagesGenerationRequest(
    session: NonNullable<ReturnType<CoworkStore['getSession']>>,
    systemPrompt: string
  ): Promise<Record<string, unknown>> {
    const latestUserMessage = [...session.messages].reverse().find((message) => message.type === 'user');
    const userPrompt = latestUserMessage
      ? await inlineAttachmentContent(latestUserMessage.content, extractImageAttachments(latestUserMessage.metadata).length > 0)
      : '';
    const imageAttachments = latestUserMessage ? extractImageAttachments(latestUserMessage.metadata) : [];
    const prompt = [systemPrompt.trim(), userPrompt.trim()].filter(Boolean).join('\n\n');
    const requestBody: Record<string, unknown> = {
      prompt,
    };

    if (imageAttachments.length === 1) {
      requestBody.image = `data:${imageAttachments[0].mimeType};base64,${imageAttachments[0].base64Data}`;
    } else if (imageAttachments.length > 1) {
      requestBody.image = imageAttachments.map((attachment) => `data:${attachment.mimeType};base64,${attachment.base64Data}`);
    }

    return requestBody;
  }

}

let webSessionExecutor: HttpSessionExecutor | null = null;

export function getOrCreateWebSessionExecutor(params: {
  store: CoworkStore;
  configStore: SqliteStore;
  buildSelectedSkillsPrompt?: SkillPromptBuilder | null;
}): HttpSessionExecutor {
  // {FLOW} CONTINUITY-TRUNK-WEB-EXECUTOR-SINGLETON
  // {BREAKPOINT} continuity-route-start-001
  if (!webSessionExecutor) {
    webSessionExecutor = new HttpSessionExecutor(
      params.store,
      params.configStore,
      params.buildSelectedSkillsPrompt ?? null
    );
  }
  return webSessionExecutor;
}

type StreamState = {
  messageId: string | null;
  content: string;
  metadata: CoworkMessageMetadata | null;
  generatedImages: GeneratedImage[];
  generatedImageKeys: Set<string>;
};

function createStreamState(): StreamState {
  return {
    messageId: null,
    content: '',
    metadata: null,
    generatedImages: [],
    generatedImageKeys: new Set<string>(),
  };
}

function splitTextForReplay(content: string): string[] {
  if (content.length <= CACHE_REPLAY_CHUNK_SIZE) {
    return [content];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    let next = Math.min(cursor + CACHE_REPLAY_CHUNK_SIZE, content.length);
    while (
      next < content.length &&
      next > cursor + Math.floor(CACHE_REPLAY_CHUNK_SIZE / 2) &&
      !/[\s,.!?;:，。！？；：]/.test(content[next - 1] || '')
    ) {
      next -= 1;
    }
    if (next <= cursor) {
      next = Math.min(cursor + CACHE_REPLAY_CHUNK_SIZE, content.length);
    }
    chunks.push(content.slice(cursor, next));
    cursor = next;
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const TOOL_TRACE_SECTION_START_RE = /^Tool call:/i;
const TOOL_TRACE_SECTION_DETAIL_RE = /^(?:[\u2022*-]\s+|Path:|•\s+|[-*]\s+)/i;

function splitAssistantToolTraceSections(content: string): {
  assistantText: string;
  traceText: string | null;
} {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return {
      assistantText: '',
      traceText: null,
    };
  }

  const sections = normalized
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  const assistantSections: string[] = [];
  const traceSections: string[] = [];

  for (const section of sections) {
    const lines = section
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const isToolTrace = lines.length > 0
      && lines.some((line) => TOOL_TRACE_SECTION_START_RE.test(line))
      && lines.every((line) => TOOL_TRACE_SECTION_START_RE.test(line) || TOOL_TRACE_SECTION_DETAIL_RE.test(line));

    if (isToolTrace) {
      traceSections.push(section);
      continue;
    }

    assistantSections.push(section);
  }

  return {
    assistantText: assistantSections.join('\n\n').trim(),
    traceText: traceSections.length > 0 ? traceSections.join('\n\n') : null,
  };
}

async function normalizeConversationMessage(message: CoworkMessage): Promise<OpenAIMessage | null> {
  // {标记} P1-ATTACHMENT-PARSE: 本地聊天主链在这里把“输入文件: 路径”展开成可直接送模型的提取文本。
  const imageAttachments = extractImageAttachments(message.metadata);
  const normalizedUserContent = message.type === 'user'
    ? await inlineAttachmentContent(message.content, imageAttachments.length > 0)
    : message.content;

  if (!normalizedUserContent?.trim() && imageAttachments.length === 0) {
    return null;
  }

  if (message.type === 'user') {
    if (imageAttachments.length > 0) {
      const contentBlocks: OpenAIMessage['content'] = [];
      if (normalizedUserContent?.trim()) {
        contentBlocks.push({
          type: 'text',
          text: normalizedUserContent,
        });
      }
      for (const attachment of imageAttachments) {
        if (!attachment.base64Data?.trim() || !attachment.mimeType?.trim()) {
          continue;
        }
        contentBlocks.push({
          type: 'image_url',
          image_url: {
            url: `data:${attachment.mimeType};base64,${attachment.base64Data}`,
          },
        });
      }
      if (contentBlocks.length === 0) {
        return null;
      }
      return { role: 'user', content: contentBlocks };
    }

    return { role: 'user', content: normalizedUserContent };
  }

  if (message.type === 'assistant' && !message.metadata?.isThinking) {
    const stage = typeof message.metadata?.stage === 'string'
      ? message.metadata.stage.trim()
      : '';
    // 只把正式回复带回上游历史；pre_tool / tool_trace 这类过程 assistant 不能污染后续上下文。
    if (!stage || stage === 'final_result') {
      return { role: 'assistant', content: message.content };
    }
  }

  return null;
}

function convertOpenAIMessageToGoogleContent(message: OpenAIMessage): Record<string, unknown> | null {
  const parts: Array<Record<string, unknown>> = [];

  if (typeof message.content === 'string') {
    if (message.content.trim()) {
      parts.push({ text: message.content.trim() });
    }
  } else {
    for (const part of message.content) {
      if (part.type === 'text') {
        if (part.text.trim()) {
          parts.push({ text: part.text.trim() });
        }
        continue;
      }

      if (part.type === 'image_url') {
        const dataUrlPayload = parseDataUrl(part.image_url.url);
        if (dataUrlPayload) {
          parts.push({
            inline_data: {
              mime_type: dataUrlPayload.mimeType,
              data: dataUrlPayload.base64Data,
            },
          });
        } else if (part.image_url.url.trim()) {
          parts.push({ text: `参考图片: ${part.image_url.url.trim()}` });
        }
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts,
  };
}

async function consumeSSE(
  response: Response,
  onPacket: (payload: string, eventName: string) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) {
    throw new Error('Upstream returned empty stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal.aborted) {
      return;
    }

    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = findSseBoundary(buffer);
    while (boundary) {
      const packet = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      const parsed = parseSSEPacket(packet);
      if (parsed) {
        onPacket(parsed.payload, parsed.event);
      }
      boundary = findSseBoundary(buffer);
    }
  }

  if (buffer.trim()) {
    const parsed = parseSSEPacket(buffer);
    if (parsed) {
      onPacket(parsed.payload, parsed.event);
    }
  }
}

function parseSSEPacket(packet: string): { event: string; payload: string } | null {
  const lines = packet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  let event = 'message';
  const dataParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trim());
    }
  }

  if (dataParts.length === 0) {
    return null;
  }

  return {
    event,
    payload: dataParts.join('\n'),
  };
}

function findSseBoundary(buffer: string): { index: number; length: number } | null {
  const lfBoundary = buffer.indexOf('\n\n');
  const crlfBoundary = buffer.indexOf('\r\n\r\n');

  if (lfBoundary === -1 && crlfBoundary === -1) {
    return null;
  }

  if (lfBoundary === -1) {
    return { index: crlfBoundary, length: 4 };
  }

  if (crlfBoundary === -1) {
    return { index: lfBoundary, length: 2 };
  }

  return lfBoundary < crlfBoundary
    ? { index: lfBoundary, length: 2 }
    : { index: crlfBoundary, length: 4 };
}

function tryParseJson(payload: string): any {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function parseToolCompletionResponseBody(rawText: string): any {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) {
    return null;
  }

  const directPayload = tryParseJson(trimmed);
  if (directPayload) {
    return directPayload;
  }

  const ssePayloads = extractSsePayloads(trimmed)
    .map((payload) => tryParseJson(payload))
    .filter(Boolean);

  if (ssePayloads.length === 0) {
    return null;
  }

  if (ssePayloads.length === 1) {
    return ssePayloads[0];
  }

  return synthesizePayloadFromSseChunks(ssePayloads);
}

function extractSsePayloads(rawText: string): string[] {
  const payloads: string[] = [];
  let buffer = rawText;

  while (buffer.length > 0) {
    const boundary = findSseBoundary(buffer);
    if (!boundary) {
      const parsedTail = parseSSEPacket(buffer);
      if (parsedTail) {
        payloads.push(parsedTail.payload);
      }
      break;
    }

    const packet = buffer.slice(0, boundary.index);
    buffer = buffer.slice(boundary.index + boundary.length);
    const parsed = parseSSEPacket(packet);
    if (parsed) {
      payloads.push(parsed.payload);
    }
  }

  return payloads.filter((payload) => payload && payload !== '[DONE]');
}

function synthesizePayloadFromSseChunks(chunks: any[]): any {
  const toolCalls = new Map<number, {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>();
  let id: string | null = null;
  let model: string | null = null;
  let finishReason: string | null = null;
  let usage: Record<string, unknown> | null = null;
  let assistantContent = '';
  let directMessageContent: unknown = null;

  for (const chunk of chunks) {
    if (!id && typeof chunk?.id === 'string' && chunk.id.trim()) {
      id = chunk.id.trim();
    }
    if (!model && typeof chunk?.model === 'string' && chunk.model.trim()) {
      model = chunk.model.trim();
    }
    if (chunk?.usage && typeof chunk.usage === 'object') {
      usage = chunk.usage as Record<string, unknown>;
    }

    const firstChoice = Array.isArray(chunk?.choices) ? chunk.choices[0] : null;
    if (!firstChoice || typeof firstChoice !== 'object') {
      continue;
    }

    if (typeof firstChoice.finish_reason === 'string' && firstChoice.finish_reason.trim()) {
      finishReason = firstChoice.finish_reason.trim();
    }

    const message = firstChoice.message;
    if (message && typeof message === 'object') {
      if (message.content !== undefined && message.content !== null) {
        directMessageContent = message.content;
      }
      const directToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const [index, toolCall] of directToolCalls.entries()) {
        mergeSseToolCallChunk(toolCalls, index, toolCall);
      }
    }

    const delta = firstChoice.delta;
    if (delta && typeof delta === 'object') {
      const deltaText = extractOpenAITextDelta({ choices: [{ delta }] });
      if (deltaText) {
        assistantContent += deltaText;
      }

      const deltaToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      for (const [fallbackIndex, toolCall] of deltaToolCalls.entries()) {
        const rawIndex = typeof toolCall?.index === 'number' && Number.isFinite(toolCall.index)
          ? toolCall.index
          : fallbackIndex;
        mergeSseToolCallChunk(toolCalls, rawIndex, toolCall);
      }
    }
  }

  const normalizedContent = directMessageContent ?? (assistantContent || null);
  const mergedToolCalls = Array.from(toolCalls.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, value]) => value)
    .filter((toolCall) => toolCall.function.name.trim());

  return {
    id,
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: normalizedContent,
        ...(mergedToolCalls.length > 0 ? { tool_calls: mergedToolCalls } : {}),
      },
      finish_reason: finishReason,
    }],
    ...(usage ? { usage } : {}),
  };
}

function mergeSseToolCallChunk(
  store: Map<number, {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>,
  index: number,
  chunk: any
): void {
  const existing = store.get(index) ?? {
    id: '',
    type: 'function' as const,
    function: {
      name: '',
      arguments: '',
    },
  };

  if (typeof chunk?.id === 'string' && chunk.id.trim()) {
    existing.id = chunk.id.trim();
  }

  if (typeof chunk?.function?.name === 'string' && chunk.function.name.trim()) {
    existing.function.name += chunk.function.name.trim();
  }

  if (typeof chunk?.function?.arguments === 'string' && chunk.function.arguments) {
    existing.function.arguments += chunk.function.arguments;
  }

  if (!existing.id) {
    existing.id = `sse_tool_call_${index}`;
  }
  if (!existing.function.arguments) {
    existing.function.arguments = '{}';
  }

  store.set(index, existing);
}

function abortReasonToError(reason: unknown, fallbackMessage: string): Error {
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === 'string' && reason.trim()) {
    return new Error(reason);
  }
  return new Error(fallbackMessage);
}

function extractToolResultText(result: any): string {
  if (typeof result?.text === 'string' && result.text.trim()) {
    return result.text;
  }

  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content
    .map((item) => {
      if (typeof item?.text === 'string') {
        return item.text;
      }
      if (typeof item === 'string') {
        return item;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) {
    return text;
  }

  try {
    return JSON.stringify(result ?? null);
  } catch {
    return String(result ?? '');
  }
}

function normalizeToolParametersSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const next = { ...schema };
  delete next.$schema;
  return next;
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractOpenAITextDelta(payload: any): string {
  const delta = payload?.choices?.[0]?.delta;
  const content = delta?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (typeof item?.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function extractAssistantOutput(payload: any): AssistantOutput {
  const textChunks: string[] = [];
  const generatedImages: GeneratedImage[] = [];

  const pushText = (value: unknown): void => {
    if (typeof value === 'string' && value) {
      textChunks.push(value);
    }
  };

  const pushGeneratedImage = (image: GeneratedImage | null): void => {
    if (!image) {
      return;
    }
    generatedImages.push(image);
  };

  pushText(extractOpenAITextDelta(payload));

  const choiceDeltaContent = payload?.choices?.[0]?.delta?.content;
  if (Array.isArray(choiceDeltaContent)) {
    for (const part of choiceDeltaContent) {
      pushText(typeof part?.text === 'string' ? part.text : '');
      pushGeneratedImage(extractGeneratedImage(part));
    }
  }

  const choiceMessageContent = payload?.choices?.[0]?.message?.content;
  if (typeof choiceMessageContent === 'string') {
    pushText(choiceMessageContent);
  }
  if (Array.isArray(choiceMessageContent)) {
    for (const part of choiceMessageContent) {
      pushText(typeof part?.text === 'string' ? part.text : '');
      pushText(typeof part?.text?.value === 'string' ? part.text.value : '');
      pushText(typeof part?.content === 'string' ? part.content : '');
      pushGeneratedImage(extractGeneratedImage(part));
    }
  }

  if (Array.isArray(payload?.data)) {
    for (const item of payload.data) {
      pushGeneratedImage(extractGeneratedImage(item));
    }
  }

  if (Array.isArray(payload?.candidates)) {
    for (const candidate of payload.candidates) {
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts)) {
        continue;
      }
      for (const part of parts) {
        pushText(typeof part?.text === 'string' ? part.text : '');
        pushGeneratedImage(extractGeneratedImage(part));
      }
    }
  }

  pushText(extractTextFromResponsesOutput(payload?.output));

  const dedupedImages: GeneratedImage[] = [];
  const seen = new Set<string>();
  for (const image of generatedImages) {
    const key = buildGeneratedImageKey(image);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedImages.push(image);
  }

  return {
    text: textChunks.join(''),
    generatedImages: dedupedImages,
  };
}

function extractUsageMetadata(payload: any): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} | null {
  const usage = payload?.usage;
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const promptTokens = Number((usage as any).prompt_tokens);
  const completionTokens = Number((usage as any).completion_tokens);
  const totalTokens = Number((usage as any).total_tokens);

  const normalized: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } = {};

  if (Number.isFinite(promptTokens) && promptTokens >= 0) {
    normalized.promptTokens = promptTokens;
  }
  if (Number.isFinite(completionTokens) && completionTokens >= 0) {
    normalized.completionTokens = completionTokens;
  }
  if (Number.isFinite(totalTokens) && totalTokens >= 0) {
    normalized.totalTokens = totalTokens;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function extractGeneratedImage(value: unknown): GeneratedImage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const explicitUrl = typeof record.url === 'string' ? record.url.trim() : '';
  if (explicitUrl) {
    return {
      name: 'generated-image',
      url: explicitUrl,
    };
  }

  const b64Json = typeof record.b64_json === 'string' ? record.b64_json.trim() : '';
  if (b64Json) {
    return {
      name: 'generated-image',
      mimeType: 'image/png',
      base64Data: b64Json,
    };
  }

  const imageUrl = record.image_url;
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    const dataUrlPayload = parseDataUrl(imageUrl);
    if (dataUrlPayload) {
      return {
        name: 'generated-image',
        mimeType: dataUrlPayload.mimeType,
        base64Data: dataUrlPayload.base64Data,
      };
    }
    return {
      name: 'generated-image',
      url: imageUrl.trim(),
    };
  }

  if (imageUrl && typeof imageUrl === 'object') {
    const nestedUrl = typeof (imageUrl as Record<string, unknown>).url === 'string'
      ? ((imageUrl as Record<string, unknown>).url as string).trim()
      : '';
    if (nestedUrl) {
      const dataUrlPayload = parseDataUrl(nestedUrl);
      if (dataUrlPayload) {
        return {
          name: 'generated-image',
          mimeType: dataUrlPayload.mimeType,
          base64Data: dataUrlPayload.base64Data,
        };
      }
      return {
        name: 'generated-image',
        url: nestedUrl,
      };
    }
  }

  const inlineData = record.inline_data ?? record.inlineData;
  if (inlineData && typeof inlineData === 'object') {
    const inlineRecord = inlineData as Record<string, unknown>;
    const data = typeof inlineRecord.data === 'string' ? inlineRecord.data.trim() : '';
    const mimeType = typeof inlineRecord.mime_type === 'string'
      ? inlineRecord.mime_type.trim()
      : (typeof inlineRecord.mimeType === 'string' ? inlineRecord.mimeType.trim() : '');

    if (data) {
      return {
        name: 'generated-image',
        mimeType: mimeType || 'image/png',
        base64Data: data,
      };
    }
  }

  return null;
}

function buildGeneratedImageKey(image: GeneratedImage): string {
  return [
    image.name,
    image.mimeType || '',
    image.base64Data || '',
    image.url || '',
  ].join('|');
}

function parseDataUrl(value: string): { mimeType: string; base64Data: string } | null {
  const match = /^data:(.+?);base64,(.+)$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

function buildGoogleGenerateContentURL(baseURL: string, model: string, apiKey: string): string {
  const normalized = baseURL.trim().replace(/\/+$/, '');
  let url = normalized;

  if (!url) {
    url = `/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  } else if (url.includes(':generateContent')) {
    url = normalized;
  } else if (/\/v1beta\/models\/[^/]+$/i.test(url) || /\/v1\/models\/[^/]+$/i.test(url)) {
    url = `${url}:generateContent`;
  } else if (url.endsWith('/v1beta/models') || url.endsWith('/v1/models') || url.endsWith('/models')) {
    url = `${url}/${encodeURIComponent(model)}:generateContent`;
  } else if (url.endsWith('/v1beta') || url.endsWith('/v1')) {
    const betaBase = url.endsWith('/v1') ? `${url.slice(0, -3)}v1beta` : url;
    url = `${betaBase}/models/${encodeURIComponent(model)}:generateContent`;
  } else {
    url = `${url}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  }

  if (apiKey.trim() && !/[?&]key=/.test(url)) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}key=${encodeURIComponent(apiKey.trim())}`;
  }

  return url;
}

function buildOpenAIImagesGenerationURL(baseURL: string): string {
  const normalized = baseURL.trim().replace(/\/+$/, '');
  if (!normalized) {
    return '/v1/images/generations';
  }
  if (normalized.endsWith('/images/generations')) {
    return normalized;
  }
  if (/\/v\d+$/.test(normalized)) {
    return `${normalized}/images/generations`;
  }
  return `${normalized}/v1/images/generations`;
}

async function buildUpstreamError(response: Response): Promise<string> {
  const bodyText = await response.text().catch(() => '');
  const snippet = bodyText.trim().slice(0, 400);
  return snippet
    ? `Upstream request failed (${response.status}): ${snippet}`
    : `Upstream request failed (${response.status})`;
}

function isRetryableUpstreamStatus(status: number): boolean {
  return status === 408
    || status === 409
    || status === 425
    || status === 429
    || status === 500
    || status === 502
    || status === 503
    || status === 504;
}

function isRetryableUpstreamFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return false;
  }

  const normalized = `${error.name} ${error.message}`.toLowerCase();
  return /fetch failed|network|timeout|timed out|headers timeout|body timeout|econn|eai_again|enotfound|socket hang up|connection reset|connection refused|terminated|other side closed/i.test(
    normalized
  );
}

function resolveIdentityAgentRoleKey(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'organizer';
}

function resolveRuntimeAgentRoleKey(value: string | null | undefined): AgentRoleKey {
  // {标记} P0-IDENTITY-BOUNDARY: 这里只做 4 主角色 runtime 配置解析，不代表 session / memory / thread 的真实身份。
  if (value === 'writer' || value === 'designer' || value === 'analyst') {
    return value;
  }
  return 'organizer';
}

function extractImageAttachments(metadata: CoworkMessageMetadata | null | undefined): ImageAttachment[] {
  const raw = metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>).imageAttachments
    : undefined;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : 'image';
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType : '';
    const base64Data = typeof record.base64Data === 'string' ? record.base64Data : '';
    if (!mimeType || !base64Data) {
      return [];
    }
    return [{
      name,
      mimeType,
      base64Data,
    }];
  });
}

function isLikelyImagePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
}

async function inlineAttachmentContent(content: string, hasInlineImagePayload: boolean): Promise<string> {
  const trimmed = content?.trim();
  if (!trimmed) {
    return '';
  }

  const attachmentContext = buildAttachmentRuntimeContext(trimmed);
  const { promptText, attachments } = attachmentContext;
  const filePaths = attachments.map((attachment) => attachment.path);
  if (filePaths.length === 0) {
    return trimmed;
  }

  if (attachmentContext.shouldPreferToolReading) {
    return buildAttachmentInlineManifestPrompt(attachmentContext);
  }

  const parsedBlocks: string[] = [];
  let totalChars = 0;

  for (const rawPath of Array.from(new Set(filePaths)).slice(0, MAX_PARSED_ATTACHMENT_COUNT)) {
    const resolvedPath = path.resolve(rawPath);
    const fileName = path.basename(resolvedPath) || resolvedPath;

    if (isLikelyImagePath(resolvedPath)) {
      parsedBlocks.push([
        `文件: ${fileName}`,
        `路径: ${resolvedPath}`,
        hasInlineImagePayload
          ? '说明: 该图片已作为视觉附件一并发送。'
          : '说明: 检测到图片文件路径，但当前消息未内联图片数据，无法在底层直接解析像素内容。',
      ].join('\n'));
      continue;
    }

    try {
      const stat = await fs.promises.stat(resolvedPath);
      if (!stat.isFile()) {
        parsedBlocks.push([
          `文件: ${fileName}`,
          `路径: ${resolvedPath}`,
          '解析结果: 目标不是普通文件。',
        ].join('\n'));
        continue;
      }

      if (stat.size > MAX_PARSED_ATTACHMENT_BYTES) {
        parsedBlocks.push([
          `文件: ${fileName}`,
          `路径: ${resolvedPath}`,
          `解析结果: 文件过大，已跳过底层解析（>${Math.floor(MAX_PARSED_ATTACHMENT_BYTES / (1024 * 1024))}MB）。`,
        ].join('\n'));
        continue;
      }

      const buffer = await fs.promises.readFile(resolvedPath);
      const parsed = await parseFile(fileName, buffer);
      if (!parsed.success || !parsed.text.trim()) {
        parsedBlocks.push([
          `文件: ${fileName}`,
          `路径: ${resolvedPath}`,
          `解析结果: ${parsed.error || '解析失败'}`,
        ].join('\n'));
        continue;
      }

      const remainingChars = MAX_PARSED_ATTACHMENT_TOTAL_CHARS - totalChars;
      if (remainingChars <= 0) {
        break;
      }

      const parsedText = parsed.text.slice(0, remainingChars);
      totalChars += parsedText.length;
      parsedBlocks.push([
        `文件: ${fileName}`,
        `路径: ${resolvedPath}`,
        `类型: ${parsed.fileType}`,
        '提取文本:',
        parsedText,
      ].join('\n'));
    } catch (error) {
      parsedBlocks.push([
        `文件: ${fileName}`,
        `路径: ${resolvedPath}`,
        `解析结果: ${error instanceof Error ? error.message : '读取失败'}`,
      ].join('\n'));
    }
  }

  if (parsedBlocks.length === 0) {
    return promptText || trimmed;
  }

  // {标记} P1-ATTACHMENT-PARSE: 常见文档在发给上游前先抽正文，避免只把文件路径丢给模型。
  return [
    promptText,
    '以下是当前消息附带文件的底层解析结果。优先依据提取文本理解内容，不要假装读取了未展示的原文件。',
    '<attached_files>',
    ...parsedBlocks,
    '</attached_files>',
  ]
    .filter((section) => section && section.trim())
    .join('\n\n');
}
