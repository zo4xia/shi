/**
 * {标记} Identity Thread Integration Helper - 核心记忆连续性机制
 * {标记} 用途：在 CoworkRunner 执行前注入 24 小时线程上下文
 * {标记} 设计：获取 identity_thread_24h 表中的历史消息，作为 system context 注入
 * {标记} P0架构修复(2026-03-17): 去掉 modelId 隔离，同一身份所有渠道/模型共享一条线程
 * {警告} 修改此文件会影响所有渠道的记忆连续性，改动前必须测试飞书/钉钉/Web 三端
 */

import type { Database } from 'sql.js';

export interface IdentityThreadContext {
  historyText: string;
  messageCount: number;
  expiresInHours: number;
}

export interface IdentityThreadBoardEntry {
  role: string;
  content: string;
  sessionId?: string;
  channelHint?: string;
  channelLabel: string;
  timestamp: number;
  timeLabel: string;
  channelSeq?: number;
}

export interface IdentityThreadBoardSnapshot {
  agentRoleKey: string;
  messageCount: number;
  updatedAt: number;
  expiresAt: number;
  summaryText: string;
  entries: IdentityThreadBoardEntry[];
}

type IdentityThreadMessage = {
  role: string;
  content: string;
  session_id?: string;
  channel_hint?: string;
  timestamp?: number;
  channel_seq?: number;
};

type IdentityThreadRow = {
  id: string;
  context: string;
  messageCount: number;
  expiresAtMs: number;
  updatedAtMs: number;
};

const SHARED_THREAD_MESSAGE_SUMMARY_CHAR_LIMIT = 18;
const SHARED_THREAD_LONG_MESSAGE_SUMMARY_CHAR_LIMIT = 36;
const SHARED_THREAD_KEEP_RECENT = 120;
const SHARED_THREAD_CONTEXT_CHAR_LIMIT = 480;
const LEADING_FILLER_RE = /^(?:[啊呀哇呢啦嘛哦喔欸诶唉咦哈哼嗯呃][啊呀哇呢啦嘛哦喔欸诶唉咦哈哼嗯呃,.，。!！?？~、\s]*)+/u;
const TRAILING_FILLER_RE = /(?:[啊呀哇呢啦嘛哦喔欸诶唉咦哈哼嗯呃][啊呀哇呢啦嘛哦喔欸诶唉咦哈哼嗯呃,.，。!！?？~、\s]*)+$/u;
const PURE_FILLER_RE = /^(?:[啊呀哇呢啦嘛哦喔欸诶唉咦哈哼嗯呃,.，。!！?？~、\s]|哈哈|呵呵|嘿嘿)+$/u;
const REPEATED_WORD_RE = /\b([A-Za-z]+)(?:\s+\1\b)+/gi;
const USER_PREFIX_RE = /^(?:(?:请(?:帮我)?|帮我|帮忙|麻烦|想问(?:一下)?|问一下|我想|我要|我需要|我希望|希望|需要|能不能|可不可以|请你|拜托)\s*)+/u;
const ASSISTANT_PREFIX_RE = /^(?:(?:好的?|收到|明白|可以|我来|我会|我先|我现在|我继续|结论是|结论|建议是|建议|我看到|我检查到|我确认了|先说结论|先给结论)\s*[,:：，。!！?？~、 ]*)+/u;
const GENERIC_ACK_RE = /^(?:收到|好的?|明白|可以|处理中|继续|稍等|稍后|已收到|看到了|收到啦|ok|okay)$/iu;
const LOW_SIGNAL_RE = /^(?:go+|ok(?:ay)?|收到|继续|求助|救助|测试|哈哈|呵呵|嘿嘿|嗯+|啊+|哦+|哼+|呀+|好+|1+|2+|3+|6+|复活|锵锵)$/iu;
const USER_PRIORITY_RE = /(需要|想要|希望|目标|问题|卡住|不会|想问|请教|报错|失败|修复|兼容|支持|优化|改成|不要|保留)/u;
const ASSISTANT_PRIORITY_RE = /(结论|原因|建议|修复|已处理|已完成|已改|方案|兼容|支持|优化|接力|记住|需要注意|风险)/u;

const CHANNEL_LABELS: Record<string, string> = {
  feishu: '飞书',
  dingtalk: '钉钉',
  desktop: '桌面',
  web: '网页',
  'memory-db': '记忆',
  qq: 'QQ',
  telegram: 'Telegram',
};

