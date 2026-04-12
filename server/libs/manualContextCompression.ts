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

type CompressionAttemptResult = {
  result: ManualContextCompressionResult | null;
  error: string | null;
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

async function fetchWithoutLocalTimeout(url: string, init: RequestInit): Promise<Response> {
  // ##混淆点注意：
  // 手工压缩上下文不再由服务端本地强加 90 秒 / 150 秒超时。
  // 这类长整理任务是否停止，交给用户侧的“手工打断”按钮，而不是隐式定时切断。
  // 如果上游自己超时/断开，会直接返回上游错误；这里不再额外套一层本地短时闸门。
  return fetch(url, init);
}

async function fetchOpenAI(prompt: string, config: CompressionApiConfig): Promise<string> {
  const base = config.apiUrl.replace(/\/+$/, '');
  const url = base.includes('/chat/completions')
    ? base
    : base.endsWith('/v1')
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;

  const resp = await fetchWithoutLocalTimeout(url, {
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

  const resp = await fetchWithoutLocalTimeout(url, {
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

function summarizeCompressionResponse(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'empty response';
  }
  return cleaned.slice(0, 180);
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

  const runCompression = async (targetConfig: CompressionApiConfig): Promise<CompressionAttemptResult> => {
    try {
      const raw = targetConfig.apiFormat === 'anthropic'
        ? await fetchAnthropic(prompt, targetConfig)
        : await fetchOpenAI(prompt, targetConfig);
      const parsed = parseCompressionJson(raw);
      if (!parsed) {
        return {
          result: null,
          error: `${targetConfig.source} returned non-JSON compression output: ${summarizeCompressionResponse(raw)}`,
        };
      }
      return {
        result: {
          ...parsed,
          source: targetConfig.source,
          modelId: targetConfig.modelId,
        },
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: `${targetConfig.source} failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  const primaryResult = await runCompression(config);
  if (primaryResult.result) {
    console.info('[manual-compression] success', {
      source: primaryResult.result.source,
      modelId: primaryResult.result.modelId,
      conversationSummaryLength: primaryResult.result.conversationSummary.length,
      broadcastSummaryLength: primaryResult.result.broadcastSummary.length,
      combinedSummaryLength: primaryResult.result.combinedSummary.length,
    });
    return primaryResult.result;
  }

  const shouldFallbackToRoleModel = Boolean(
    dedicatedConfig
    && roleConfig
    && dedicatedConfig.source !== roleConfig.source
  );

  if (shouldFallbackToRoleModel) {
    const fallbackResult = await runCompression(roleConfig!);
    if (fallbackResult.result) {
      console.info('[manual-compression] fallback-success', {
        source: fallbackResult.result.source,
        modelId: fallbackResult.result.modelId,
        conversationSummaryLength: fallbackResult.result.conversationSummary.length,
        broadcastSummaryLength: fallbackResult.result.broadcastSummary.length,
        combinedSummaryLength: fallbackResult.result.combinedSummary.length,
      });
      return fallbackResult.result;
    }
    throw new Error([
      `压缩失败：专用压缩模型和角色模型都没接住。`,
      primaryResult.error ? `主压缩：${primaryResult.error}` : null,
      fallbackResult.error ? `角色降级：${fallbackResult.error}` : null,
    ].filter(Boolean).join('\n'));
  }

  throw new Error([
    '压缩失败：当前只尝试了主压缩模型。',
    primaryResult.error ? `主压缩：${primaryResult.error}` : null,
    roleConfig ? null : `角色降级：当前角色 ${roleKey} 没有可用的压缩模型配置。`,
  ].filter(Boolean).join('\n'));
}
