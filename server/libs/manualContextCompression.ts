import type { Database } from 'sql.js';
import { pickNextApiKey, resolveAgentRolesFromConfig } from '../../src/shared/agentRoleConfig';
import { ENV_ALIAS_PAIRS, readEnvAliasPair } from '../../src/shared/envAliases';
import { listIdentityThreadBoardSnapshots } from './identityThreadHelper';

type CompressionApiConfig = {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiFormat: 'openai' | 'anthropic';
  source: string;
};

type CompressibleMessage = {
  type: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

type CompressibleSession = {
  id: string;
  title: string;
  agentRoleKey?: string | null;
  modelId?: string | null;
  messages: CompressibleMessage[];
};

export interface ManualContextCompressionResult {
  conversationSummary: string;
  broadcastSummary: string;
  combinedSummary: string;
  source: string;
  modelId: string;
}

const MANUAL_COMPRESSION_TIMEOUT_MS = 600_000;
const MANUAL_COMPRESSION_RETRY_TIMEOUT_MS = 600_000;
const MAX_CONVERSATION_PROMPT_CHARS = 60_000;
const MAX_BOARD_PROMPT_CHARS = 12_000;

function resolveDedicatedCompressionConfig(appConfig?: Record<string, any>): CompressionApiConfig | null {
  const configCandidate = appConfig?.dailyMemory && typeof appConfig.dailyMemory === 'object'
    ? appConfig.dailyMemory
    : null;
  const configEnabled = configCandidate?.enabled === true;

  const apiUrl = (
    configEnabled
      ? String(configCandidate?.apiUrl || '').trim()
      : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryApiBaseUrl) || '').trim()
  ).replace(/\/+$/, '');
  const apiKey = configEnabled
    ? String(configCandidate?.apiKey || '').trim()
    : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryApiKey) || '').trim();
  const modelId = configEnabled
    ? String(configCandidate?.modelId || '').trim()
    : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryModel) || '').trim();
  const apiFormatRaw = (
    configEnabled
      ? String(configCandidate?.apiFormat || 'openai').trim()
      : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryApiFormat) || '').trim()
  ).toLowerCase();

  if (!apiUrl || !apiKey || !modelId) {
    return null;
  }

  return {
    apiUrl,
    apiKey: pickNextApiKey(apiKey, 'manual-context-compression:dedicated') || apiKey,
    modelId,
    apiFormat: apiFormatRaw === 'anthropic' ? 'anthropic' : 'openai',
    source: 'dailyMemory',
  };
}

function resolveRoleCompressionConfig(
  appConfig: Record<string, any> | undefined,
  roleKey: string,
  sessionModelId?: string | null,
): CompressionApiConfig | null {
  const roles = resolveAgentRolesFromConfig(appConfig);
  const normalizedRoleKey = roleKey === 'writer' || roleKey === 'designer' || roleKey === 'analyst'
    ? roleKey
    : 'organizer';
  const roleConfig = roles[normalizedRoleKey];
  const apiUrl = String(roleConfig?.apiUrl || '').trim().replace(/\/+$/, '');
  const apiKeyRaw = String(roleConfig?.apiKey || '').trim();
  const modelId = String(sessionModelId || roleConfig?.modelId || '').trim();
  const apiFormat = roleConfig?.apiFormat === 'anthropic' ? 'anthropic' : 'openai';

  if (!apiUrl || !apiKeyRaw || !modelId) {
    return null;
  }

  return {
    apiUrl,
    apiKey: pickNextApiKey(apiKeyRaw, `manual-context-compression:${normalizedRoleKey}`) || apiKeyRaw,
    modelId,
    apiFormat,
    source: `agentRole:${normalizedRoleKey}`,
  };
}

function normalizePromptSlice(input: string, maxChars: number): string {
  const trimmed = input.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(-maxChars)}\n\n[Truncated older content to stay within compression window.]`;
}

function buildConversationPromptText(session: CompressibleSession): string {
  const lines = session.messages.map((message, index) => {
    const stamp = Number.isFinite(message.timestamp)
      ? new Date(message.timestamp).toLocaleString('zh-CN', { hour12: false })
      : `#${index + 1}`;
    const base = `[${stamp}] ${message.type}: ${(message.content || '').trim()}`;
    const toolName = typeof message.metadata?.toolName === 'string' ? message.metadata.toolName.trim() : '';
    if (toolName) {
      return `${base} (tool=${toolName})`;
    }
    return base;
  });

  return normalizePromptSlice(lines.join('\n'), MAX_CONVERSATION_PROMPT_CHARS);
}

function buildBroadcastPromptText(db: Database, roleKey: string): string {
  const boards = listIdentityThreadBoardSnapshots(db, { agentRoleKey: roleKey, limit: 1 });
  const board = boards[0];
  if (!board) {
    return 'No active broadcast board.';
  }

  const lines = [
    `Board summary: ${board.summaryText || '暂无摘要'}`,
    ...board.entries.map((entry) => (
      `[${entry.timeLabel}] ${entry.channelLabel}${entry.sessionId ? ` / ${entry.sessionId}` : ''}: ${entry.content}`
    )),
  ];

  return normalizePromptSlice(lines.join('\n'), MAX_BOARD_PROMPT_CHARS);
}

