/**
 * {标记} 功能: Web API契约校验
 * {标记} 来源: web架构迁移
 * {标记} 用途: 定义前后端API数据结构，保证类型安全
 * {标记} 集成: 前端所有API调用 / 单元测试验证
 * {标记} 状态: 源代码完整✅
 */

// {路标} FLOW-FRONTEND-CONTRACT
// {FLOW} CONTRACT-FIRST: 前端若要核对真实 HTTP 路径，先看这里，再对照 electronShim 与 server/src/index.ts 的挂载顺序。

export const COWORK_WS_EVENTS = {
  message: 'cowork:stream:message',
  messageUpdate: 'cowork:stream:messageUpdate',
  permission: 'cowork:stream:permission',
  complete: 'cowork:stream:complete',
  error: 'cowork:stream:error',
  sessionsChanged: 'cowork:sessions:changed',
} as const;

export function buildCoworkRoomId(sessionId: string): string {
  return `cowork:${sessionId}`;
}

export const routes = {
  store: {
    key: (key: string) => `/store/${encodeURIComponent(key)}`,
  },
  cowork: {
    startSession: () => '/cowork/sessions',
    session: (sessionId: string) => `/cowork/sessions/${encodeURIComponent(sessionId)}`,
    continueSession: (sessionId: string) => `/cowork/sessions/${encodeURIComponent(sessionId)}/continue`,
    stopSession: (sessionId: string) => `/cowork/sessions/${encodeURIComponent(sessionId)}/stop`,
    renameSession: (sessionId: string) => `/cowork/sessions/${encodeURIComponent(sessionId)}`,
    pinSession: (sessionId: string) => `/cowork/sessions/${encodeURIComponent(sessionId)}/pin`,
    deleteSessions: () => '/cowork/sessions',
    respondToPermission: (requestId: string) => `/cowork/permissions/${encodeURIComponent(requestId)}/respond`,
    config: () => '/cowork/config',
    memoryEntries: () => '/cowork/memory/entries',
    memoryEntry: (id: string) => `/cowork/memory/entries/${encodeURIComponent(id)}`,
    memoryStats: () => '/cowork/memory/stats',
    broadcastBoards: () => '/cowork/memory/broadcast-boards',
    generateTitle: () => '/cowork/generateTitle',
    recentCwds: () => '/cowork/recentCwds',
  },
  tasks: {
    base: () => '/tasks',
    item: (id: string) => `/tasks/${encodeURIComponent(id)}`,
    toggle: (id: string) => `/tasks/${encodeURIComponent(id)}/toggle`,
    run: (id: string) => `/tasks/${encodeURIComponent(id)}/run`,
    stop: (id: string) => `/tasks/${encodeURIComponent(id)}/stop`,
    runs: (id: string) => `/tasks/${encodeURIComponent(id)}/runs`,
    runsCount: (id: string) => `/tasks/${encodeURIComponent(id)}/runs/count`,
    allRuns: () => '/tasks/runs/all',
  },
  apiConfig: {
    base: () => '/api-config',
    check: (probeModel?: boolean) => `/api-config/check${probeModel ? '?probeModel=true' : ''}`,
  },
} as const;
