import { app } from './electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import {
  isQuestionLikeMemoryText,
  type CoworkMemoryGuardLevel,
} from './coworkStore/helpers';
import {
  shouldRunDailyConversationBackup,
  writeConversationBackupSnapshot,
} from './libs/conversationBackup';
import { resolveConversationFileCacheConfig } from '../shared/conversationFileCacheConfig';
import { buildSharedMemoryBoardRulesSection } from '../shared/continuityRules';
import * as CoworkStoreConstants from './coworkStore/constants';
import * as CoworkStoreHelpers from './coworkStore/helpers';

// Local variants that differ from helpers
function extractConversationSearchTerms(value: string): string[] {
  const normalized = CoworkStoreHelpers.normalizeMemoryText(value).toLowerCase();
  if (!normalized) return [];

  const terms: string[] = [];
  const seen = new Set<string>();
  const addTerm = (term: string): void => {
    const normalizedTerm = CoworkStoreHelpers.normalizeMemoryText(term).toLowerCase();
    if (!normalizedTerm) return;
    if (/^[a-z0-9]$/i.test(normalizedTerm)) return;
    if (seen.has(normalizedTerm)) return;
    seen.add(normalizedTerm);
    terms.push(normalizedTerm);
  };

  // Keep the full phrase and additionally match by per-token terms.
  addTerm(normalized);
  const tokens = normalized
    .split(/[\s,，、|/\\;；]+/g)
    .map((token) => token.replace(/^['"`]+|['"`]+$/g, '').trim())
    .filter(Boolean);

  for (const token of tokens) {
    addTerm(token);
    if (terms.length >= 8) break;
  }

  return terms.slice(0, 8);
}

// Local variants that differ from helpers
function scoreDeleteMatch(targetKey: string, queryKey: string): number {
  if (!targetKey || !queryKey) return 0;
  if (targetKey === queryKey) {
    return 1000 + queryKey.length;
  }
  if (!CoworkStoreHelpers.isMeaningfulDeleteFragment(queryKey)) {
    return 0;
  }
  if (!CoworkStoreHelpers.includesAsBoundedPhrase(targetKey, queryKey)) {
    return 0;
  }
  return 100 + Math.min(targetKey.length, queryKey.length);
}

function buildMemoryFingerprint(text: string): string {
  const key = CoworkStoreHelpers.normalizeMemoryMatchKey(text);
  return crypto.createHash('sha1').update(key).digest('hex');
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

function parseTimeToMs(input?: string | null): number | null {
  if (!input) return null;
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) return null;
  return timestamp;
}

function shouldAutoDeleteMemoryText(text: string): boolean {
  const normalized = CoworkStoreHelpers.normalizeMemoryText(text);
  if (!normalized) return false;
  return CoworkStoreConstants.MEMORY_ASSISTANT_STYLE_TEXT_RE.test(normalized)
    || CoworkStoreConstants.MEMORY_PROCEDURAL_TEXT_RE.test(normalized)
    || isQuestionLikeMemoryText(normalized);
}

// Types mirroring src/types/cowork.ts for main process use
export type CoworkSessionStatus = 'idle' | 'running' | 'completed' | 'error';
export type CoworkMessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
// {标记} P0-沙箱剔除：当前仅保留本地执行
export type CoworkExecutionMode = 'local';
export type CoworkSessionSource = 'desktop' | 'external';

export interface CoworkMessageMetadata {
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolUseId?: string | null;
  error?: string;
  isError?: boolean;
  isStreaming?: boolean;
  isFinal?: boolean;
  skillIds?: string[];
  imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
  generatedImages?: Array<{ name: string; mimeType?: string; base64Data?: string; url?: string }>;
  [key: string]: unknown;
}

export interface CoworkMessage {
  id: string;
  type: CoworkMessageType;
  content: string;
  timestamp: number;
  metadata?: CoworkMessageMetadata;
}

export interface CoworkSession {
  id: string;
  title: string;
  claudeSessionId: string | null;
  status: CoworkSessionStatus;
  pinned: boolean;
  cwd: string;
  systemPrompt: string;
  executionMode: CoworkExecutionMode;
  activeSkillIds: string[];
  messages: CoworkMessage[];
  createdAt: number;
  updatedAt: number;
  // {标记} 24小时线程支持：身份角色和模型ID
  agentRoleKey?: string;
  modelId?: string;
  sourceType?: CoworkSessionSource;
  historyMeta?: CoworkSessionHistoryMeta;
}

export interface CoworkSessionHistoryMeta {
  hasEarlierMessages: boolean;
  loadedMessageCount: number;
  totalMessageCount: number;
}

export interface DailyConversationBackupRunResult {
  status: 'disabled' | 'skipped' | 'completed' | 'failed';
  reason?: string;
  backupDir?: string;
  manifestPath?: string;
  sessionCount?: number;
  error?: string;
}

export interface CoworkSessionSummary {
  id: string;
  title: string;
  status: CoworkSessionStatus;
  pinned: boolean;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
  agentRoleKey?: string;
  modelId?: string;
  sourceType?: CoworkSessionSource;
}

type GetSessionOptions = {
  messageLimit?: number;
};

export type CoworkUserMemoryStatus = 'created' | 'stale' | 'deleted';

export interface CoworkUserMemory {
  id: string;
  text: string;
  confidence: number;
  isExplicit: boolean;
  status: CoworkUserMemoryStatus;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  agentRoleKey?: string;
  modelId?: string;
}

export interface CoworkUserMemorySource {
  id: string;
  memoryId: string;
  sessionId: string | null;
  messageId: string | null;
  role: 'user' | 'assistant' | 'tool' | 'system';
  isActive: boolean;
  createdAt: number;
}

export interface CoworkUserMemorySourceInput {
  sessionId?: string;
  messageId?: string;
  role?: 'user' | 'assistant' | 'tool' | 'system';
}

export interface CoworkUserMemoryStats {
  total: number;
  created: number;
  stale: number;
  deleted: number;
  explicit: number;
  implicit: number;
}

export interface CoworkConversationSearchRecord {
  sessionId: string;
  title: string;
  updatedAt: number;
  url: string;
  human: string;
  assistant: string;
}

export interface CoworkRoleConversationSqlQueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
}

export interface CoworkConfig {
  workingDirectory: string;
  systemPrompt: string;
  executionMode: CoworkExecutionMode;
  memoryEnabled: boolean;
  memoryImplicitUpdateEnabled: boolean;
  memoryLlmJudgeEnabled: boolean;
  memoryGuardLevel: CoworkMemoryGuardLevel;
  memoryUserMemoriesMaxItems: number;
  // {标记} 24小时线程支持：当前选中的身份角色
  agentRoleKey?: string;
}

export type CoworkConfigUpdate = Partial<Pick<
  CoworkConfig,
  | 'workingDirectory'
  | 'executionMode'
  | 'memoryEnabled'
  | 'memoryImplicitUpdateEnabled'
  | 'memoryLlmJudgeEnabled'
  | 'memoryGuardLevel'
  | 'memoryUserMemoriesMaxItems'
  | 'agentRoleKey'
>>;

export interface ApplyTurnMemoryUpdatesOptions {
  sessionId: string;
  userText: string;
  assistantText: string;
  implicitEnabled: boolean;
  memoryLlmJudgeEnabled: boolean;
  guardLevel: CoworkMemoryGuardLevel;
  userMessageId?: string;
  assistantMessageId?: string;
  // {标记} P1-新增：身份字段
  agentRoleKey?: string;
  modelId?: string;
}

export interface ApplyTurnMemoryUpdatesResult {
  totalChanges: number;
  created: number;
  updated: number;
  deleted: number;
  judgeRejected: number;
  llmReviewed: number;
  skipped: number;
}

let cachedDefaultSystemPrompt: string | null = null;

const getDefaultSystemPrompt = (): string => {
  if (cachedDefaultSystemPrompt !== null) {
    return cachedDefaultSystemPrompt;
  }

  // Default system prompt — 自我修养核心原则（渐进式披露：日常极简版）
  cachedDefaultSystemPrompt = `## 自我修养
- 调用新工具前：先查「AGENT 错题集.md」
- 遇到麻烦时按顺序排查：1. 错题本 2. Skills 3. MCP 工具 4. 小眼睛
- 遇到错误：先查已有踩坑记录；如果是新问题，记到「快速记录错误.md」，解决后标记✅
- 同类错误如果连续撞上 5 次以上，先停下来复盘并翻踩坑笔记，不要硬撞
- 修改代码前：查「祖传勿改代码清单.md」
- 核心原则：不要重复踩同一个坑

${buildSharedMemoryBoardRulesSection()}`;

  return cachedDefaultSystemPrompt;
};

interface CoworkMessageRow {
  id: string;
  type: string;
  content: string;
  metadata: string | null;
  created_at: number;
  sequence: number | null;
}

interface CoworkUserMemoryRow {
  id: string;
  text: string;
  fingerprint: string;
  confidence: number;
  is_explicit: number;
  status: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
  agent_role_key?: string | null;
  model_id?: string | null;
}

export class CoworkStore {
  private db: Database;
  private saveDb: () => void;
  private tableExistsCache = new Map<string, boolean>();

  constructor(db: Database, saveDb: () => void) {
    this.db = db;
    this.saveDb = saveDb;
  }

  // {标记} P0-1: 暴露数据库访问；当前这条更多是 legacy compatibility 用途，不代表 CoworkRunner 仍是现役 Web 主链。
  getDatabase(): Database {
    return this.db;
  }

  getSaveFunction(): () => void {
    return this.saveDb;
  }

  private getOne<T>(sql: string, params: (string | number | null)[] = []): T | undefined {
    const result = this.db.exec(sql, params);
    if (!result[0]?.values[0]) return undefined;
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row as T;
  }

  private getAll<T>(sql: string, params: (string | number | null)[] = []): T[] {
    const result = this.db.exec(sql, params);
    if (!result[0]?.values) return [];
    const columns = result[0].columns;
    return result[0].values.map((values) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row as T;
    });
  }

  private hasTable(tableName: string): boolean {
    const cached = this.tableExistsCache.get(tableName);
    if (cached !== undefined) {
      return cached;
    }

    const result = this.db.exec(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      [tableName]
    );
    const exists = Boolean(result[0]?.values?.[0]?.[0]);
    this.tableExistsCache.set(tableName, exists);
    return exists;
  }

  createSession(
    title: string,
    cwd: string,
    systemPrompt: string = '',
    executionMode: CoworkExecutionMode = 'local',
    activeSkillIds: string[] = [],
    metadata: Pick<CoworkSession, 'agentRoleKey' | 'modelId' | 'sourceType'> = {}
  ): CoworkSession {
    const id = uuidv4();
    const now = Date.now();
    const normalizedExecutionMode: CoworkExecutionMode = 'local';

    this.db.run(`
      INSERT INTO cowork_sessions (
        id, title, claude_session_id, status, cwd, system_prompt, execution_mode,
        active_skill_ids, agent_role_key, model_id, source_type, pinned, created_at, updated_at
      )
      VALUES (?, ?, NULL, 'idle', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `, [
      id,
      title,
      cwd,
      systemPrompt,
      normalizedExecutionMode,
      JSON.stringify(activeSkillIds),
      metadata.agentRoleKey ?? null,
      metadata.modelId ?? null,
      metadata.sourceType ?? null,
      now,
      now,
    ]);

    this.saveDb();

    return {
      id,
      title,
      claudeSessionId: null,
      status: 'idle',
      pinned: false,
      cwd,
      systemPrompt,
      executionMode: normalizedExecutionMode,
      activeSkillIds,
      messages: [],
      createdAt: now,
      updatedAt: now,
      agentRoleKey: metadata.agentRoleKey,
      modelId: metadata.modelId,
      sourceType: metadata.sourceType,
    };
  }

  getSession(id: string, options: GetSessionOptions = {}): CoworkSession | null {
    // ##混淆点注意：
    // 1. 会话全文历史主真相源始终是 cowork_messages。
    // 2. 这里的 messageLimit 只影响“本次返回给 UI/接口的装载量”，不代表旧消息被删掉了。
    // 3. “角色现在只能搜到摘要/片段”是执行器工具层的暴露方式，不是数据库里只剩摘要。
    interface SessionRow {
      id: string;
      title: string;
      claude_session_id: string | null;
      status: string;
      pinned?: number | null;
      cwd: string;
      system_prompt: string;
      execution_mode?: string | null;
      active_skill_ids?: string | null;
      agent_role_key?: string | null;
      model_id?: string | null;
      source_type?: string | null;
      created_at: number;
      updated_at: number;
    }

    const row = this.getOne<SessionRow>(`
      SELECT id, title, claude_session_id, status, pinned, cwd, system_prompt, execution_mode, active_skill_ids, agent_role_key, model_id, source_type, created_at, updated_at
      FROM cowork_sessions
      WHERE id = ?
    `, [id]);

    if (!row) return null;

    const totalMessageCount = this.getSessionMessageCount(id);
    const messages = this.getSessionMessages(id, options);

    let activeSkillIds: string[] = [];
    if (row.active_skill_ids) {
      try {
        activeSkillIds = JSON.parse(row.active_skill_ids);
      } catch {
        activeSkillIds = [];
      }
    }

    return {
      id: row.id,
      title: row.title,
      claudeSessionId: row.claude_session_id,
      status: row.status as CoworkSessionStatus,
      pinned: Boolean(row.pinned),
      cwd: row.cwd,
      systemPrompt: row.system_prompt,
      executionMode: 'local',
      activeSkillIds,
      messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // {标记} P0-IDENTITY-BOUNDARY: session 返回给上层时，身份只认 agent_role_key；model_id 只作为当前运行时发动机元信息透传。
      agentRoleKey: row.agent_role_key || undefined,
      modelId: row.model_id || undefined,
      sourceType: row.source_type === 'desktop' || row.source_type === 'external'
        ? row.source_type
        : undefined,
      historyMeta: {
        hasEarlierMessages: totalMessageCount > messages.length,
        loadedMessageCount: messages.length,
        totalMessageCount,
      },
    };
  }

  updateSession(
    id: string,
    updates: Partial<Pick<CoworkSession, 'title' | 'claudeSessionId' | 'status' | 'cwd' | 'systemPrompt' | 'executionMode' | 'agentRoleKey' | 'modelId' | 'sourceType'>>
  ): void {
    // {标记} P0-IDENTITY-BOUNDARY: 这里只允许更新 session 的运行时模型元信息，不允许把 modelId 升格成身份隔离主键。
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.claudeSessionId !== undefined) {
      setClauses.push('claude_session_id = ?');
      values.push(updates.claudeSessionId);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.cwd !== undefined) {
      setClauses.push('cwd = ?');
      values.push(updates.cwd);
    }
    if (updates.systemPrompt !== undefined) {
      setClauses.push('system_prompt = ?');
      values.push(updates.systemPrompt);
    }
    if (updates.executionMode !== undefined) {
      setClauses.push('execution_mode = ?');
      values.push('local');
    }
    if (updates.agentRoleKey !== undefined) {
      setClauses.push('agent_role_key = ?');
      values.push(updates.agentRoleKey);
    }
    if (updates.modelId !== undefined) {
      setClauses.push('model_id = ?');
      values.push(updates.modelId);
    }
    if (updates.sourceType !== undefined) {
      setClauses.push('source_type = ?');
      values.push(updates.sourceType);
    }

    values.push(id);
    this.db.run(`
      UPDATE cowork_sessions
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `, values);

    this.saveDb();
  }

  deleteSession(id: string): void {
    this.markMemorySourcesInactiveBySession(id);
    if (this.hasTable('scheduled_task_runs')) {
      this.db.run('UPDATE scheduled_task_runs SET session_id = NULL WHERE session_id = ?', [id]);
    }
    if (this.hasTable('cowork_messages')) {
      this.db.run('DELETE FROM cowork_messages WHERE session_id = ?', [id]);
    }
    this.db.run('DELETE FROM cowork_sessions WHERE id = ?', [id]);
    this.markOrphanImplicitMemoriesStale();
    this.saveDb();
  }

  deleteSessions(ids: string[]): void {
    if (ids.length === 0) return;
    for (const id of ids) {
      this.markMemorySourcesInactiveBySession(id);
    }
    const placeholders = ids.map(() => '?').join(',');
    if (this.hasTable('scheduled_task_runs')) {
      this.db.run(`UPDATE scheduled_task_runs SET session_id = NULL WHERE session_id IN (${placeholders})`, ids);
    }
    if (this.hasTable('cowork_messages')) {
      this.db.run(`DELETE FROM cowork_messages WHERE session_id IN (${placeholders})`, ids);
    }
    this.db.run(`DELETE FROM cowork_sessions WHERE id IN (${placeholders})`, ids);
    this.markOrphanImplicitMemoriesStale();
    this.saveDb();
  }

  pruneSessionsByTitle(title: string, keepCount: number = 1): string[] {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return [];
    }

    const rows = this.getAll<{ id: string }>(`
      SELECT id
      FROM cowork_sessions
      WHERE title = ?
      ORDER BY created_at DESC, updated_at DESC
    `, [normalizedTitle]);

    const deleteIds = rows.slice(Math.max(keepCount, 0)).map((row) => row.id);
    if (deleteIds.length > 0) {
      this.deleteSessions(deleteIds);
    }
    return deleteIds;
  }

  setSessionPinned(id: string, pinned: boolean): void {
    this.db.run('UPDATE cowork_sessions SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]);
    this.saveDb();
  }

  listSessions(): CoworkSessionSummary[] {
    interface SessionSummaryRow {
      id: string;
      title: string;
      status: string;
      pinned: number | null;
      system_prompt?: string | null;
      agent_role_key?: string | null;
      model_id?: string | null;
      source_type?: string | null;
      created_at: number;
      updated_at: number;
    }

    const rows = this.getAll<SessionSummaryRow>(`
      SELECT id, title, status, pinned, system_prompt, agent_role_key, model_id, source_type, created_at, updated_at
      FROM cowork_sessions
      ORDER BY pinned DESC, updated_at DESC
    `);

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      status: row.status as CoworkSessionStatus,
      pinned: Boolean(row.pinned),
      systemPrompt: row.system_prompt || undefined,
      agentRoleKey: row.agent_role_key || undefined,
      modelId: row.model_id || undefined,
      sourceType: row.source_type === 'desktop' || row.source_type === 'external'
        ? row.source_type
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  resetRunningSessions(): number {
    const now = Date.now();
    this.db.run(`
      UPDATE cowork_sessions
      SET status = 'error', updated_at = ?
      WHERE status = 'running'
    `, [now]);
    this.saveDb();

    const changes = this.db.getRowsModified?.();
    return typeof changes === 'number' ? changes : 0;
  }

  listRecentCwds(limit: number = 8): string[] {
    interface CwdRow {
      cwd: string;
      updated_at: number;
    }

    const rows = this.getAll<CwdRow>(`
      SELECT cwd, updated_at
      FROM cowork_sessions
      WHERE cwd IS NOT NULL AND TRIM(cwd) != ''
      ORDER BY updated_at DESC
      LIMIT ?
    `, [Math.max(limit * 8, limit)]);

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const normalized = CoworkStoreHelpers.normalizeRecentWorkspacePath(row.cwd);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      deduped.push(normalized);
      if (deduped.length >= limit) {
        break;
      }
    }

    return deduped;
  }

  private getSessionMessageCount(sessionId: string): number {
    const row = this.getOne<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM cowork_messages
      WHERE session_id = ?
    `, [sessionId]);
    return Number(row?.count) || 0;
  }

  private getSessionMessages(sessionId: string, options: GetSessionOptions = {}): CoworkMessage[] {
    // ##混淆点注意：
    // messageLimit != history pruning
    // 这里只是按需取最近 N 条给前端，完整正文仍留在 cowork_messages 里。
    const requestedLimit = Number.isFinite(options.messageLimit)
      ? Math.max(1, Math.floor(options.messageLimit as number))
      : null;

    const rows = requestedLimit
      ? this.getAll<CoworkMessageRow>(`
        SELECT id, type, content, metadata, created_at, sequence
        FROM (
          SELECT id, type, content, metadata, created_at, sequence, ROWID AS _rowid
          FROM cowork_messages
          WHERE session_id = ?
          ORDER BY
            COALESCE(sequence, created_at) DESC,
            created_at DESC,
            ROWID DESC
          LIMIT ?
        )
        ORDER BY
          COALESCE(sequence, created_at) ASC,
          created_at ASC,
          _rowid ASC
      `, [sessionId, requestedLimit])
      : this.getAll<CoworkMessageRow>(`
        SELECT id, type, content, metadata, created_at, sequence
        FROM cowork_messages
        WHERE session_id = ?
        ORDER BY
          COALESCE(sequence, created_at) ASC,
          created_at ASC,
          ROWID ASC
      `, [sessionId]);

    return rows.map(row => ({
      id: row.id,
      type: row.type as CoworkMessageType,
      content: row.content,
      timestamp: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  addMessage(sessionId: string, message: Omit<CoworkMessage, 'id' | 'timestamp'>): CoworkMessage {
    const id = uuidv4();
    const now = Date.now();
    const sessionIdentity = this.getOne<{ agent_role_key: string | null; model_id: string | null }>(`
      SELECT agent_role_key, model_id
      FROM cowork_sessions
      WHERE id = ?
      LIMIT 1
    `, [sessionId]);

    const sequenceRow = this.db.exec(`
      SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq
      FROM cowork_messages
      WHERE session_id = ?
    `, [sessionId]);
    const sequence = sequenceRow[0]?.values[0]?.[0] as number || 1;

    this.db.run(`
      INSERT INTO cowork_messages (id, session_id, type, content, metadata, agent_role_key, model_id, created_at, sequence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      sessionId,
      message.type,
      message.content,
      message.metadata ? JSON.stringify(message.metadata) : null,
      sessionIdentity?.agent_role_key || 'organizer',
      sessionIdentity?.model_id || '',
      now,
      sequence,
    ]);

    this.db.run('UPDATE cowork_sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);

    this.saveDb();

    return {
      id,
      type: message.type,
      content: message.content,
      timestamp: now,
      metadata: message.metadata,
    };
  }

  updateMessage(sessionId: string, messageId: string, updates: { content?: string; metadata?: CoworkMessageMetadata }): void {
    const setClauses: string[] = [];
    const values: (string | null)[] = [];

    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      values.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (setClauses.length === 0) return;

    values.push(messageId);
    values.push(sessionId);
    this.db.run(`
      UPDATE cowork_messages
      SET ${setClauses.join(', ')}
      WHERE id = ? AND session_id = ?
    `, values);

    this.saveDb();
  }

  // Config operations
  getConfig(): CoworkConfig {
    interface ConfigRow {
      value: string;
    }

    const workingDirRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['workingDirectory']);
    const memoryEnabledRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['memoryEnabled']);
    const memoryImplicitUpdateEnabledRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['memoryImplicitUpdateEnabled']);
    const memoryLlmJudgeEnabledRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['memoryLlmJudgeEnabled']);
    const memoryGuardLevelRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['memoryGuardLevel']);
    const memoryUserMemoriesMaxItemsRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['memoryUserMemoriesMaxItems']);
    const agentRoleKeyRow = this.getOne<ConfigRow>('SELECT value FROM cowork_config WHERE key = ?', ['agentRoleKey']);

    const normalizedExecutionMode: CoworkExecutionMode = 'local';

    return {
      workingDirectory: workingDirRow?.value || CoworkStoreHelpers.getDefaultWorkingDirectory(),
      systemPrompt: getDefaultSystemPrompt(),
      executionMode: normalizedExecutionMode,
      memoryEnabled: CoworkStoreHelpers.parseBooleanConfig(memoryEnabledRow?.value, CoworkStoreConstants.DEFAULT_MEMORY_ENABLED),
      memoryImplicitUpdateEnabled: CoworkStoreHelpers.parseBooleanConfig(
        memoryImplicitUpdateEnabledRow?.value,
        CoworkStoreConstants.DEFAULT_MEMORY_IMPLICIT_UPDATE_ENABLED
      ),
      memoryLlmJudgeEnabled: CoworkStoreHelpers.parseBooleanConfig(
        memoryLlmJudgeEnabledRow?.value,
        CoworkStoreConstants.DEFAULT_MEMORY_LLM_JUDGE_ENABLED
      ),
      memoryGuardLevel: CoworkStoreHelpers.normalizeMemoryGuardLevel(memoryGuardLevelRow?.value),
      memoryUserMemoriesMaxItems: CoworkStoreHelpers.clampMemoryUserMemoriesMaxItems(Number(memoryUserMemoriesMaxItemsRow?.value)),
      agentRoleKey: agentRoleKeyRow?.value?.trim() || undefined,
    };
  }

  setConfig(config: CoworkConfigUpdate): void {
    const now = Date.now();

    if (config.workingDirectory !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('workingDirectory', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [config.workingDirectory, now]);
    }

    if (config.executionMode !== undefined) {
      // {标记} P0-EXECUTION-MODE-KEY-RETIRED: 前端若还带 executionMode 更新进来，这里直接清旧 key，
      // 不再继续把这个配置键当成现役入口保存。
      this.db.run(`DELETE FROM cowork_config WHERE key = 'executionMode'`);
    }

    if (config.memoryEnabled !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('memoryEnabled', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [config.memoryEnabled ? '1' : '0', now]);
    }

    if (config.memoryImplicitUpdateEnabled !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('memoryImplicitUpdateEnabled', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [config.memoryImplicitUpdateEnabled ? '1' : '0', now]);
    }

    if (config.memoryLlmJudgeEnabled !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('memoryLlmJudgeEnabled', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [config.memoryLlmJudgeEnabled ? '1' : '0', now]);
    }

    if (config.memoryGuardLevel !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('memoryGuardLevel', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [CoworkStoreHelpers.normalizeMemoryGuardLevel(config.memoryGuardLevel), now]);
    }

    if (config.memoryUserMemoriesMaxItems !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('memoryUserMemoriesMaxItems', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [String(CoworkStoreHelpers.clampMemoryUserMemoriesMaxItems(config.memoryUserMemoriesMaxItems)), now]);
    }

    if (config.agentRoleKey !== undefined) {
      this.db.run(`
        INSERT INTO cowork_config (key, value, updated_at)
        VALUES ('agentRoleKey', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `, [config.agentRoleKey, now]);
    }

    this.saveDb();
  }

  getAppLanguage(): 'zh' | 'en' {
    interface KvRow {
      value: string;
    }

    const row = this.getOne<KvRow>('SELECT value FROM kv WHERE key = ?', ['app_config']);
    if (!row?.value) {
      return 'zh';
    }

    try {
      const config = JSON.parse(row.value) as { language?: string };
      return config.language === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  }

  private mapMemoryRow(row: CoworkUserMemoryRow): CoworkUserMemory {
    return {
      id: row.id,
      text: row.text,
      confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.7,
      isExplicit: Boolean(row.is_explicit),
      status: (row.status === 'stale' || row.status === 'deleted' ? row.status : 'created') as CoworkUserMemoryStatus,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
      agentRoleKey: row.agent_role_key?.trim() || undefined,
      modelId: row.model_id?.trim() || undefined,
    };
  }

  private addMemorySource(
    memoryId: string,
    source?: CoworkUserMemorySourceInput
  ): void {
    if (!this.hasTable('user_memory_sources')) {
      return;
    }
    const now = Date.now();
    // {标记} P0-SOURCE-TABLE-SINGLE-RESPONSIBILITY: user_memory_sources 只保来源关系，
    // 不再继续写 role/model 元信息，避免把辅助表误读成身份表。
    this.db.run(`
      INSERT INTO user_memory_sources (id, memory_id, session_id, message_id, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `, [
      uuidv4(),
      memoryId,
      source?.sessionId || null,
      source?.messageId || null,
      source?.role || 'system',
      now,
    ]);
  }

  private createOrReviveUserMemory(input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
    source?: CoworkUserMemorySourceInput;
    // {标记} P1-新增：身份字段（长期记忆仅按 agentRoleKey 隔离，modelId 仅保留为元信息）
    agentRoleKey?: string;
    modelId?: string;
  }): { memory: CoworkUserMemory; created: boolean; updated: boolean } {
    const normalizedText = truncate(CoworkStoreHelpers.normalizeMemoryText(input.text), 360);
    if (!normalizedText) {
      throw new Error('Memory text is required');
    }

    const now = Date.now();
    const fingerprint = buildMemoryFingerprint(normalizedText);
    const confidence = Math.max(0, Math.min(1, Number.isFinite(input.confidence) ? Number(input.confidence) : 0.75));
    const explicitFlag = input.isExplicit ? 1 : 0;
    const agentRoleKey = input.agentRoleKey || 'organizer';
    const modelId = input.modelId || '';

    let existing = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
      FROM user_memories
      WHERE fingerprint = ? AND status != 'deleted' AND agent_role_key = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `, [fingerprint, agentRoleKey]);

    if (!existing) {
      const incomingSemanticKey = CoworkStoreHelpers.normalizeMemorySemanticKey(normalizedText);
      if (incomingSemanticKey) {
        const candidates = this.getAll<CoworkUserMemoryRow>(`
          SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
          FROM user_memories
          WHERE status != 'deleted' AND agent_role_key = ?
          ORDER BY updated_at DESC
          LIMIT 200
        `, [agentRoleKey]);
        let bestCandidate: CoworkUserMemoryRow | null = null;
        let bestScore = 0;
        for (const candidate of candidates) {
          const candidateSemanticKey = CoworkStoreHelpers.normalizeMemorySemanticKey(candidate.text);
          if (!candidateSemanticKey) continue;
          const score = CoworkStoreHelpers.scoreMemorySimilarity(candidateSemanticKey, incomingSemanticKey);
          if (score <= bestScore) continue;
          bestScore = score;
          bestCandidate = candidate;
        }
        if (bestCandidate && bestScore >= CoworkStoreConstants.MEMORY_NEAR_DUPLICATE_MIN_SCORE) {
          existing = bestCandidate;
        }
      }
    }

    if (existing) {
      const mergedText = CoworkStoreHelpers.choosePreferredMemoryText(existing.text, normalizedText);
      const mergedExplicit = existing.is_explicit ? 1 : explicitFlag;
      const mergedConfidence = Math.max(Number(existing.confidence) || 0, confidence);
      const nextModelId = modelId || ((existing as CoworkUserMemoryRow & { model_id?: string }).model_id ?? '');
      // {标记} P0-LAST-USED-AT-MIN-ACTIVATE: 这轮先把 last_used_at 接到最小有意义语义：
      // 创建/复活/编辑记忆都刷新它，避免同表里一部分记录永远没有使用时间。
      this.db.run(`
        UPDATE user_memories
        SET text = ?, fingerprint = ?, confidence = ?, is_explicit = ?, status = 'created', updated_at = ?, last_used_at = ?, model_id = ?
        WHERE id = ?
      `, [mergedText, buildMemoryFingerprint(mergedText), mergedConfidence, mergedExplicit, now, now, nextModelId, existing.id]);
      this.addMemorySource(existing.id, input.source);
      const memory = this.getOne<CoworkUserMemoryRow>(`
        SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
        FROM user_memories
        WHERE id = ?
      `, [existing.id]);
      if (!memory) {
        throw new Error('Failed to reload updated memory');
      }
      return { memory: this.mapMemoryRow(memory), created: false, updated: true };
    }

    const id = uuidv4();
    this.db.run(`
      INSERT INTO user_memories (
        id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
      ) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)
    `, [id, normalizedText, fingerprint, confidence, explicitFlag, now, now, now, agentRoleKey, modelId]);
    // {标记} P1-MEMORY-SOURCE-IDENTITY: source 记录与主记忆同源写入角色/模型，避免默认值污染来源表。
    this.addMemorySource(id, input.source);

    const memory = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
      FROM user_memories
      WHERE id = ?
    `, [id]);
    if (!memory) {
      throw new Error('Failed to load created memory');
    }

    return { memory: this.mapMemoryRow(memory), created: true, updated: false };
  }

  listUserMemories(options: {
    query?: string;
    status?: CoworkUserMemoryStatus | 'all';
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
    // {标记} P1-新增：身份过滤
    agentRoleKey?: string;
  } = {}): CoworkUserMemory[] {
    const query = CoworkStoreHelpers.normalizeMemoryText(options.query || '');
    const includeDeleted = Boolean(options.includeDeleted);
    const status = options.status || 'all';
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 200)));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));

    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (!includeDeleted && status === 'all') {
      clauses.push(`status != 'deleted'`);
    }
    if (status !== 'all') {
      clauses.push('status = ?');
      params.push(status);
    }
    if (query) {
      clauses.push('LOWER(text) LIKE ?');
      params.push(`%${query.toLowerCase()}%`);
    }
    // {标记} P1-新增：身份过滤（长期记忆按 agentRoleKey 归桶，忽略 modelId）
    if (options.agentRoleKey) {
      clauses.push('agent_role_key = ?');
      params.push(options.agentRoleKey);
    }
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = this.getAll<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
      FROM user_memories
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return rows.map((row) => this.mapMemoryRow(row));
  }

  createUserMemory(input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
    source?: CoworkUserMemorySourceInput;
    // {标记} P1-新增：身份字段
    agentRoleKey?: string;
    modelId?: string;
  }): CoworkUserMemory {
    const result = this.createOrReviveUserMemory(input);
    this.saveDb();
    return result.memory;
  }

  updateUserMemory(input: {
    id: string;
    text?: string;
    confidence?: number;
    status?: CoworkUserMemoryStatus;
    isExplicit?: boolean;
  }): CoworkUserMemory | null {
    const current = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
      FROM user_memories
      WHERE id = ?
    `, [input.id]);
    if (!current) return null;

    const now = Date.now();
    const nextText = input.text !== undefined ? truncate(CoworkStoreHelpers.normalizeMemoryText(input.text), 360) : current.text;
    if (!nextText) {
      throw new Error('Memory text is required');
    }
    const nextConfidence = input.confidence !== undefined
      ? Math.max(0, Math.min(1, Number(input.confidence)))
      : Number(current.confidence);
    const nextStatus = input.status && (input.status === 'created' || input.status === 'stale' || input.status === 'deleted')
      ? input.status
      : current.status;
    const nextExplicit = input.isExplicit !== undefined ? (input.isExplicit ? 1 : 0) : current.is_explicit;

    this.db.run(`
      UPDATE user_memories
      SET text = ?, fingerprint = ?, confidence = ?, is_explicit = ?, status = ?, updated_at = ?, last_used_at = ?
      WHERE id = ?
    `, [nextText, buildMemoryFingerprint(nextText), nextConfidence, nextExplicit, nextStatus, now, now, input.id]);

    const updated = this.getOne<CoworkUserMemoryRow>(`
      SELECT id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at, agent_role_key, model_id
      FROM user_memories
      WHERE id = ?
    `, [input.id]);

    this.saveDb();
    return updated ? this.mapMemoryRow(updated) : null;
  }

  deleteUserMemory(id: string): boolean {
    const now = Date.now();
    this.db.run(`
      UPDATE user_memories
      SET status = 'deleted', updated_at = ?
      WHERE id = ?
    `, [now, id]);
    this.db.run(`
      UPDATE user_memory_sources
      SET is_active = 0
      WHERE memory_id = ?
    `, [id]);
    this.saveDb();
    return (this.db.getRowsModified?.() || 0) > 0;
  }

  getUserMemoryStats(options: { agentRoleKey?: string } = {}): CoworkUserMemoryStats {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (options.agentRoleKey) {
      clauses.push('agent_role_key = ?');
      params.push(options.agentRoleKey);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.getAll<{
      status: string;
      is_explicit: number;
      count: number;
    }>(`
      SELECT status, is_explicit, COUNT(*) AS count
      FROM user_memories
      ${whereClause}
      GROUP BY status, is_explicit
    `, params);

    const stats: CoworkUserMemoryStats = {
      total: 0,
      created: 0,
      stale: 0,
      deleted: 0,
      explicit: 0,
      implicit: 0,
    };

    for (const row of rows) {
      const count = Number(row.count) || 0;
      stats.total += count;
      if (row.status === 'created') stats.created += count;
      if (row.status === 'stale') stats.stale += count;
      if (row.status === 'deleted') stats.deleted += count;
      if (row.is_explicit) stats.explicit += count;
      else stats.implicit += count;
    }

    return stats;
  }

  autoDeleteNonPersonalMemories(): number {
    if (!this.hasTable('user_memories') || !this.hasTable('user_memory_sources')) {
      return 0;
    }

    const rows = this.getAll<Pick<CoworkUserMemoryRow, 'id' | 'text'>>(
      `SELECT id, text FROM user_memories WHERE status = 'created'`
    );
    if (rows.length === 0) return 0;

    const now = Date.now();
    let deleted = 0;
    for (const row of rows) {
      if (!shouldAutoDeleteMemoryText(row.text)) {
        continue;
      }
      this.db.run(`
        UPDATE user_memories
        SET status = 'deleted', updated_at = ?
        WHERE id = ?
      `, [now, row.id]);
      this.db.run(`
        UPDATE user_memory_sources
        SET is_active = 0
        WHERE memory_id = ?
      `, [row.id]);
      deleted += 1;
    }

    if (deleted > 0) {
      this.saveDb();
    }
    return deleted;
  }

  markMemorySourcesInactiveBySession(sessionId: string): void {
    if (!this.hasTable('user_memory_sources')) {
      return;
    }
    this.db.run(`
      UPDATE user_memory_sources
      SET is_active = 0
      WHERE session_id = ? AND is_active = 1
    `, [sessionId]);
  }

  markOrphanImplicitMemoriesStale(): void {
    if (!this.hasTable('user_memory_sources') || !this.hasTable('user_memories')) {
      return;
    }
    const now = Date.now();
    this.db.run(`
      UPDATE user_memories
      SET status = 'stale', updated_at = ?
      WHERE is_explicit = 0
        AND status = 'created'
        AND NOT EXISTS (
          SELECT 1
          FROM user_memory_sources s
          WHERE s.memory_id = user_memories.id AND s.is_active = 1
        )
    `, [now]);
  }

  async applyTurnMemoryUpdates(_options: ApplyTurnMemoryUpdatesOptions): Promise<ApplyTurnMemoryUpdatesResult> {
    // No-op: memory is now managed by MCP Memory server (knowledge graph).
    return { totalChanges: 0, created: 0, updated: 0, deleted: 0, judgeRejected: 0, llmReviewed: 0, skipped: 0 };
  }

  private getKvValue(key: string): string | null {
    const row = this.getOne<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  private setKvValue(key: string, value: string): void {
    const now = Date.now();
    this.db.run(`
      INSERT INTO kv (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `, [key, value, now]);
    this.saveDb();
  }

  private getConversationFileCacheDirectory(): string {
    // ##混淆点注意：
    // conversationFileCache.directory 不是消息正文库路径。
    // 它控制的是“每日对话归档目录 / 浏览器上传附件家目录 / 导出文件家目录”。
    // 角色聊天全文真正存储位置仍是 .uclaw/web/uclaw.sqlite 的 cowork_messages。
    const raw = this.getKvValue('app_config');
    if (!raw) {
      return '';
    }

    try {
      const config = JSON.parse(raw) as Parameters<typeof resolveConversationFileCacheConfig>[0];
      return resolveConversationFileCacheConfig(config).directory;
    } catch {
      return '';
    }
  }

  runDailyConversationBackupIfConfigured(options?: { now?: number; force?: boolean }): DailyConversationBackupRunResult {
    // [FLOW] 对话归档不应绑定到记忆抽取结果；只要有完整会话落盘条件，就尝试执行当天备份。
    return this.tryRunDailyConversationBackup(options);
  }

  private tryRunDailyConversationBackup(options?: { now?: number; force?: boolean }): DailyConversationBackupRunResult {
    const now = options?.now ?? Date.now();
    const directory = this.getConversationFileCacheDirectory();
    if (!directory) {
      return {
        status: 'disabled',
        reason: 'directory-not-configured',
      };
    }

    const lastBackupDate = this.getKvValue(CoworkStoreConstants.CONVERSATION_FILE_BACKUP_STATE_KEY);
    if (!options?.force && !shouldRunDailyConversationBackup(lastBackupDate, now)) {
      return {
        status: 'skipped',
        reason: 'already-backed-up-today',
      };
    }

    try {
      const sessions = this.listSessions()
        .map((session) => this.getSession(session.id))
        .filter((session): session is NonNullable<typeof session> => Boolean(session))
        .map((session) => ({
          id: session.id,
          title: session.title,
          cwd: session.cwd,
          status: session.status,
          agentRoleKey: session.agentRoleKey,
          systemPrompt: session.systemPrompt,
          sourceType: session.sourceType,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messages: session.messages.map((message) => ({
            id: message.id,
            type: message.type,
            content: message.content,
            timestamp: message.timestamp,
            metadata: message.metadata as Record<string, unknown> | undefined,
          })),
        }));

      const backup = writeConversationBackupSnapshot({
        directory,
        sessions,
        now,
      });
      this.setKvValue(CoworkStoreConstants.CONVERSATION_FILE_BACKUP_STATE_KEY, path.basename(backup.backupDir));
      return {
        status: 'completed',
        backupDir: backup.backupDir,
        manifestPath: backup.manifestPath,
        sessionCount: backup.sessionCount,
      };
    } catch (error) {
      console.warn('[cowork-backup] Failed to write daily conversation backup:', error);
      return {
        status: 'failed',
        reason: 'write-failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getLatestMessageByType(sessionId: string, type: 'user' | 'assistant'): string {
    const row = this.getOne<{ content: string }>(`
      SELECT content
      FROM cowork_messages
      WHERE session_id = ? AND type = ?
      ORDER BY created_at DESC, ROWID DESC
      LIMIT 1
    `, [sessionId, type]);
    return truncate((row?.content || '').replace(/\s+/g, ' ').trim(), 280);
  }

  conversationSearch(options: {
    query: string;
    maxResults?: number;
    before?: string;
    after?: string;
    // {标记} P0-身份隔离-FIX: 会话搜索按 agentRoleKey 归桶
    agentRoleKey?: string;
  }): CoworkConversationSearchRecord[] {
    const terms = extractConversationSearchTerms(options.query);
    if (terms.length === 0) return [];

    const maxResults = Math.max(1, Math.min(10, Math.floor(options.maxResults ?? 5)));
    const beforeMs = parseTimeToMs(options.before);
    const afterMs = parseTimeToMs(options.after);

    const likeClauses = terms.map(() => 'LOWER(m.content) LIKE ?');
    const clauses: string[] = [
      "m.type IN ('user', 'assistant')",
      `(${likeClauses.join(' OR ')})`,
    ];
    const params: Array<string | number> = terms.map((term) => `%${term}%`);

    if (beforeMs !== null) {
      clauses.push('m.created_at < ?');
      params.push(beforeMs);
    }
    if (afterMs !== null) {
      clauses.push('m.created_at > ?');
      params.push(afterMs);
    }
    // {标记} P0-身份隔离-FIX: 按身份过滤
    if (options.agentRoleKey) {
      clauses.push('s.agent_role_key = ?');
      params.push(options.agentRoleKey);
    }
    const rows = this.getAll<{
      session_id: string;
      title: string;
      updated_at: number;
      type: string;
      content: string;
      created_at: number;
    }>(`
      SELECT m.session_id, s.title, s.updated_at, m.type, m.content, m.created_at
      FROM cowork_messages m
      INNER JOIN cowork_sessions s ON s.id = m.session_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT ?
    `, [...params, maxResults * 40]);

    const bySession = new Map<string, CoworkConversationSearchRecord>();
    for (const row of rows) {
      if (!row.session_id) continue;
      let current = bySession.get(row.session_id);
      if (!current) {
        current = {
          sessionId: row.session_id,
          title: row.title || 'Untitled',
          updatedAt: Number(row.updated_at) || 0,
          url: `https://claude.ai/chat/${row.session_id}`,
          human: '',
          assistant: '',
        };
        bySession.set(row.session_id, current);
      }

      const snippet = truncate((row.content || '').replace(/\s+/g, ' ').trim(), 280);
      if (row.type === 'user' && !current.human) {
        current.human = snippet;
      }
      if (row.type === 'assistant' && !current.assistant) {
        current.assistant = snippet;
      }

      if (bySession.size >= maxResults) {
        const complete = Array.from(bySession.values()).every((entry) => entry.human && entry.assistant);
        if (complete) break;
      }
    }

    const records = Array.from(bySession.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, maxResults)
      .map((entry) => ({
        ...entry,
        human: entry.human || this.getLatestMessageByType(entry.sessionId, 'user'),
        assistant: entry.assistant || this.getLatestMessageByType(entry.sessionId, 'assistant'),
      }));

    return records;
  }

  recentChats(options: {
    n?: number;
    sortOrder?: 'asc' | 'desc';
    before?: string;
    after?: string;
    // {标记} P0-身份隔离-FIX: 最近会话按 agentRoleKey 归桶
    agentRoleKey?: string;
  }): CoworkConversationSearchRecord[] {
    const n = Math.max(1, Math.min(20, Math.floor(options.n ?? 3)));
    const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';
    const beforeMs = parseTimeToMs(options.before);
    const afterMs = parseTimeToMs(options.after);

    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (beforeMs !== null) {
      clauses.push('updated_at < ?');
      params.push(beforeMs);
    }
    if (afterMs !== null) {
      clauses.push('updated_at > ?');
      params.push(afterMs);
    }
    // {标记} P0-身份隔离-FIX: 按身份过滤
    if (options.agentRoleKey) {
      clauses.push('agent_role_key = ?');
      params.push(options.agentRoleKey);
    }
    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = this.getAll<{
      id: string;
      title: string;
      updated_at: number;
    }>(`
      SELECT id, title, updated_at
      FROM cowork_sessions
      ${whereClause}
      ORDER BY updated_at ${sortOrder.toUpperCase()}
      LIMIT ?
    `, [...params, n]);

    return rows.map((row) => ({
      sessionId: row.id,
      title: row.title || 'Untitled',
      updatedAt: Number(row.updated_at) || 0,
      url: `https://claude.ai/chat/${row.id}`,
      human: this.getLatestMessageByType(row.id, 'user'),
      assistant: this.getLatestMessageByType(row.id, 'assistant'),
    }));
  }

  queryRoleScopedConversationSql(options: {
    query: string;
    agentRoleKey?: string;
    maxRows?: number;
  }): CoworkRoleConversationSqlQueryResult {
    const agentRoleKey = String(options.agentRoleKey || 'organizer').trim() || 'organizer';
    const rawQuery = String(options.query || '').trim().replace(/;+$/g, '').trim();
    if (!rawQuery) {
      throw new Error('query is required');
    }

    const normalizedQuery = rawQuery.toLowerCase();
    if (!normalizedQuery.startsWith('select ')) {
      throw new Error('Only SELECT queries are allowed. Query role_sessions / role_messages instead of raw tables.');
    }

    if (/[;]/.test(rawQuery)) {
      throw new Error('Multiple SQL statements are not allowed.');
    }

    if (/\b(cowork_sessions|cowork_messages)\b/i.test(rawQuery)) {
      throw new Error('Use role_sessions / role_messages only. Raw cowork_* tables are blocked here.');
    }

    if (/\b(insert|update|delete|drop|alter|attach|detach|pragma|vacuum|create|replace|reindex)\b/i.test(rawQuery)) {
      throw new Error('Only read-only SELECT queries are allowed.');
    }

    const maxRows = Math.max(1, Math.min(200, Math.floor(options.maxRows ?? 50)));
    const scopedSql = `
      WITH role_sessions AS (
        SELECT id, title, claude_session_id, status, pinned, cwd, system_prompt, execution_mode, active_skill_ids, agent_role_key, model_id, source_type, created_at, updated_at
        FROM cowork_sessions
        WHERE agent_role_key = ?
      ),
      role_messages AS (
        SELECT id, session_id, type, content, metadata, agent_role_key, model_id, created_at, sequence
        FROM cowork_messages
        WHERE agent_role_key = ?
      ),
      scoped_query AS (
        ${rawQuery}
      )
      SELECT *
      FROM scoped_query
      LIMIT ?
    `;

    const result = this.db.exec(scopedSql, [agentRoleKey, agentRoleKey, maxRows]);
    const columns = result[0]?.columns ?? [];
    const values = result[0]?.values ?? [];
    const rows = values.map((rowValues) => {
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = rowValues[index];
      });
      return row;
    });

    return {
      columns,
      rows,
      rowCount: rows.length,
      truncated: rows.length >= maxRows,
    };
  }
}
