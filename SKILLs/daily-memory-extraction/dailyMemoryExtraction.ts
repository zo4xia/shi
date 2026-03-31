/**
 * Daily Memory Extraction — 每日记忆抽取核心模块
 *
 * 管道:  identity_thread_24h (SQLite 24h缓存)
 *     → LLM 智能摘要
 *     → user_memories / identityMemory 长期记忆链
 *     → 清空 identity_thread_24h 热缓存画板
 *
 * 身份锚点: agentRoleKey = 唯一身份
 *           modelId 仅用于调用摘要模型，不再作为长期记忆隔离键
 * 跨渠道:   web / feishu / dingtalk 写入同一 identity_thread_24h，
 *           本模块统一读取、提炼、写回长期记忆。
 *
 * 调用方: server/routes/dailyMemory.ts → POST /api/memory/daily-extract
 * 依赖:   sql.js Database (由调用方注入), identityMemoryManager (直接 import)
 */

import type { Database } from 'sql.js';
import type {
  IdentityKey,
  UserInfo,
  ProjectContext,
  Decision,
  Note,
} from '../../src/main/memory/identityMemoryManager';

// ─── 公共类型 ─────────────────────────────────────────────────────

/** 调用方传入的完整配置，包含 DB 和 LLM 访问信息 */
export interface ExtractionConfig {
  /** 运行中的 sql.js Database 实例 (SqliteStore.getDatabase()) */
  db: Database;
  /** 当前数据库持久化函数 */
  saveDb: () => void;
  /** LLM API 基础 URL，如 https://api.openai.com/v1 */
  apiUrl: string;
  /** LLM API Key */
  apiKey: string;
  /** 用于摘要的模型 ID */
  modelId: string;
  /** API 协议格式 */
  apiFormat: 'openai' | 'anthropic';
}

const DAILY_MEMORY_LLM_TIMEOUT_MS = 90_000;
const DAILY_MEMORY_TIMEOUT_RETRY_MS = 150_000;

/** 抽取结果 */
export interface ExtractionResult {
  /** 成功提炼的身份数 */
  extractedCount: number;
  /** 成功清空热缓存的身份数 */
  clearedHotCacheCount: number;
  /** 跳过的身份数（今日无对话） */
  skippedCount: number;
  /** 错误列表 */
  errors: string[];
}

/** identity_thread_24h 中的单条消息 */
interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  channel_hint?: string;
  channel_seq?: number;
}

/** LLM 返回的提炼数据，字段对齐 identityMemoryManager 的类型 */
interface LLMExtractedData {
  userInfo?: Partial<UserInfo>;
  projectContext?: Partial<ProjectContext>;
  decisions?: Decision[];
  notes?: Array<Note & { category?: string; tags?: string[] }>;
}

// ─── 主入口 ─────────────────────────────────────────────────────

/**
 * 每日记忆抽取主函数
 *
 * 流程:
 * 1. 从 identity_thread_24h 表扫描所有今日有对话的身份
 * 2. 逐身份读取对话 → 调 LLM 提炼 → 写入长期记忆链
 * 3. 写入成功后清空该身份的 24h 热缓存画板
 *
 * @param config - 包含 db、LLM API 信息的完整配置
 */
