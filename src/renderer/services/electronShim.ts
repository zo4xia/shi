/**
 * Electron Shim for Web Build
 * Mimics window.electron interface using HTTP/WebSocket
 * This allows existing service files to work with minimal changes
 * {BREAKPOINT} LEGACY-ELECTRON-FACADE
 * {FLOW} PHASE1-COMPAT-FACADE: 这是 Web 前端当前的统一调用外形，现阶段只能继续压轻，不能局部拆壳导致调用面分裂。
 * {标记} 兼容壳残留: Web 前端当前仍以 window.electron 形状暴露服务。
 * {标记} 待评估-可能波及: src/renderer/services/* / src/renderer/App.tsx / Settings / cowork / skills / mcp。
 * {标记} 重构边界-待确认: 若去除此兼容壳，需要统一替换前端调用面，而不是局部删壳造成 API 面分裂。
 */

import { apiClient } from './apiClient';
import { webSocketClient, WS_EVENTS } from './webSocketClient';
import { initializeElectronShim } from './electronShimBootstrap';
import { routes } from './webApiContract';

// Import types from proper type files
import type {
  CoworkSession,
  CoworkMessage,
  CoworkSessionSummary,
  CoworkConfig,
  CoworkConfigUpdate,
  CoworkUserMemoryEntry,
  CoworkMemoryStats,
  CoworkBroadcastBoardSnapshot,
  CoworkPermissionRequest,
  CoworkPermissionResult,
  CoworkApiConfig,
} from '../types/cowork';
import type { Skill, UploadedSkillPayload } from '../types/skill';
import type { McpServerConfig as McpServerConfigIPC, McpMarketplaceData } from '../types/mcp';

// Types that are only in electron.d.ts - declare locally
interface EmailConnectivityTestResult {
  success: boolean;
  message: string;
}

interface DirectoryLookupResult {
  success: boolean;
  path?: string;
  exists?: boolean;
  isDirectory?: boolean;
  error?: string;
}

// ============================================================================
// {路标} FLOW-SERVICE-STORE
// Store API
// ============================================================================
const store = {
  async get<T>(key: string): Promise<T | null> {
    const result = await apiClient.get<T>(routes.store.key(key));
    if (!result.success) {
      throw new Error(result.error || 'Failed to load store value');
    }
    const payload = result.data as { value?: T } | undefined;
    return payload?.value ?? null;
  },

  async set(key: string, value: unknown): Promise<void> {
    const result = await apiClient.put(routes.store.key(key), value);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save store value');
    }
  },

  async remove(key: string): Promise<void> {
    const result = await apiClient.delete(routes.store.key(key));
    if (!result.success) {
      throw new Error(result.error || 'Failed to remove store value');
    }
  },
};

// ============================================================================
// {路标} FLOW-SERVICE-SKILLS
// Skills API
// ============================================================================
// Helper: unwrap apiClient's { success, data } envelope into the backend's raw response
function unwrap<T>(result: { success: boolean; data?: T; error?: string }): T & { success: boolean; error?: string } {
  if (!result.success) {
    return { success: false, error: result.error } as T & { success: boolean; error?: string };
  }
  if (result.data && typeof result.data === 'object') {
    return result.data as T & { success: boolean; error?: string };
  }
  return { success: true } as T & { success: boolean; error?: string };
}