function formatCompactThreadTime(timestamp: unknown): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return '--:--';
  }
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function normalizeThreadTimestampMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value < 1e12 ? value * 1000 : value;
}

function stripMeaninglessFiller(raw: string): string {
  const collapsed = raw
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[`*_#>[\]{}|]/g, ' ')
    .replace(/(?:@[\w.-]+|<at user_id=.*?<\/at>)/gi, ' ')
    .replace(REPEATED_WORD_RE, '$1')
    .trim();

  if (!collapsed || PURE_FILLER_RE.test(collapsed)) {
    return '';
  }

  const withoutLeading = collapsed.replace(LEADING_FILLER_RE, '').trim();
  const withoutTrailing = withoutLeading.replace(TRAILING_FILLER_RE, '').trim();
  const normalized = withoutTrailing.replace(/\s+/g, ' ').trim();
  if (!normalized || PURE_FILLER_RE.test(normalized)) {
    return '';
  }

  return normalized;
}

function isLowSignalSummary(raw: string): boolean {
  const normalized = raw.replace(/\s+/g, '').toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/^[\d._-]+$/.test(normalized)) {
    return true;
  }
  return LOW_SIGNAL_RE.test(normalized);
}

function pickMeaningfulClause(raw: string): string {
  const clauses = raw
    .split(/[。！？!?；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (clauses.length === 0) {
    return '';
  }

  let selected = clauses[0];
  let clauseIndex = 1;
  while (selected.length < 8 && clauseIndex < clauses.length) {
    selected += clauses[clauseIndex];
    clauseIndex += 1;
  }
  return selected.trim();
}

function splitSummaryCandidates(raw: string): string[] {
  return raw
    .split(/[\n\r]+|[。！？!?；;]+|(?:^|\s)[-•·●◦▪▸►]\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\d+[.)、:\-]\s*/u, '').trim())
    .filter(Boolean);
}

function scoreSummaryCandidate(clause: string, role: string): number {
  if (!clause || GENERIC_ACK_RE.test(clause) || isLowSignalSummary(clause)) {
    return -100;
  }

  let score = 0;
  const normalizedLength = Array.from(clause).length;

  if (normalizedLength >= 8) score += 3;
  if (normalizedLength >= 14) score += 2;
  if (normalizedLength <= 56) score += 2;
  if (/[:：]/u.test(clause)) score += 2;
  if (/->|=>|因此|所以|因为|但是|然后|先|再/u.test(clause)) score += 2;
  if (/[A-Za-z0-9_./-]{4,}/.test(clause)) score += 1;

  if (role === 'assistant') {
    if (ASSISTANT_PRIORITY_RE.test(clause)) score += 5;
  } else if (USER_PRIORITY_RE.test(clause)) {
    score += 5;
  }

  return score;
}

function pickLongFormSummary(raw: string, role: string): string {
  const candidates = splitSummaryCandidates(raw);
  if (candidates.length === 0) {
    return '';
  }

  const ranked = candidates
    .map((clause, index) => ({
      clause,
      index,
      score: scoreSummaryCandidate(clause, role),
    }))
    .filter((item) => item.score > -100)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    });

  if (ranked.length === 0) {
    return '';
  }

  const picked: string[] = [];
  for (const item of ranked) {
    const normalized = item.clause.trim();
    if (!normalized) {
      continue;
    }
    if (picked.some((existing) => existing.includes(normalized) || normalized.includes(existing))) {
      continue;
    }
    picked.push(normalized);
    if (picked.length >= 2) {
      break;
    }
  }

  return picked.join(' / ').trim();
}

function normalizeSharedThreadSummary(raw: string, role: string): string {
  const cleaned = stripMeaninglessFiller(raw);
  if (!cleaned) {
    return '';
  }

  const withoutUrl = cleaned.replace(/https?:\/\/\S+/gi, ' ').trim();
  const withoutRolePreamble = role === 'assistant'
    ? withoutUrl.replace(ASSISTANT_PREFIX_RE, '').trim()
    : withoutUrl.replace(USER_PREFIX_RE, '').trim();
  const withoutPoliteness = withoutRolePreamble
    .replace(/(?:请帮我|麻烦你|麻烦|帮我|帮忙|请你|请)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const summarySource = withoutPoliteness || withoutRolePreamble || withoutUrl;
  const sourceLength = Array.from(summarySource).length;
  const clause = sourceLength > 72
    ? (pickLongFormSummary(summarySource, role) || pickMeaningfulClause(summarySource))
    : pickMeaningfulClause(summarySource);
  const normalized = clause
    .replace(/[“”"'`]/g, '')
    .replace(/[()（）[\]【】]/g, ' ')
    .replace(/\s*[-–—>]+\s*/g, '->')
    .replace(/[,:：，。!！?？~、]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || GENERIC_ACK_RE.test(normalized) || isLowSignalSummary(normalized)) {
    return '';
  }

  const limit = sourceLength > 72
    ? SHARED_THREAD_LONG_MESSAGE_SUMMARY_CHAR_LIMIT
    : SHARED_THREAD_MESSAGE_SUMMARY_CHAR_LIMIT;
  return Array.from(normalized).slice(0, limit).join('');
}