export async function extractDailyMemory(config: ExtractionConfig): Promise<ExtractionResult> {
  const TAG = '[DailyExtraction]';
  console.log(`${TAG} 开始执行`);

  const result: ExtractionResult = {
    extractedCount: 0,
    clearedHotCacheCount: 0,
    skippedCount: 0,
    errors: [],
  };

  const { identityMemoryManager } = await import('../../src/main/memory/identityMemoryManager');
  identityMemoryManager.setDatabase(config.db, config.saveDb);
  const { clearIdentityThreadForRole, cleanupExpiredIdentityThreads } = await import('../../server/libs/identityThreadHelper');
  cleanupExpiredIdentityThreads(config.db);

  // ── Step 1: 扫描活跃身份 ──
  const identities = scanActiveIdentities(config.db);
  if (identities.length === 0) {
    console.log(`${TAG} identity_thread_24h 中无活跃身份，跳过`);
    return result;
  }
  console.log(`${TAG} 发现 ${identities.length} 个活跃身份`);

  // ── Step 2: 逐身份处理 ──
  for (const identity of identities) {
    const idLabel = identity.agentRoleKey;
    try {
      // 2a. 读取该身份的 24h 对话
      const messages = readThreadMessages(config.db, identity);
      if (messages.length === 0) {
        console.log(`${TAG} [${idLabel}] 无对话消息，跳过`);
        result.skippedCount++;
        continue;
      }
      console.log(`${TAG} [${idLabel}] 读取到 ${messages.length} 条消息`);

      // 2b. 调 LLM 提炼
      const extracted = await callLLMExtract(messages, config);
      if (!extracted) {
        console.warn(`${TAG} [${idLabel}] LLM 提炼返回空，跳过`);
        result.skippedCount++;
        continue;
      }

      // 2c. 写入长期记忆链
      const mergeResult = await mergeToIdentityMemory(identity, extracted);
      if (!mergeResult.wrote) {
        console.log(`${TAG} [${idLabel}] 没有新的长期记忆写入，保留 24h 热缓存等待后续补充`);
        result.skippedCount++;
        continue;
      }
      const cleared = clearIdentityThreadForRole(config.db, identity.agentRoleKey);
      if (cleared > 0) {
        config.saveDb();
        result.clearedHotCacheCount += 1;
        console.log(`${TAG} [${idLabel}] 已清空 24h 热缓存画板`);
      }
      result.extractedCount++;
      console.log(
        `${TAG} [${idLabel}] 写入完成 — ` +
        `决策 ${extracted.decisions?.length || 0} 条, ` +
        `笔记 ${extracted.notes?.length || 0} 条`,
      );
    } catch (err) {
      const msg = `[${idLabel}] 处理失败: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`${TAG} ${msg}`);
    }
  }

  console.log(
    `${TAG} 完成 — 提炼 ${result.extractedCount}, ` +
    `跳过 ${result.skippedCount}, 错误 ${result.errors.length}`,
  );
  return result;
}

// ─── Step 1: 扫描活跃身份 ──────────────────────────────────────

/**
 * 从 identity_thread_24h 表查询所有有记录的身份
 * SQL: SELECT DISTINCT agent_role_key FROM identity_thread_24h
 */
function scanActiveIdentities(db: Database): IdentityKey[] {
  try {
    const nowMs = Date.now();
    const rows = db.exec(
      `
        SELECT DISTINCT agent_role_key
        FROM identity_thread_24h
        WHERE expires_at IS NULL
           OR ((expires_at < 1e12 AND expires_at > ?)
           OR (expires_at >= 1e12 AND expires_at > ?))
      `,
      [Math.floor(nowMs / 1000), nowMs],
    );
    if (!rows.length || !rows[0].values.length) return [];
    return rows[0].values.map((row) => ({
      agentRoleKey: row[0] as string,
      modelId: '',
    }));
  } catch (err) {
    console.error('[DailyExtraction] 扫描活跃身份失败:', err);
    return [];
  }
}

// ─── Step 2a: 读取对话消息 ─────────────────────────────────────

/**
 * 读取指定身份在 identity_thread_24h 中的对话内容
 * context 列存储 JSON 数组: [{role, content, timestamp?, channel_hint?, channel_seq?}]
 */
function readThreadMessages(db: Database, identity: IdentityKey): ThreadMessage[] {
  try {
    const rows = db.exec(
      `
        SELECT context, expires_at
        FROM identity_thread_24h
        WHERE agent_role_key = ?
        ORDER BY updated_at DESC, created_at DESC
      `,
      [identity.agentRoleKey],
    );
    if (!rows.length || !rows[0].values.length) return [];

    const nowMs = Date.now();
    return rows[0].values
      .flatMap((row) => {
        const expiresAtMs = normalizeThreadTimestampMs(row[1]);
        if (expiresAtMs && nowMs >= expiresAtMs) {
          return [];
        }

        try {
          const parsed = JSON.parse(String(row[0] ?? '[]'));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content),
        timestamp: m.timestamp ?? undefined,
        channel_hint: m.channel_hint ?? undefined,
        channel_seq: typeof m.channel_seq === 'number' ? m.channel_seq : undefined,
      }))
      .sort((a, b) => normalizeThreadTimestampMs(a.timestamp) - normalizeThreadTimestampMs(b.timestamp));
  } catch (err) {
    console.error('[DailyExtraction] 读取对话消息失败:', err);
    return [];
  }
}

// ─── Step 2b: LLM 提炼 ────────────────────────────────────────

/**
 * 调用 LLM 从对话中提炼结构化记忆
 * 支持 OpenAI 兼容格式 和 Anthropic 原生格式
 */
async function callLLMExtract(
  messages: ThreadMessage[],
  config: ExtractionConfig,
): Promise<LLMExtractedData | null> {
  const startMs = Date.now();

  try {
    const primaryPrompt = buildExtractionPrompt(messages, 'default');
    const primaryText = config.apiFormat === 'anthropic'
      ? await fetchAnthropic(primaryPrompt, config)
      : await fetchOpenAI(primaryPrompt, config);
    const primaryParsed = parseExtractedJSON(primaryText);
    if (primaryParsed) {
      const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(`[DailyExtraction] LLM 调用完成 (${durationSec}s)`);
      return primaryParsed;
    }

    console.warn('[DailyExtraction] 首轮提炼未得到有效 JSON，改用更小窗口重试');
    const retryPrompt = buildExtractionPrompt(messages, 'retry');
    const retryText = config.apiFormat === 'anthropic'
      ? await fetchAnthropic(retryPrompt, config)
      : await fetchOpenAI(retryPrompt, config);
    const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`[DailyExtraction] LLM 调用完成 (${durationSec}s, 含重试)`);

    return parseExtractedJSON(retryText);
  } catch (err) {
    console.error('[DailyExtraction] LLM 调用失败:', err);
    return null;
  }
}

/** OpenAI 兼容格式 — POST {apiUrl}/chat/completions */
async function fetchOpenAI(prompt: string, config: ExtractionConfig): Promise<string> {
  const base = config.apiUrl.replace(/\/+$/, '');
  const url = base.includes('/chat/completions')
    ? base
    : base.endsWith('/v1')
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;

  const resp = await fetchWithDailyMemoryRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: 4096,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    'openai',
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`OpenAI API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data?.choices?.[0]?.message?.content || '';
}

/** Anthropic 原生格式 — POST {apiUrl}/v1/messages */
async function fetchAnthropic(prompt: string, config: ExtractionConfig): Promise<string> {
  const base = config.apiUrl.replace(/\/+$/, '');
  const url = base.includes('/v1/messages')
    ? base
    : `${base}/v1/messages`;

  const resp = await fetchWithDailyMemoryRetry(
    url,
    {
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
    },
    'anthropic',
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data?.content?.[0]?.text || '';
}

function isDailyMemoryTimeoutError(error: unknown): boolean {
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

async function fetchWithDailyMemoryRetry(
  url: string,
  init: RequestInit,
  provider: 'openai' | 'anthropic',
): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, DAILY_MEMORY_LLM_TIMEOUT_MS);
  } catch (error) {
    if (!isDailyMemoryTimeoutError(error)) {
      throw error;
    }
    console.warn(
      `[DailyExtraction] ${provider} 首次请求超时，准备重试 (timeout=${DAILY_MEMORY_LLM_TIMEOUT_MS}ms -> ${DAILY_MEMORY_TIMEOUT_RETRY_MS}ms)`
    );
    return await fetchWithTimeout(url, init, DAILY_MEMORY_TIMEOUT_RETRY_MS);
  }
}

/** 构建 LLM 提炼 prompt — 输出字段严格对齐 identityMemoryManager 类型 */
function buildExtractionPrompt(messages: ThreadMessage[], mode: 'default' | 'retry' = 'default'): string {
  const today = formatLocalDayKey(new Date());
  const { conversation, wasCompacted, originalCount, renderedCount } = renderConversationForExtraction(messages, mode);
  if (wasCompacted) {
    const label = mode === 'retry' ? '重试压缩' : '对话压缩';
    console.log(`[DailyExtraction] ${label}: 原始 ${originalCount} 条 -> 提炼输入 ${renderedCount} 条`);
  }

  return `你是智能记忆提取助手。分析下面今天（${today}）的多渠道对话，提取关键信息。

## 今天的对话

${wasCompacted ? '说明：今日对话较长，下面保留了最近完整消息，并抽样保留了更早的重要片段。\n\n' : ''}${conversation}

## 输出要求

只输出纯 JSON，不要 markdown 代码块，不要多余文字。
只提取今天对话中明确提到的信息。没有的字段不要编造，留空字符串、空对象或空数组。
把每天的记忆写得像图书馆编目一样：分类清楚、主题清楚、标签清楚，未来才能检索。
如果内容和跨天查询、周报汇总、文件整理、科研/工作主题有关，要优先写成可回查、可搜索的日记条目。
字段名必须严格按下面 JSON 格式，不要自造 profession / location / currentProject / reason / impact 这类别名字段。
如果对话很长，优先保留能代表今天事实、决定、主题、文件线索的内容；不要因为材料太多就输出半截 JSON。

## JSON 格式

{
  "userInfo": {
    "name": "",
    "role": "",
    "team": "",
    "timezone": "",
    "preferences": {}
  },
  "projectContext": {
    "name": "",
    "description": "",
    "techStack": [],
    "goals": []
  },
  "decisions": [
    {
      "date": "${today}",
      "decision": "做了什么决策",
      "context": "决策背景、原因或影响"
    }
  ],
  "notes": [
    {
      "category": "分类(技术/业务/学习)",
      "topic": "主题",
      "content": "具体内容",
      "tags": ["可检索标签1", "可检索标签2"]
    }
  ]
}`;
}

function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderConversationForExtraction(messages: ThreadMessage[], mode: 'default' | 'retry' = 'default'): {
  conversation: string;
  wasCompacted: boolean;
  originalCount: number;
  renderedCount: number;
} {
  const originalCount = messages.length;
  const totalChars = messages.reduce((sum, message) => sum + String(message.content || '').length, 0);
  const shouldCompact = mode === 'retry' || originalCount > 36 || totalChars > 14_000;
  const selected = shouldCompact ? compactThreadMessages(messages, mode) : messages;

  return {
    conversation: selected.map((message) => formatThreadMessageForExtraction(message)).join('\n\n'),
    wasCompacted: shouldCompact,
    originalCount,
    renderedCount: selected.length,
  };
}

function compactThreadMessages(messages: ThreadMessage[], mode: 'default' | 'retry' = 'default'): ThreadMessage[] {
  const recentCount = mode === 'retry' ? 8 : 12;
  const olderSampleCount = mode === 'retry' ? 8 : 16;
  const recentChars = mode === 'retry' ? 220 : 360;
  const olderChars = mode === 'retry' ? 90 : 140;
  const recent = messages.slice(-recentCount).map((message) => ({
    ...message,
    content: truncateExtractionMessageContent(message.content, recentChars),
  }));
  const olderPool = messages.slice(0, Math.max(0, messages.length - recentCount));
  const sampledOlder = pickEvenlyDistributedMessages(olderPool, olderSampleCount).map((message) => ({
    ...message,
    content: truncateExtractionMessageContent(message.content, olderChars),
  }));

  return [...sampledOlder, ...recent]
    .sort((a, b) => normalizeThreadTimestampMs(a.timestamp) - normalizeThreadTimestampMs(b.timestamp));
}

function pickEvenlyDistributedMessages(messages: ThreadMessage[], limit: number): ThreadMessage[] {
  if (messages.length <= limit) {
    return messages;
  }

  const picked: ThreadMessage[] = [];
  const seenIndexes = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    const rawIndex = Math.floor((index * messages.length) / limit);
    const safeIndex = Math.min(messages.length - 1, rawIndex);
    if (seenIndexes.has(safeIndex)) {
      continue;
    }
    seenIndexes.add(safeIndex);
    picked.push(messages[safeIndex]);
  }
  return picked;
}