const skills = {
  async list(): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    return unwrap(await apiClient.get('/skills'));
  },

  async setEnabled(options: { id: string; enabled: boolean }): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    return unwrap(await apiClient.post('/skills/enabled', options));
  },

  async updateMetadata(id: string, input: { category?: string }): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    return unwrap(await apiClient.put(`/skills/${encodeURIComponent(id)}/metadata`, input));
  },

  async delete(id: string): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    return unwrap(await apiClient.delete(`/skills/${encodeURIComponent(id)}`));
  },

  async download(input: { source: string; displayName?: string }): Promise<{ success: boolean; skills?: Skill[]; importedSkills?: Skill[]; error?: string }> {
    return unwrap(await apiClient.post('/skills/download', input));
  },

  async importUpload(payload: UploadedSkillPayload): Promise<{ success: boolean; skills?: Skill[]; importedSkills?: Skill[]; error?: string }> {
    return unwrap(await apiClient.post('/skills/import-upload', payload));
  },

  async getRoot(): Promise<{ success: boolean; path?: string; error?: string }> {
    return unwrap(await apiClient.get('/skills/root'));
  },

  async autoRoutingPrompt(): Promise<{ success: boolean; prompt?: string | null; error?: string }> {
    return unwrap(await apiClient.get('/skills/autoRoutingPrompt'));
  },

  async fetchMarketplace(): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return unwrap(await apiClient.get('/skills/marketplace'));
  },

  async getConfig(skillId: string): Promise<{ success: boolean; config?: Record<string, string>; error?: string }> {
    return unwrap(await apiClient.get(`/skills/${encodeURIComponent(skillId)}/config`));
  },

  async setConfig(skillId: string, config: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.put(`/skills/${encodeURIComponent(skillId)}/config`, config));
  },

  async testEmailConnectivity(
    skillId: string,
    config: Record<string, string>
  ): Promise<{ success: boolean; result?: EmailConnectivityTestResult; error?: string }> {
    return unwrap(await apiClient.post(`/skills/${encodeURIComponent(skillId)}/testEmail`, config));
  },

  onChanged(callback: () => void): () => void {
    return webSocketClient.on(WS_EVENTS.SKILLS_CHANGED, callback);
  },
};

// ============================================================================
// {路标} FLOW-SERVICE-MCP
// MCP API
// ============================================================================
const mcp = {
  async list(): Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }> {
    return unwrap(await apiClient.get('/mcp'));
  },

  async create(data: unknown): Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }> {
    return unwrap(await apiClient.post('/mcp', data));
  },

  async update(id: string, data: unknown): Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }> {
    return unwrap(await apiClient.put(`/mcp/${encodeURIComponent(id)}`, data));
  },

  async delete(id: string): Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }> {
    return unwrap(await apiClient.delete(`/mcp/${encodeURIComponent(id)}`));
  },

  async setEnabled(options: { id: string; enabled: boolean }): Promise<{ success: boolean; servers?: McpServerConfigIPC[]; error?: string }> {
    return unwrap(await apiClient.post(`/mcp/${encodeURIComponent(options.id)}/enabled`, {
      enabled: options.enabled,
    }));
  },

  async fetchMarketplace(): Promise<{ success: boolean; data?: McpMarketplaceData; error?: string }> {
    return unwrap(await apiClient.get('/mcp/marketplace'));
  },
};

// ============================================================================
// {路标} FLOW-SERVICE-SKILL-ROLE-CONFIGS
// Skill Role Configs API (identity-scoped skill installation)
// ============================================================================
export interface SkillRoleConfig {
  id: string;
  roleKey: string;
  skillId: string;
  skillName: string;
  prefix: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: number;
  updatedAt: number;
}

const skillRoleConfigs = {
  async list(roleKey: string): Promise<{ success: boolean; configs?: SkillRoleConfig[]; error?: string }> {
    return unwrap(await apiClient.get(`/skill-role-configs?roleKey=${encodeURIComponent(roleKey)}`));
  },

  async listAll(): Promise<{ success: boolean; configs?: SkillRoleConfig[]; error?: string }> {
    return unwrap(await apiClient.get('/skill-role-configs/all'));
  },

  async install(input: { roleKey: string; skillId: string; skillName: string; prefix?: string; config?: Record<string, unknown> }): Promise<{ success: boolean; config?: SkillRoleConfig; download?: { success: boolean; error?: string }; error?: string }> {
    return unwrap(await apiClient.post('/skill-role-configs', input));
  },

  async update(id: string, data: { enabled?: boolean; config?: Record<string, unknown> }): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.put(`/skill-role-configs/${encodeURIComponent(id)}`, data));
  },

  async remove(id: string): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.delete(`/skill-role-configs/${encodeURIComponent(id)}`));
  },

  async batchInstall(data: { skillId: string; skillName: string; roleKeys: string[]; config?: Record<string, unknown> }): Promise<{ success: boolean; configs?: SkillRoleConfig[]; error?: string }> {
    return unwrap(await apiClient.post('/skill-role-configs/batch-install', data));
  },

  async getRoleIndex(roleKey: string): Promise<{ success: boolean; path?: string; index?: unknown; error?: string }> {
    return unwrap(await apiClient.get(`/skill-role-configs/index/${encodeURIComponent(roleKey)}`));
  },

  async getRoleSkillConfig(roleKey: string, skillId: string): Promise<{ success: boolean; path?: string; config?: Record<string, string>; error?: string }> {
    return unwrap(await apiClient.get(`/skill-role-configs/${encodeURIComponent(roleKey)}/skills/${encodeURIComponent(skillId)}/config`));
  },

  async setRoleSkillConfig(roleKey: string, skillId: string, config: Record<string, string>): Promise<{ success: boolean; path?: string; error?: string }> {
    return unwrap(await apiClient.put(`/skill-role-configs/${encodeURIComponent(roleKey)}/skills/${encodeURIComponent(skillId)}/config`, config));
  },

  async getRoleSkillSecretMeta(roleKey: string, skillId: string): Promise<{ success: boolean; path?: string; fields?: string[]; hasSecrets?: boolean; error?: string }> {
    return unwrap(await apiClient.get(`/skill-role-configs/${encodeURIComponent(roleKey)}/skills/${encodeURIComponent(skillId)}/secret-meta`));
  },

  async setRoleSkillSecrets(roleKey: string, skillId: string, secrets: Record<string, string>): Promise<{ success: boolean; path?: string; fields?: string[]; error?: string }> {
    return unwrap(await apiClient.put(`/skill-role-configs/${encodeURIComponent(roleKey)}/skills/${encodeURIComponent(skillId)}/secrets`, secrets));
  },
};