function normalizeSharedThreadChannel(channelHint?: string): string {
  const normalized = String(channelHint || '').trim().toLowerCase();
  return CHANNEL_LABELS[normalized] || (normalized ? normalized : '未知');
}

function normalizeSharedThreadChannelKey(channelHint?: string): string {
  return String(channelHint || '').trim().toLowerCase() || 'unknown';
}

function formatSharedThreadSequence(message: IdentityThreadMessage): string {
  const seq = Number(message.channel_seq ?? 0);
  if (!Number.isFinite(seq) || seq <= 0) {
    return '';
  }
  return `#${String(Math.trunc(seq)).padStart(3, '0')}`;
}

function resolveNextChannelSequence(
  existingMessages: IdentityThreadMessage[],
  role: 'user' | 'assistant' | 'bootstrap',
  channelHint?: string
): number | undefined {
  if (role === 'bootstrap') {
    return undefined;
  }

  const normalizedChannel = normalizeSharedThreadChannelKey(channelHint);
  const latestMessage = existingMessages[existingMessages.length - 1];
  if (
    role === 'assistant'
    && latestMessage?.role === 'user'
    && normalizeSharedThreadChannelKey(latestMessage.channel_hint) === normalizedChannel
  ) {
    const pairedSeq = Number(latestMessage.channel_seq ?? 0);
    if (Number.isFinite(pairedSeq) && pairedSeq > 0) {
      return pairedSeq;
    }
  }

  let maxSeq = 0;
  for (const message of existingMessages) {
    if (normalizeSharedThreadChannelKey(message.channel_hint) !== normalizedChannel) {
      continue;
    }
    const seq = Number(message.channel_seq ?? 0);
    if (Number.isFinite(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  return maxSeq + 1;
}

function buildSharedThreadTurnLine(
  current: IdentityThreadMessage,
  next?: IdentityThreadMessage
): { line: string; consumed: number } | null {
  const time = formatCompactThreadTime(current.timestamp);
  const channel = normalizeSharedThreadChannel(current.channel_hint);
  const sequence = formatSharedThreadSequence(current);
  const channelAnchor = `${channel}${sequence}`;
  const currentSummary = normalizeSharedThreadSummary(current.content, current.role);

  if (!currentSummary) {
    return null;
  }

  if (current.role === 'user') {
    const nextSummary = next?.role === 'assistant'
      ? normalizeSharedThreadSummary(next.content, next.role)
      : '';

    if (nextSummary) {
      return {
        line: `${channelAnchor}-${time}-${currentSummary}->${nextSummary}`,
        consumed: 2,
      };
    }

    return {
      line: `${channelAnchor}-${time}-${currentSummary}`,
      consumed: 1,
    };
  }

  if (current.role === 'bootstrap') {
    return {
      line: `${channel}-${time}-接力:${currentSummary}`,
      consumed: 1,
    };
  }

  return {
    line: `${channelAnchor}-${time}-已答:${currentSummary}`,
    consumed: 1,
  };
}

function buildSharedThreadPromptBody(messages: IdentityThreadMessage[]): string {
  const recentMessages = messages.slice(-SHARED_THREAD_KEEP_RECENT);
  const lines: string[] = [];

  for (let index = 0; index < recentMessages.length; ) {
    const current = recentMessages[index];
    const next = recentMessages[index + 1];
    const turnLine = buildSharedThreadTurnLine(current, next);
    if (!turnLine) {
      index += 1;
      continue;
    }
    lines.push(turnLine.line);
    index += turnLine.consumed;
  }

  if (lines.length === 0) {
    return '';
  }

  const keptLines: string[] = [];
  let totalChars = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const nextChars = line.length + (keptLines.length > 0 ? 1 : 0);
    if (totalChars + nextChars > SHARED_THREAD_CONTEXT_CHAR_LIMIT) {
      break;
    }
    keptLines.unshift(line);
    totalChars += nextChars;
  }

  return keptLines.join('\n');
}

/**
 * getIdentityThreadContext - 24h 线程读取核心
 * {标记} P0修复: 只按 agentRoleKey 查询，不按 modelId 隔离
 */
export function getIdentityThreadContext(
  db: Database,
  agentRoleKey: string
): IdentityThreadContext | null {
  try {
    // {BREAKPOINT} continuity-thread-summary-001
    // {标记} 广播板边界: 这里返回的是跨渠道交接摘要，不是全文仓库；下游必须把它当“锚点”，不能误当原文。
    const mergedThread = loadMergedThreadState(db, agentRoleKey);
    if (!mergedThread) {
      return null;
    }

    const nowMs = Date.now();
    const compactHistoryText = buildSharedThreadPromptBody(mergedThread.messages);
    if (!compactHistoryText) {
      return null;
    }

    const expiresInMs = mergedThread.expiresAtMs ? mergedThread.expiresAtMs - nowMs : 0;
    return {
      historyText: `<sharedWorkThread>\n跨渠道连续性交接摘要（仅保留渠道-时间-序号-意图/结果，非全文；总摘要不超过300字）：\n如果遇到长原文、科研讨论或工作细节，优先把这里的渠道+序号当作定位锚点，回看对应原对话，不要用短摘要硬猜细节。\n${compactHistoryText}\n</sharedWorkThread>`,
      messageCount: mergedThread.messages.length,
      expiresInHours: Math.max(0, Math.ceil(expiresInMs / 3600000)),
    };
  } catch (error) {
    console.error('Failed to get identity thread context:', error);
    return null;
  }
}

const THREAD_COMPRESS_THRESHOLD = 200;

function formatThreadTimestamp(timestamp: unknown): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return 'unknown-time';
  }
  return new Date(timestamp).toISOString();
}

