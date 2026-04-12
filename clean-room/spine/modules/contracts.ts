export type AgentRoleKey = string;

export type ChannelPlatform = 'web' | 'feishu' | 'dingtalk' | 'qq' | 'telegram';
export type SessionSourceType = 'desktop' | 'external';

export interface SessionRecord {
  id: string;
  title: string;
  cwd: string;
  status?: string;
  systemPrompt?: string;
  agentRoleKey?: string;
  // Runtime metadata only. Session/memory/thread identity is keyed by agentRoleKey.
  modelId?: string;
  sourceType?: SessionSourceType;
  messages?: Array<{
    id: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface SessionStore {
  getSession(sessionId: string): SessionRecord | null;
  createSession(
    title: string,
    cwd: string,
    systemPrompt?: string,
    executionMode?: 'local',
    activeSkillIds?: string[],
    metadata?: {
      agentRoleKey?: string;
      // Runtime metadata only. Never use as session reuse / memory isolation boundary.
      modelId?: string;
      sourceType?: SessionSourceType;
    }
  ): SessionRecord;
  addMessage(
    sessionId: string,
    message: {
      type: string;
      content: string;
      metadata?: Record<string, unknown>;
    }
  ): {
    id: string;
    type: string;
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
  updateSession(
    sessionId: string,
    updates: Partial<Pick<SessionRecord, 'title' | 'cwd' | 'status' | 'systemPrompt' | 'agentRoleKey' | 'modelId' | 'sourceType'>>
  ): void;
  getDatabase(): {
    exec(sql: string, params?: Array<string | number | null>): Array<{
      values: unknown[][];
    }>;
  };
}

export interface KvStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

export interface ChannelSessionBindingRecord {
  sessionId: string;
  scopeKey: string;
  updatedAt: number;
}

export interface IdentityThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  channel_hint?: string;
  timestamp?: number;
}

export interface IdentityThreadContext {
  historyText: string;
  messageCount: number;
  expiresInHours: number;
}

export interface MemoryEntry {
  id: string;
  text: string;
  status: 'created' | 'stale' | 'deleted';
  createdAt: number;
  updatedAt: number;
  agentRoleKey?: string;
  // Runtime metadata only. Memory bucket identity is agentRoleKey.
  modelId?: string;
}

export interface YesterdayFallbackResult {
  loadedFrom: 'shared-thread' | 'durable-memory' | 'none';
  summary: string;
  memoryIds: string[];
}