// ============================================================================
// API (HTTP fetch/stream)
// ============================================================================
const api = {
  async fetch(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ ok: boolean; status: number; statusText: string; headers: Record<string, string>; data: any; error?: string }> {
    // {埋点} ⚡ CORS代理 (ID: api-test-004) POST /api/api/fetch → server/routes/apiProxy.ts
    // 通过后端代理请求外部API，避免浏览器CORS限制
    try {
      const response = await apiClient.post<{ ok: boolean; status: number; statusText: string; headers: Record<string, string>; data: any; error?: string }>('/api/fetch', options);
      if (response.success && response.data) {
        return response.data;
      }
      // apiClient返回格式异常时的兜底
      return {
        ok: false,
        status: 0,
        statusText: 'Proxy Error',
        headers: {},
        data: null,
        error: response.error || 'Backend proxy request failed',
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        headers: {},
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  // Map to API proxy server
  async stream(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    requestId: string;
  }): Promise<{ ok: boolean; status: number; statusText: string; error?: string }> {
    const result = await apiClient.post('/api/stream', {
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      requestId: options.requestId,
    });
    return {
      ok: result.success,
      status: result.success ? 200 : 500,
      statusText: result.success ? 'OK' : 'Error',
      error: result.error,
    };
  },

  async cancelStream(requestId: string): Promise<boolean> {
    const result = await apiClient.request(`/api/stream/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
    });
    return result.success;
  },

  onStreamData(requestId: string, callback: (chunk: string) => void): () => void {
    return webSocketClient.on(`stream:data:${requestId}`, callback);
  },

  onStreamDone(requestId: string, callback: () => void): () => void {
    return webSocketClient.on(`stream:done:${requestId}`, callback);
  },

  onStreamError(requestId: string, callback: (error: string) => void): () => void {
    return webSocketClient.on(`stream:error:${requestId}`, callback);
  },

  onStreamAbort(requestId: string, callback: () => void): () => void {
    return webSocketClient.on(`stream:abort:${requestId}`, callback);
  },
};

// ============================================================================
// {路标} FLOW-SERVICE-COWORK
// Cowork API
// ============================================================================

// File change event type
export interface FileChangeEvent {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  timestamp: number;
}

// File item type for file browser
export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedTime?: number;
}

// ============================================================================
// Files API (Web workspace file browser)
// ============================================================================
const files = {
  async list(path: string = ''): Promise<{ success: boolean; items?: FileItem[]; error?: string }> {
    return unwrap(await apiClient.get(`/files/list?path=${encodeURIComponent(path)}`));
  },

  async read(path: string): Promise<{ success: boolean; content?: string; error?: string }> {
    return unwrap(await apiClient.get(`/files/read?path=${encodeURIComponent(path)}`));
  },

  download(path: string): string {
    return `/workspace/${path}`;
  },

  async validate(path: string): Promise<{ success: boolean; valid?: boolean; error?: string }> {
    return unwrap(await apiClient.get(`/files/validate?path=${encodeURIComponent(path)}`));
  },

  onChanged(callback: (data: FileChangeEvent) => void): () => void {
    return webSocketClient.on('file:changed', callback);
  },
};

// ============================================================================
// Workspace API
// ============================================================================
const workspace = {
  async getPath(): Promise<{ success: boolean; path?: string; error?: string }> {
    return unwrap(await apiClient.get('/app/workspace'));
  },
};

// ============================================================================
// Cowork API
// ============================================================================
const cowork = {
  // {路标} FLOW-SHIM-COWORK
  // {FLOW} SHIM-COWORK-BRIDGE: Cowork 兼容壳把页面 service 调用统一桥接到 /api/cowork 与 cowork websocket 事件。
  async startSession(options: {
    prompt: string;
    cwd?: string;
    systemPrompt?: string;
    title?: string;
    activeSkillIds?: string[];
    imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
  }): Promise<{ success: boolean; session?: CoworkSession; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.startSession(), options));
  },

  async continueSession(options: {
    sessionId: string;
    prompt: string;
    systemPrompt?: string;
    activeSkillIds?: string[];
    imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
  }): Promise<{ success: boolean; session?: CoworkSession; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.continueSession(options.sessionId), {
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      activeSkillIds: options.activeSkillIds,
      imageAttachments: options.imageAttachments,
    }));
  },

  async stopSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.stopSession(sessionId), {}));
  },

  async deleteSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.delete(routes.cowork.session(sessionId)));
  },

  async deleteSessions(sessionIds: string[]): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.request(routes.cowork.deleteSessions(), {
      method: 'DELETE',
      body: JSON.stringify({ sessionIds }),
    }));
  },

  async setSessionPinned(options: { sessionId: string; pinned: boolean }): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.request(routes.cowork.pinSession(options.sessionId), {
      method: 'PATCH',
      body: JSON.stringify({ pinned: options.pinned }),
    }));
  },

  async renameSession(options: { sessionId: string; title: string }): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.request(routes.cowork.renameSession(options.sessionId), {
      method: 'PATCH',
      body: JSON.stringify({ title: options.title }),
    }));
  },

  async getSession(sessionId: string, options?: { messageLimit?: number }): Promise<{ success: boolean; session?: CoworkSession; error?: string }> {
    const params = new URLSearchParams();
    if (options?.messageLimit && Number.isFinite(options.messageLimit)) {
      params.set('messageLimit', String(Math.max(1, Math.floor(options.messageLimit))));
    }
    const url = params.size > 0
      ? `${routes.cowork.session(sessionId)}?${params.toString()}`
      : routes.cowork.session(sessionId);
    return unwrap(await apiClient.get(url));
  },

  async listSessions(): Promise<{ success: boolean; sessions?: CoworkSessionSummary[]; error?: string }> {
    return unwrap(await apiClient.get(routes.cowork.startSession()));
  },

  // Image export not available in web (requires Electron main process)
  async exportResultImage(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Image export not available in web version' };
  },

  async captureImageChunk(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Image capture not available in web version' };
  },

  async saveResultImage(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Image save not available in web version' };
  },

  async respondToPermission(options: { requestId: string; result: CoworkPermissionResult }): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.respondToPermission(options.requestId), {
      result: options.result,
    }));
  },

  async getConfig(): Promise<{ success: boolean; config?: CoworkConfig; error?: string }> {
    return unwrap(await apiClient.get(routes.cowork.config()));
  },

  async setConfig(config: CoworkConfigUpdate): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.put(routes.cowork.config(), config));
  },

  // {标记} P0-身份隔离-FIX: 记忆列表只按 agentRoleKey 过滤
  async listMemoryEntries(input: {
    query?: string;
    status?: 'created' | 'stale' | 'deleted' | 'all';
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
    agentRoleKey?: string;
  }): Promise<{ success: boolean; entries?: CoworkUserMemoryEntry[]; error?: string }> {
    return unwrap(await apiClient.get(routes.cowork.memoryEntries() + '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null)) as Record<string, string>
    ).toString()));
  },

  async createMemoryEntry(input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
    agentRoleKey?: string;
    modelId?: string;
  }): Promise<{ success: boolean; entry?: CoworkUserMemoryEntry; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.memoryEntries(), input));
  },

  async updateMemoryEntry(input: {
    id: string;
    text?: string;
    confidence?: number;
    status?: 'created' | 'stale' | 'deleted';
    isExplicit?: boolean;
  }): Promise<{ success: boolean; entry?: CoworkUserMemoryEntry; error?: string }> {
    return unwrap(await apiClient.put(routes.cowork.memoryEntry(input.id), input));
  },

  async deleteMemoryEntry(input: { id: string }): Promise<{ success: boolean; error?: string }> {
    return unwrap(await apiClient.delete(routes.cowork.memoryEntry(input.id)));
  },

  async getMemoryStats(input?: {
    agentRoleKey?: string;
  }): Promise<{ success: boolean; stats?: CoworkMemoryStats; error?: string }> {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined && value !== null)) as Record<string, string>
    ).toString();
    const url = query ? `${routes.cowork.memoryStats()}?${query}` : routes.cowork.memoryStats();
    return unwrap(await apiClient.get(url));
  },

  async listBroadcastBoards(input?: {
    agentRoleKey?: string;
    limit?: number;
  }): Promise<{ success: boolean; boards?: CoworkBroadcastBoardSnapshot[]; error?: string }> {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined && value !== null)) as Record<string, string>
    ).toString();
    const url = query ? `${routes.cowork.broadcastBoards()}?${query}` : routes.cowork.broadcastBoards();
    return unwrap(await apiClient.get(url));
  },

  async clearBroadcastBoard(input: {
    agentRoleKey: string;
  }): Promise<{ success: boolean; cleared?: number; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.clearBroadcastBoard(), input));
  },

  async compressContext(input: {
    sessionId: string;
  }): Promise<{ success: boolean; compression?: CoworkManualCompressionResult; error?: string }> {
    return unwrap(await apiClient.post(routes.cowork.compressContext(input.sessionId), {}));
  },

  // Stream event listeners
  onStreamMessage(callback: (data: { sessionId: string; message: CoworkMessage }) => void): () => void {
    return webSocketClient.on(WS_EVENTS.COWORK_MESSAGE, callback);
  },

  onStreamMessageUpdate(callback: (data: { sessionId: string; messageId: string; content: string }) => void): () => void {
    return webSocketClient.on(WS_EVENTS.COWORK_MESSAGE_UPDATE, callback);
  },

  onStreamPermission(callback: (data: { sessionId: string; request: CoworkPermissionRequest }) => void): () => void {
    return webSocketClient.on(WS_EVENTS.COWORK_PERMISSION, callback);
  },

  onStreamComplete(callback: (data: { sessionId: string; claudeSessionId: string | null }) => void): () => void {
    return webSocketClient.on(WS_EVENTS.COWORK_COMPLETE, callback);
  },

  onStreamError(callback: (data: { sessionId: string; error: string }) => void): () => void {
    return webSocketClient.on(WS_EVENTS.COWORK_ERROR, callback);
  },

  onSessionsChanged(callback: (data: { sessionId?: string | null; reason?: string | null }) => void): () => void {
    return webSocketClient.on(WS_EVENTS.COWORK_SESSIONS_CHANGED, callback);
  },
};


// ============================================================================
// Scheduled Tasks API
// ============================================================================
const scheduledTasks = {
  async list(): Promise<any> {
    return unwrap(await apiClient.get(routes.tasks.base()));
  },

  async get(id: string): Promise<any> {
    return unwrap(await apiClient.get(routes.tasks.item(id)));
  },

  async create(input: any): Promise<any> {
    return unwrap(await apiClient.post(routes.tasks.base(), input));
  },

  async update(id: string, input: any): Promise<any> {
    return unwrap(await apiClient.put(routes.tasks.item(id), input));
  },

  async delete(id: string): Promise<any> {
    return unwrap(await apiClient.delete(routes.tasks.item(id)));
  },

  async toggle(id: string, enabled: boolean): Promise<any> {
    return unwrap(await apiClient.post(routes.tasks.toggle(id), { enabled }));
  },

  async runManually(id: string): Promise<any> {
    return unwrap(await apiClient.post(routes.tasks.run(id), {}));
  },

  async stop(id: string): Promise<any> {
    return unwrap(await apiClient.post(routes.tasks.stop(id), {}));
  },

  async listRuns(taskId: string, limit?: number, offset?: number): Promise<any> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    return unwrap(await apiClient.get(`${routes.tasks.runs(taskId)}?${params}`));
  },

  async countRuns(taskId: string): Promise<any> {
    return unwrap(await apiClient.get(routes.tasks.runsCount(taskId)));
  },

  async listAllRuns(limit?: number, offset?: number): Promise<any> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    return unwrap(await apiClient.get(`${routes.tasks.allRuns()}?${params}`));
  },

  onStatusUpdate(callback: (data: any) => void): () => void {
    return webSocketClient.on(WS_EVENTS.TASK_STATUS_UPDATE, callback);
  },

  onRunUpdate(callback: (data: any) => void): () => void {
    return webSocketClient.on(WS_EVENTS.TASK_RUN_UPDATE, callback);
  },
};

// ============================================================================
// API Config
// ============================================================================
async function getApiConfig(): Promise<CoworkApiConfig | null> {
  const result = unwrap(await apiClient.get(routes.apiConfig.base()));
  return (result as any) || null;
}

async function checkApiConfig(options?: { probeModel?: boolean }): Promise<{ hasConfig: boolean; config: CoworkApiConfig | null; error?: string }> {
  const result = unwrap(await apiClient.get(routes.apiConfig.check(options?.probeModel)));
  return (result as any) || { hasConfig: false, config: null };
}

async function saveApiConfig(config: CoworkApiConfig): Promise<{ success: boolean; error?: string }> {
  return unwrap(await apiClient.put(routes.apiConfig.base(), config));
}

// ============================================================================
// Utility Functions
// ============================================================================
async function generateSessionTitle(userInput: string | null): Promise<string> {
  const result = unwrap(await apiClient.post(routes.cowork.generateTitle(), { userInput }));
  if (typeof result === 'string') {
    return result;
  }
  return (result as any)?.title || '';
}

async function getRecentCwds(limit?: number): Promise<string[]> {
  const params = limit ? `?limit=${limit}` : '';
  const result = unwrap(await apiClient.get(`${routes.cowork.recentCwds()}${params}`));
  return (result as any)?.cwds || (Array.isArray(result) ? result : []);
}

// ============================================================================
// IPC Renderer (Web simulation)
// ============================================================================
const ipcRenderer = {
  send(channel: string, ...args: unknown[]): void {
    webSocketClient.send('ipc', { channel, args });
  },

  on(channel: string, func: (...args: unknown[]) => void): () => void {
    return webSocketClient.on(`ipc:${channel}`, func);
  },
};

// ============================================================================
// Window (Not applicable in web, removed)
// ============================================================================

// ============================================================================
// Dialog (Web simulation)
// ============================================================================
const requestDirectoryPathFromWeb = async (): Promise<{ success: boolean; path: string | null; error?: string }> => {
  const workspaceResult = await apiClient.get<{ success?: boolean; path?: string }>('/app/workspace');
  const defaultPath = workspaceResult.success ? workspaceResult.data?.path?.trim() || '' : '';
  const enteredPath = window.prompt('请输入文件夹路径', defaultPath);

  if (enteredPath === null) {
    return { success: false, path: null, error: 'canceled' };
  }

  const trimmedPath = enteredPath.trim();
  if (!trimmedPath) {
    return { success: false, path: null, error: 'empty' };
  }

  // [FLOW] Web 版本无法打开原生目录选择器时，退化为手输路径并立即校验。
  // [API] 通过 /api/dialog/directory 校验手输目录，避免页面中的“浏览文件夹”按钮直接失效。
  const validationResult = await apiClient.get<DirectoryLookupResult>(`/dialog/directory?path=${encodeURIComponent(trimmedPath)}`);

  if (!validationResult.success || !validationResult.data?.success) {
    const message = validationResult.error || validationResult.data?.error || 'Failed to validate folder path';
    window.alert(message);
    return { success: false, path: null, error: 'validation-failed' };
  }

  if (!validationResult.data.exists) {
    window.alert('Folder does not exist.');
    return { success: false, path: null, error: 'missing-directory' };
  }

  if (!validationResult.data.isDirectory) {
    window.alert('Selected path is not a folder.');
    return { success: false, path: null, error: 'not-directory' };
  }

  return {
    success: true,
    path: validationResult.data.path || trimmedPath,
  };
};

const dialog = {
  async selectDirectory(): Promise<{ success: boolean; path: string | null }> {
    return requestDirectoryPathFromWeb();
  },

  // {标记} P1-ATTACHMENT-CWD-UNIFY: Web selectFile 透传 cwd，避免手选文件绕开工作目录/缓存分流。
  async selectFile(options?: { title?: string; filters?: { name: string; extensions: string[] }[]; cwd?: string }): Promise<{ success: boolean; path: string | null }> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      // Build accept string from filters if provided
      if (options?.filters?.length) {
        const exts = options.filters.flatMap(f => f.extensions.map(e => `.${e}`));
        if (exts.length) input.accept = exts.join(',');
      }
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve({ success: false, path: null });
          return;
        }
        // Upload file to server so we get a real server-side path
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((res, rej) => {
            reader.onload = () => {
              const result = reader.result as string;
              // Strip data URL prefix to get pure base64
              const base64Data = result.includes(',') ? result.split(',')[1] : result;
              res(base64Data);
            };
            reader.onerror = () => rej(reader.error ?? new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });
          const saveResult = await dialog.saveInlineFile({
            dataBase64: base64,
            fileName: file.name,
            mimeType: file.type,
            cwd: options?.cwd,
          });
          if (saveResult.success && saveResult.path) {
            resolve({ success: true, path: saveResult.path });
          } else {
            // Fallback: return filename if upload fails
            resolve({ success: true, path: file.name });
          }
        } catch {
          resolve({ success: true, path: file.name });
        }
      };
      input.oncancel = () => resolve({ success: false, path: null });
      input.click();
    });
  },

  async saveInlineFile(options: { dataBase64: string; fileName?: string; mimeType?: string; cwd?: string; purpose?: 'attachment' | 'export' }): Promise<{ success: boolean; path: string | null; error?: string }> {
    try {
      const result = await apiClient.post<{ success: boolean; path?: string; error?: string }>('/dialog/saveInlineFile', {
        dataBase64: options.dataBase64,
        fileName: options.fileName,
        mimeType: options.mimeType,
        cwd: options.cwd,
        purpose: options.purpose,
      });
      if (result.success && result.data?.success && result.data.path) {
        return { success: true, path: result.data.path };
      }
      return { success: false, path: null, error: result.data?.error || result.error || 'Failed to save file' };
    } catch (error) {
      console.error('[ElectronShim] saveInlineFile error:', error);
      return { success: false, path: null, error: error instanceof Error ? error.message : 'Failed to save file' };
    }
  },

  async parseInlineFile(options: { path: string; maxCharacters?: number }): Promise<{
    success: boolean;
    path?: string;
    fileName?: string;
    fileType?: string;
    text?: string;
    truncated?: boolean;
    originalLength?: number;
    error?: string;
  }> {
    try {
      const result = await apiClient.post<{
        success: boolean;
        path?: string;
        fileName?: string;
        fileType?: string;
        text?: string;
        truncated?: boolean;
        originalLength?: number;
        error?: string;
      }>('/dialog/parseInlineFile', {
        path: options.path,
        maxCharacters: options.maxCharacters,
      });
      if (result.success && result.data?.success) {
        return {
          success: true,
          path: result.data.path,
          fileName: result.data.fileName,
          fileType: result.data.fileType,
          text: result.data.text,
          truncated: result.data.truncated,
          originalLength: result.data.originalLength,
        };
      }
      return { success: false, error: result.data?.error || result.error || 'Failed to parse file' };
    } catch (error) {
      console.error('[ElectronShim] parseInlineFile error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to parse file' };
    }
  },

  async readFileAsDataUrl(filePath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
    try {
      const result = await apiClient.get<{ success: boolean; dataUrl?: string; error?: string }>(
        `/dialog/readFileAsDataUrl?path=${encodeURIComponent(filePath)}`
      );
      if (result.success && result.data?.success && result.data.dataUrl) {
        return { success: true, dataUrl: result.data.dataUrl };
      }
      return { success: false, error: result.data?.error || result.error || 'Failed to read file' };
    } catch (error) {
      console.error('[ElectronShim] readFileAsDataUrl error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read file' };
    }
  },
};

// ============================================================================
// Shell (Web simulation)
// ============================================================================
const shell = {
  async openPath(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      return unwrap(await apiClient.post('/shell/openPath', { path: filePath }));
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open path' };
    }
  },

  async showItemInFolder(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      return unwrap(await apiClient.post('/shell/showItemInFolder', { path: filePath }));
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to show in folder' };
    }
  },

  async openExternal(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open URL' };
    }
  },
};

// ============================================================================
// Auto Launch (Not applicable in web, removed)
// ============================================================================

// ============================================================================
// App Info
// ============================================================================
const appInfo = {
  async getVersion(): Promise<string> {
    const result = await apiClient.get('/app/version');
    return (result.data as { version?: string })?.version || '0.0.0-web';
  },

  async getSystemLocale(): Promise<string> {
    return navigator.language || 'en-US';
  },

  async getRuntimePaths(): Promise<{
    workspacePath: string;
    envSyncTargetPath: string;
    envSyncTargetExists: boolean;
  }> {
    const result = await apiClient.get('/app/runtimePaths');
    const data = result.data as {
      workspacePath?: string;
      envSyncTargetPath?: string;
      envSyncTargetExists?: boolean;
    } | undefined;
    return {
      workspacePath: data?.workspacePath || '',
      envSyncTargetPath: data?.envSyncTargetPath || '',
      envSyncTargetExists: data?.envSyncTargetExists === true,
    };
  },
};

// ============================================================================
// App Update (Not applicable in web, removed)
// ============================================================================

// ============================================================================
// Log (Not applicable in web, removed)
// ============================================================================

// ============================================================================
// Permissions (Web simulation)
// ============================================================================
const permissions = {
  async checkCalendar(): Promise<{ success: boolean; status?: string; error?: string; autoRequested?: boolean }> {
    return { success: true, status: 'not-applicable' };
  },

  async requestCalendar(): Promise<{ success: boolean; granted?: boolean; status?: string; error?: string }> {
    return { success: true, granted: false, status: 'not-applicable' };
  },
};

// ============================================================================
// Network Status (Web simulation)
// ============================================================================
const networkStatus = {
  send(_status: 'online' | 'offline'): void {
    // Handled by browser's online/offline events
  },
};

// ============================================================================
// Platform info
// ============================================================================
const platform = navigator.userAgent.includes('Windows') ? 'win32' :
                 navigator.userAgent.includes('Mac') ? 'darwin' :
                 navigator.userAgent.includes('Linux') ? 'linux' : 'web';

const arch = 'unknown'; // Browser doesn't expose architecture

// ============================================================================
// Export the shim object
// ============================================================================
interface ElectronShim {
  platform: string;
  arch: string;
  store: typeof store;
  skills: typeof skills;
  mcp: typeof mcp;
  skillRoleConfigs: typeof skillRoleConfigs;
  api: typeof api;
  getApiConfig: typeof getApiConfig;
  checkApiConfig: typeof checkApiConfig;
  saveApiConfig: typeof saveApiConfig;
  generateSessionTitle: typeof generateSessionTitle;
  getRecentCwds: typeof getRecentCwds;
  ipcRenderer: typeof ipcRenderer;
  dialog: typeof dialog;
  shell: typeof shell;
  appInfo: typeof appInfo;
  scheduledTasks: typeof scheduledTasks;
  permissions: typeof permissions;
  networkStatus: typeof networkStatus;
  cowork: typeof cowork;
  files: typeof files;
  workspace: typeof workspace;
}

export function createElectronShim(): ElectronShim {
  return {
    platform,
    arch,
    store,
    skills,
    mcp,
    skillRoleConfigs,
    api,
    getApiConfig,
    checkApiConfig,
    saveApiConfig,
    generateSessionTitle,
    getRecentCwds,
    ipcRenderer,
    dialog,
    shell,
    appInfo,
    scheduledTasks,
    permissions,
    networkStatus,
    cowork,
    files,
    workspace,
  };
}

/**
 * Initialize the electron shim
 * Call this during app initialization to set window.electron
 */
export async function initElectronShim(): Promise<void> {
  await initializeElectronShim({
    createShim: createElectronShim,
    attachShim: (shim) => {
      (window as any).electron = shim;
    },
    connectWebSocket: () => webSocketClient.connect(),
  });

  console.log('[ElectronShim] Initialized', {
    platform,
    apiBase: apiClient.getBaseUrl(),
    wsConnected: webSocketClient.isConnected(),
  });
}