function compressThreadMessages(
  messages: IdentityThreadMessage[]
): IdentityThreadMessage[] {
  if (messages.length <= THREAD_COMPRESS_THRESHOLD) return messages;
  const droppedCount = messages.length - SHARED_THREAD_KEEP_RECENT;
  const recent = messages.slice(-SHARED_THREAD_KEEP_RECENT);
  console.log(`[IdentityThread] Dropped ${droppedCount} old summarized messages, kept ${recent.length} recent`);
  return recent;
}

function loadThreadRows(db: Database, agentRoleKey: string): IdentityThreadRow[] {
  const result = db.exec(
    `
      SELECT id, context, message_count, expires_at, updated_at
      FROM identity_thread_24h
      WHERE agent_role_key = ?
      ORDER BY updated_at DESC, created_at DESC
    `,
    [agentRoleKey]
  );

  const rows = result[0]?.values || [];
  return rows.flatMap((row) => {
    const expiresAtMs = normalizeThreadTimestampMs(row[3]);
    if (expiresAtMs && Date.now() >= expiresAtMs) {
      return [];
    }

    return [{
      id: String(row[0] ?? ''),
      context: String(row[1] ?? '[]'),
      messageCount: Number(row[2] ?? 0),
      expiresAtMs,
      updatedAtMs: normalizeThreadTimestampMs(row[4]),
    }];
  });
}