function buildCompressionPrompt(session: CompressibleSession, boardText: string): string {
  return [
    '你在做“手工压缩上下文”。目标不是写总结文章，而是为后续继续对话生成一份更短、更准、可直接接力的上下文。',
    '',
    '请分别处理：',
    '1. 完整对话记录',
    '2. 广播板记录',
    '3. 再把这两者做一次二次压缩，输出最终接力上下文',
    '',
    '输出必须是严格 JSON，不要加 markdown 代码块，不要加解释：',
    '{"conversationSummary":"","broadcastSummary":"","combinedSummary":""}',
    '',
    '要求：',
    '- conversationSummary：只保留任务、事实、决定、坑、下一步',
    '- broadcastSummary：把广播板再压短，去废话，留关键信号',
    '- combinedSummary：把前两者再压成后续可直接续聊的一段接力上下文',
    '- 统一使用中文',
    '- 不要虚构没有出现过的内容',
    '- 不要保留寒暄废话',
    '- 优先保留未完成事项、关键判断、风险和待确认点',
    '',
    `Session title: ${session.title || '未命名对话'}`,
    '',
    '## Full Conversation',
    buildConversationPromptText(session),
    '',
    '## Broadcast Board',
    boardText,
  ].join('\n');
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = `${error.message} ${(error as any)?.cause?.message || ''}`;
  return /headers timeout|timeout|UND_ERR_HEADERS_TIMEOUT|fetch failed/i.test(message);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, MANUAL_COMPRESSION_TIMEOUT_MS);
  } catch (error) {
    if (!isTimeoutError(error)) {
      throw error;
    }
    return await fetchWithTimeout(url, init, MANUAL_COMPRESSION_RETRY_TIMEOUT_MS);
  }
}

async function fetchOpenAI(prompt: string, config: CompressionApiConfig): Promise<string> {
  const base = config.apiUrl.replace(/\/+$/, '');
  const url = base.includes('/chat/completions')
    ? base
    : base.endsWith('/v1')
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;

  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: 4096,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`OpenAI API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data?.choices?.[0]?.message?.content || '';
}

async function fetchAnthropic(prompt: string, config: CompressionApiConfig): Promise<string> {
  const base = config.apiUrl.replace(/\/+$/, '');
  const url = base.includes('/v1/messages')
    ? base
    : `${base}/v1/messages`;

  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data?.content?.[0]?.text || '';
}

function parseCompressionJson(text: string): ManualContextCompressionResult | null {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const matched = /\{[\s\S]*\}/.exec(cleaned);
  if (!matched) {
    return null;
  }

  try {
    const parsed = JSON.parse(matched[0]) as Record<string, unknown>;
    const conversationSummary = String(parsed.conversationSummary || '').trim();
    const broadcastSummary = String(parsed.broadcastSummary || '').trim();
    const combinedSummary = String(parsed.combinedSummary || '').trim();
    if (!conversationSummary && !broadcastSummary && !combinedSummary) {
      return null;
    }
    return {
      conversationSummary,
      broadcastSummary,
      combinedSummary,
      source: '',
      modelId: '',
    };
  } catch {
    return null;
  }
}

export async function compressSessionContext(params: {
  db: Database;
  appConfig?: Record<string, any>;
  session: CompressibleSession;
}): Promise<ManualContextCompressionResult> {
  const roleKey = String(params.session.agentRoleKey || 'organizer').trim() || 'organizer';
  const dedicatedConfig = resolveDedicatedCompressionConfig(params.appConfig);
  const roleConfig = resolveRoleCompressionConfig(params.appConfig, roleKey, params.session.modelId);
  const config = dedicatedConfig || roleConfig;

  if (!config) {
    throw new Error('没有可用的压缩模型配置');
  }

  const prompt = buildCompressionPrompt(
    params.session,
    buildBroadcastPromptText(params.db, roleKey),
  );

  const runCompression = async (targetConfig: CompressionApiConfig): Promise<ManualContextCompressionResult | null> => {
    try {
      const raw = targetConfig.apiFormat === 'anthropic'
        ? await fetchAnthropic(prompt, targetConfig)
        : await fetchOpenAI(prompt, targetConfig);
      const parsed = parseCompressionJson(raw);
      if (!parsed) {
        return null;
      }
      return {
        ...parsed,
        source: targetConfig.source,
        modelId: targetConfig.modelId,
      };
    } catch {
      return null;
    }
  };

  const primaryResult = await runCompression(config);
  if (primaryResult) {
    return primaryResult;
  }

  const shouldFallbackToRoleModel = Boolean(
    dedicatedConfig
    && roleConfig
    && dedicatedConfig.source !== roleConfig.source
  );

  if (shouldFallbackToRoleModel) {
    const fallbackResult = await runCompression(roleConfig!);
    if (fallbackResult) {
      return fallbackResult;
    }
  }

  throw new Error('压缩模型无响应，且角色模型降级也失败');
}
