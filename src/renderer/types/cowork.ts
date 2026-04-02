export interface CoworkRenderableImage {
  name: string;
  mimeType?: string;
  base64Data?: string;
  url?: string;
}

// Cowork image attachment for vision-capable models
export interface CoworkImageAttachment extends CoworkRenderableImage {
  name: string;
  mimeType: string;
  base64Data: string;
}

// Cowork session ID type
export type CoworkSessionId = string;

// Cowork session status
export type CoworkSessionStatus = 'idle' | 'running' | 'completed' | 'error';

// Cowork message types
export type CoworkMessageType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';

// Cowork execution mode
export type CoworkExecutionMode = 'local';
export type CoworkSessionSource = 'desktop' | 'external';

// Cowork message metadata
export interface CoworkMessageMetadata {
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolUseId?: string | null;
  error?: string;
  isError?: boolean;
  isStreaming?: boolean;
  isFinal?: boolean;
  isThinking?: boolean;
  skillIds?: string[];  // Skills used for this message
  imageAttachments?: CoworkImageAttachment[];
  generatedImages?: CoworkRenderableImage[];
  zenMode?: boolean;
  [key: string]: unknown;
}

// Cowork message
export interface CoworkMessage {
  id: string;
  type: CoworkMessageType;
  content: string;
  timestamp: number;
  metadata?: CoworkMessageMetadata;
}

// Cowork session
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

// Cowork configuration
export interface CoworkConfig {
  workingDirectory: string;
  systemPrompt: string;
  executionMode: CoworkExecutionMode;
  memoryEnabled: boolean;
  memoryImplicitUpdateEnabled: boolean;
  memoryLlmJudgeEnabled: boolean;
  memoryGuardLevel: 'strict' | 'standard' | 'relaxed';
  memoryUserMemoriesMaxItems: number;
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
>> & {
  agentRoleKey?: string;  // {标记} 支持更新身份角色
};

export interface CoworkApiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  apiType?: 'anthropic' | 'openai';
}

export type CoworkUserMemoryStatus = 'created' | 'stale' | 'deleted';

export interface CoworkUserMemoryEntry {
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

export interface CoworkMemoryStats {
  total: number;
  created: number;
  stale: number;
  deleted: number;
  explicit: number;
  implicit: number;
}

export interface CoworkBroadcastBoardEntry {
  role: string;
  content: string;
  channelHint?: string;
  channelLabel: string;
  timestamp: number;
  timeLabel: string;
  channelSeq?: number;
}

export interface CoworkBroadcastBoardSnapshot {
  agentRoleKey: string;
  messageCount: number;
  updatedAt: number;
  expiresAt: number;
  summaryText: string;
  entries: CoworkBroadcastBoardEntry[];
}

// Cowork pending permission request
export interface CoworkPermissionRequest {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
  toolUseId?: string | null;
}

export type CoworkPermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: Record<string, unknown>[];
      toolUseID?: string;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

// Cowork permission response
export interface CoworkPermissionResponse {
  requestId: string;
  result: CoworkPermissionResult;
}

// Session summary for list display (without full messages)
// {标记} P0-新增：身份字段
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

// Start session options
export interface CoworkStartOptions {
  prompt: string;
  cwd?: string;
  systemPrompt?: string;
  title?: string;
  activeSkillIds?: string[];
  imageAttachments?: CoworkImageAttachment[];
  zenMode?: boolean;
}

// Continue session options
export interface CoworkContinueOptions {
  sessionId: string;
  prompt: string;
  systemPrompt?: string;
  activeSkillIds?: string[];
  imageAttachments?: CoworkImageAttachment[];
  zenMode?: boolean;
}

// IPC result types
export interface CoworkSessionResult {
  success: boolean;
  session?: CoworkSession;
  error?: string;
}

export interface CoworkSessionListResult {
  success: boolean;
  sessions?: CoworkSessionSummary[];
  error?: string;
}

export interface CoworkConfigResult {
  success: boolean;
  config?: CoworkConfig;
  error?: string;
}

// Stream event types for IPC communication
export type CoworkStreamEventType =
  | 'message'
  | 'tool_use'
  | 'tool_result'
  | 'permission_request'
  | 'complete'
  | 'error';

export interface CoworkStreamEvent {
  type: CoworkStreamEventType;
  sessionId: string;
  data: {
    message?: CoworkMessage;
    permission?: CoworkPermissionRequest;
    error?: string;
    claudeSessionId?: string;
  };
}