function parseThreadMessages(context: string): IdentityThreadMessage[] {
  try {
    const parsed = JSON.parse(context);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadMergedThreadState(db: Database, agentRoleKey: string): {
  primaryRowId: string;
  messages: IdentityThreadMessage[];
  expiresAtMs: number;
  updatedAtMs: number;
} | null {
  const rows = loadThreadRows(db, agentRoleKey);
  if (rows.length === 0) {
    return null;
  }

  const mergedMessages = compressThreadMessages(
    rows
      .flatMap((row) => parseThreadMessages(row.context))
      .sort((a, b) => normalizeThreadTimestampMs(a.timestamp) - normalizeThreadTimestampMs(b.timestamp))
  );

  if (mergedMessages.length === 0) {
    return null;
  }

  return {
    primaryRowId: rows[0].id,
    messages: mergedMessages,
    expiresAtMs: Math.max(...rows.map((row) => row.expiresAtMs || 0)),
    updatedAtMs: Math.max(...rows.map((row) => row.updatedAtMs || 0)),
  };
}

function listActiveIdentityThreadRoleKeys(
  db: Database,
  agentRoleKey?: string
): string[] {
  const normalizedRoleKey = agentRoleKey?.trim();
  const nowMs = Date.now();
  const result = normalizedRoleKey
    ? db.exec(
      `
        SELECT agent_role_key
        FROM identity_thread_24h
        WHERE agent_role_key = ?
          AND ((expires_at < 1e12 AND expires_at > ?) OR (expires_at >= 1e12 AND expires_at > ?))
        ORDER BY updated_at DESC, created_at DESC
      `,
      [normalizedRoleKey, Math.floor(nowMs / 1000), nowMs]
    )
    : db.exec(
      `
        SELECT agent_role_key
        FROM identity_thread_24h
        WHERE ((expires_at < 1e12 AND expires_at > ?) OR (expires_at >= 1e12 AND expires_at > ?))
        ORDER BY updated_at DESC, created_at DESC
      `,
      [Math.floor(nowMs / 1000), nowMs]
    );

  const rows = result[0]?.values || [];
  const seen = new Set<string>();
  for (const row of rows) {
    const roleKey = String(row[0] ?? '').trim();
    if (roleKey) {
      seen.add(roleKey);
    }
  }
  return Array.from(seen);
}

// {FLOW} CONTINUITY-BROADCAST-BOARD-READ: 设置页只读观察窗，从 identity_thread_24h 导出每个身份最近 24h 广播板。
export function listIdentityThreadBoardSnapshots(
  db: Database,
  options?: { agentRoleKey?: string; limit?: number }
): IdentityThreadBoardSnapshot[] {
  try {
    const normalizedLimit = Number.isFinite(options?.limit)
      ? Math.max(1, Math.min(60, Math.floor(options?.limit as number)))
      : 24;
    const roleKeys = listActiveIdentityThreadRoleKeys(db, options?.agentRoleKey);

    return roleKeys.flatMap((agentRoleKey) => {
      const mergedThread = loadMergedThreadState(db, agentRoleKey);
      if (!mergedThread) {
        return [];
      }

      return [{
        agentRoleKey,
        messageCount: mergedThread.messages.length,
        updatedAt: mergedThread.updatedAtMs,
        expiresAt: mergedThread.expiresAtMs,
        summaryText: buildSharedThreadPromptBody(mergedThread.messages),
        entries: mergedThread.messages.slice(-normalizedLimit).map((message) => ({
          role: message.role,
          content: String(message.content || '').trim(),
          sessionId: typeof message.session_id === 'string' ? message.session_id : undefined,
          channelHint: message.channel_hint,
          channelLabel: normalizeSharedThreadChannel(message.channel_hint),
          timestamp: normalizeThreadTimestampMs(message.timestamp),
          timeLabel: formatCompactThreadTime(message.timestamp),
          channelSeq: Number.isFinite(Number(message.channel_seq))
            ? Number(message.channel_seq)
            : undefined,
        })),
      }];
    });
  } catch (error) {
    console.error('Failed to list identity thread board snapshots:', error);
    return [];
  }
}

/**
 * appendToIdentityThread - 24h 线程写入核心
 * {标记} P0架构修复: 去掉 modelId，只按 agentRoleKey 隔离
 */
export function appendToIdentityThread(
  db: Database,
  agentRoleKey: string,
  message: { role: 'user' | 'assistant'; content: string },
  channelHint?: string,
  sessionId?: string
): void {
  appendIdentityThreadMessage(db, agentRoleKey, message.role, message.content, channelHint, sessionId);
}

export function seedIdentityThreadBootstrap(
  db: Database,
  agentRoleKey: string,
  summary: string,
  channelHint = 'memory-db'
): void {
  appendIdentityThreadMessage(db, agentRoleKey, 'bootstrap', summary, channelHint);
}

function appendIdentityThreadMessage(
  db: Database,
  agentRoleKey: string,
  role: 'user' | 'assistant' | 'bootstrap',
  content: string,
  channelHint?: string,
  sessionId?: string
): void {
  try {
    // {FLOW} CONTINUITY-TRUNK-THREAD-SUMMARIZE
    // {BREAKPOINT} continuity-thread-summary-001
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;
    const summarizedContent = normalizeSharedThreadSummary(content, role);
    if (!summarizedContent) {
      return;
    }
    const existingRows = loadThreadRows(db, agentRoleKey);
    const existingMessages = existingRows
      .flatMap((row) => parseThreadMessages(row.context))
      .sort((a, b) => normalizeThreadTimestampMs(a.timestamp) - normalizeThreadTimestampMs(b.timestamp));
    const channelSeq = resolveNextChannelSequence(existingMessages, role, channelHint);
    const messageWithChannel = {
      role,
      content: summarizedContent,
      session_id: sessionId || undefined,
      channel_hint: channelHint || undefined,
      timestamp: now,
      channel_seq: channelSeq,
    };
    let threadId: string;

    if (existingRows.length > 0) {
      threadId = existingRows[0].id;
      const mergedMessages = compressThreadMessages(
        existingMessages
          .concat(messageWithChannel)
          .sort((a, b) => normalizeThreadTimestampMs(a.timestamp) - normalizeThreadTimestampMs(b.timestamp))
      );
      db.run('UPDATE identity_thread_24h SET context = ?, message_count = ?, updated_at = ?, expires_at = ?, channel_hint = ?, model_id = ? WHERE id = ?',
        [JSON.stringify(mergedMessages), mergedMessages.length, now, expiresAt, channelHint || null, '', threadId]);
      for (let index = 1; index < existingRows.length; index += 1) {
        db.run('DELETE FROM identity_thread_24h WHERE id = ?', [existingRows[index].id]);
      }
    } else {
      threadId = `thread_${now}_${Math.random().toString(36).substr(2, 9)}`;
      db.run(`INSERT INTO identity_thread_24h (id, agent_role_key, model_id, context, message_count, channel_hint, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [threadId, agentRoleKey, '', JSON.stringify([messageWithChannel]), 1, channelHint || null, now, now, expiresAt]);
    }
  } catch (error) {
    console.error('Failed to append to identity thread:', error);
  }
}

export function cleanupExpiredIdentityThreads(db: Database): number {
  try {
    const nowMs = Date.now();
    db.run('DELETE FROM identity_thread_24h WHERE (expires_at < 1e12 AND expires_at <= ?) OR (expires_at >= 1e12 AND expires_at <= ?)',
      [Math.floor(nowMs / 1000), nowMs]);
    return 1;
  } catch (error) {
    console.error('Failed to cleanup expired threads:', error);
    return 0;
  }
}

export function clearIdentityThreadForRole(db: Database, agentRoleKey: string): number {
  try {
    const normalizedRoleKey = agentRoleKey?.trim();
    if (!normalizedRoleKey) {
      return 0;
    }
    db.run('DELETE FROM identity_thread_24h WHERE agent_role_key = ?', [normalizedRoleKey]);
    return 1;
  } catch (error) {
    console.error('Failed to clear identity thread for role:', error);
    return 0;
  }
}

/** 启动时合并历史数据 — 同一 agentRoleKey 下多条记录合并为一条 */
export function migrateThreadsDropModelId(db: Database): void {
  try {
    const all = db.exec('SELECT id, agent_role_key, context, message_count, expires_at FROM identity_thread_24h ORDER BY updated_at DESC');
    if (!all.length || !all[0].values.length) return;
    const byRole = new Map<string, Array<{ id: string; context: string; expiresAt: number }>>();
    for (const row of all[0].values) {
      const rk = row[1] as string;
      if (!byRole.has(rk)) byRole.set(rk, []);
      byRole.get(rk)!.push({ id: row[0] as string, context: row[2] as string, expiresAt: row[4] as number });
    }
    for (const [rk, threads] of byRole) {
      if (threads.length <= 1) { db.run('UPDATE identity_thread_24h SET model_id = ? WHERE id = ?', ['', threads[0].id]); continue; }
      let msgs: any[] = [];
      for (const t of threads) {
        try {
          msgs.push(...JSON.parse(t.context));
        } catch {
          // Ignore malformed historical thread rows during merge.
        }
      }
      msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      msgs = compressThreadMessages(msgs);
      const now = Date.now();
      const exp = Math.max(...threads.map(t => t.expiresAt < 1e12 ? t.expiresAt * 1000 : t.expiresAt));
      db.run('UPDATE identity_thread_24h SET context = ?, message_count = ?, model_id = ?, updated_at = ?, expires_at = ? WHERE id = ?',
        [JSON.stringify(msgs), msgs.length, '', now, exp, threads[0].id]);
      for (let i = 1; i < threads.length; i++) db.run('DELETE FROM identity_thread_24h WHERE id = ?', [threads[i].id]);
      console.log(`[IdentityThread] Migrated ${threads.length} threads for role=${rk} → ${msgs.length} messages`);
    }
  } catch (error) { console.error('[IdentityThread] Migration failed:', error); }
}