function truncateExtractionMessageContent(content: string, maxChars: number): string {
  const normalized = String(content || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatThreadMessageForExtraction(message: ThreadMessage): string {
  const role = message.role === 'user' ? '用户' : '助手';
  const seq = typeof message.channel_seq === 'number' && Number.isFinite(message.channel_seq) && message.channel_seq > 0
    ? `#${String(Math.trunc(message.channel_seq)).padStart(3, '0')}`
    : '';
  const channel = message.channel_hint ? ` [${message.channel_hint}${seq}]` : (seq ? ` [${seq}]` : '');
  return `${role}${channel}: ${message.content}`;
}

/** 安全解析 LLM 返回的 JSON */
function parseExtractedJSON(text: string): LLMExtractedData | null {
  if (!text?.trim()) return null;

  const cleaned = stripMarkdownCodeFence(text);
  const direct = tryParseExtractedObject(cleaned);
  if (direct) {
    return direct;
  }

  const extractedObject = extractFirstBalancedJsonObject(cleaned);
  if (extractedObject && extractedObject !== cleaned) {
    const fallback = tryParseExtractedObject(extractedObject);
    if (fallback) {
      console.log('[DailyExtraction] JSON 解析回退成功（已剥离前后多余文本）');
      return fallback;
    }
  }

  console.warn('[DailyExtraction] JSON 解析失败，原始文本:', text.slice(0, 500));
  return null;
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const withoutOpen = trimmed.replace(/^```[^\n\r]*[\r\n]?/, '');
  const closingFenceIndex = withoutOpen.lastIndexOf('```');
  if (closingFenceIndex >= 0) {
    return withoutOpen.slice(0, closingFenceIndex).trim();
  }
  return withoutOpen.trim();
}

function tryParseExtractedObject(text: string): LLMExtractedData | null {
  try {
    const obj = JSON.parse(text);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return null;
    }
    return {
      userInfo: obj.userInfo ?? undefined,
      projectContext: obj.projectContext ?? undefined,
      decisions: Array.isArray(obj.decisions) ? obj.decisions : undefined,
      notes: Array.isArray(obj.notes) ? obj.notes : undefined,
    };
  } catch {
    return null;
  }
}

function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  return null;
}

// ─── Step 2c: 合并写入长期记忆 ────────────────────────────────

/**
 * 将提炼数据追加到身份长期记忆链（当前真实落点为 user_memories）
 *
 * 合并策略:
 * - userInfo / projectContext: 浅合并 (新值覆盖旧值)
 * - decisions / notes: 追加 (用 date+decision / topic+content 去重)
 *
 * 规则: identity_thread_24h 只做 24h 热缓存，成功入库后由调用方清空
 */
async function mergeToIdentityMemory(
  identity: IdentityKey,
  extracted: LLMExtractedData,
): Promise<{ wrote: boolean }> {
  const { identityMemoryManager } = await import('../../src/main/memory/identityMemoryManager');

  // 读取现有记忆
  const existing = await identityMemoryManager.getIdentityMemory(identity);

  // 构建更新包
  const updates: Record<string, unknown> = {};

  // userInfo: 浅合并，忽略空值
  if (extracted.userInfo && hasNonEmpty(extracted.userInfo)) {
    const patch = diffNonEmpty(existing.userInfo, extracted.userInfo);
    if (Object.keys(patch).length > 0) {
      updates.userInfo = patch;
    }
  }

  // projectContext: 浅合并，忽略空值
  if (extracted.projectContext && hasNonEmpty(extracted.projectContext)) {
    const patch = diffNonEmpty(existing.projectContext, extracted.projectContext);
    if (Object.keys(patch).length > 0) {
      updates.projectContext = patch;
    }
  }

  // {标记} P1-2-FIX: 角色标签映射，用于"角色-时间-前缀"格式
  const roleLabels: Record<string, string> = {
    organizer: '信息整理助手',
    writer: '文字撰写员',
    designer: '美术编辑师',
    analyst: '数据分析师',
  };
  const roleName = roleLabels[identity.agentRoleKey] || identity.agentRoleKey;
  const today = new Date().toISOString().slice(0, 10);

  // decisions: 追加，用 date+decision 去重
  // {标记} P1-2-FIX: 每条decision带上"角色-时间"前缀
  if (extracted.decisions?.length) {
    const prefixedDecisions = extracted.decisions.map((d) => ({
      ...d,
      date: d.date || today,
      decision: `[${roleName}] ${d.decision}`,
    }));
    const existingKeys = new Set(existing.decisions.map((d) => `${d.date}|${d.decision}`));
    const fresh = prefixedDecisions.filter((d) => !existingKeys.has(`${d.date}|${d.decision}`));
    if (fresh.length) {
      updates.decisions = fresh;
    }
  }

  // notes: 追加，用 topic+content 去重
  // {标记} P1-2-FIX: 每条note带上"角色-时间"前缀
  if (extracted.notes?.length) {
    const prefixedNotes = extracted.notes.map((n) => ({
      ...n,
      topic: `[${roleName}-${today}] ${n.topic}`,
      category: typeof n.category === 'string' ? n.category.trim() : undefined,
      tags: Array.isArray(n.tags)
        ? n.tags
          .filter((tag) => typeof tag === 'string')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8)
        : undefined,
    }));
    const existingKeys = new Set(existing.notes.map((n) => `${n.topic}|${n.content}`));
    const fresh = prefixedNotes.filter((n) => !existingKeys.has(`${n.topic}|${n.content}`));
    if (fresh.length) {
      updates.notes = fresh;
    }
  }

  if (Object.keys(updates).length === 0) {
    console.log('[DailyExtraction] 无新信息需要写入');
    return { wrote: false };
  }

  await identityMemoryManager.updateIdentityMemory(identity, updates as any);
  return { wrote: true };
}

// ─── 工具函数 ──────────────────────────────────────────────────

/** 检查对象中是否有非空值 */
function hasNonEmpty(obj: object): boolean {
  return Object.values(obj as Record<string, unknown>).some((v) => {
    if (v === '' || v === null || v === undefined) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

/** 去除空字符串和空数组字段，避免用空值覆盖已有数据 */
function stripEmpty(obj: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    result[k] = v;
  }
  return result;
}

function diffNonEmpty(
  existing: object,
  candidate: object
): Record<string, unknown> {
  const stripped = stripEmpty(candidate);
  const patch: Record<string, unknown> = {};
  const existingRecord = existing as Record<string, unknown>;
  for (const [key, value] of Object.entries(stripped)) {
    if (JSON.stringify(existingRecord[key]) !== JSON.stringify(value)) {
      patch[key] = value;
    }
  }
  return patch;
}

function normalizeThreadTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) {
      return 0;
    }
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
      }
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
