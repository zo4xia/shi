# Cowork 动脉图（2026-03-27）

> 目标：把当前项目最核心的对话主链单独收一遍。
> 结论先行：`Cowork` 现在是一条“页面 → service → shim → route → orchestrator/executor → store/db → websocket 回推”的完整闭环。

---

## 1. 页面入口

核心页面：

- `src/renderer/components/cowork/CoworkView.tsx`
- `src/renderer/components/cowork/CoworkSessionDetail.tsx`
- `src/renderer/components/cowork/SessionHistoryView.tsx`

页面不应该直接打后端。

当前真实入口都是：

- `coworkService.init()`
- `coworkService.startSession()`
- `coworkService.continueSession()`
- `coworkService.stopSession()`
- `coworkService.loadSession()`
- `coworkService.loadSessions()`

---

## 2. 前端 service 层

文件：

- `src/renderer/services/cowork.ts`

这层负责：

### 2.1 会话主行为

- 启动
- 续聊
- 停止
- 删除
- 重命名
- 置顶
- 拉单会话
- 拉会话列表

### 2.2 流式消费

- `message`
- `messageUpdate`
- `permission`
- `complete`
- `error`
- `sessionsChanged`

### 2.3 配置与记忆

- `getConfig / updateConfig`
- `listMemoryEntries / create / update / delete`
- `getMemoryStats`
- `checkApiConfig / saveApiConfig`

---

## 3. 兼容壳桥接

文件：

- `src/renderer/services/electronShim.ts`

这里把：

- `window.electron.cowork.*`
- `window.electron.getApiConfig`
- `window.electron.checkApiConfig`
- `window.electron.saveApiConfig`
- `window.electron.generateSessionTitle`
- `window.electron.getRecentCwds`

真正桥到：

- `/api/cowork/*`
- `/api/api-config/*`
- websocket `cowork:*`

所以判断“前端是不是直连后端”，不能只看 `cowork.ts`，还要看 shim。

---

## 4. 后端 route 层

文件：

- `server/routes/cowork.ts`

### 4.1 会话链

- `POST /api/cowork/sessions`
- `POST /api/cowork/sessions/:sessionId/continue`
- `POST /api/cowork/sessions/:sessionId/stop`
- `GET /api/cowork/sessions`
- `GET /api/cowork/sessions/:sessionId`
- `PATCH /api/cowork/sessions/:sessionId`
- `PATCH /api/cowork/sessions/:sessionId/pin`
- `DELETE /api/cowork/sessions/:sessionId`
- `DELETE /api/cowork/sessions`

### 4.2 配置链

- `GET /api/cowork/config`
- `PUT /api/cowork/config`

### 4.3 记忆链

- `GET /api/cowork/memory/entries`
- `POST /api/cowork/memory/entries`
- `PUT /api/cowork/memory/entries/:id`
- `DELETE /api/cowork/memory/entries/:id`
- `GET /api/cowork/memory/stats`

### 4.4 辅助链

- `POST /api/cowork/generateTitle`
- `GET /api/cowork/recentCwds`

### 4.5 审批链

- `POST /api/cowork/permissions/:requestId/respond`

但当前这条口子已明确：
- 旧审批桥接已切断
- 如果这里还被打中，说明还有残留旧链

---

## 5. 真正执行主干

`server/routes/cowork.ts` 现在的 Web 主链不是直接把请求丢给老 `CoworkRunner`。

真实执行链：

1. `createRequestTrace(...)`
2. `createWebInboundRequest(...)`
3. `orchestrateWebTurn(...)`
4. `HttpSessionExecutor`
5. `coworkStore` 持久化

这就是当前 Web 一期现役主路。

---

## 6. 落库点

### 6.1 会话

- `cowork_sessions`

### 6.2 消息

- `cowork_messages`

### 6.3 协作配置

- `cowork_config`

### 6.4 记忆

- `user_memories`
- `user_memory_sources`

### 6.5 24h 连续性

- `identity_thread_24h`

---

## 7. 回推链

前端不是靠轮询拿到所有增量。

主要回推链：

- `cowork:stream:message`
- `cowork:stream:messageUpdate`
- `cowork:stream:permission`
- `cowork:stream:complete`
- `cowork:stream:error`
- `cowork:sessions:changed`

这些事件名在：

- `src/renderer/services/webApiContract.ts`

消费发生在：

- `src/renderer/services/cowork.ts`

---

## 8. 当前最重要的边界

### 8.1 Web 主链已切到轻执行器

所以：
- 不能再把 `CoworkRunner` 当现役 Web 主路

### 8.2 `CoworkRunner` 还没完全消失

所以：
- 不能假装旧链不存在
- 但排 Web 主问题时，优先级要放到现役主路后面

### 8.3 权限响应口已是“残留探针”

如果 `/permissions/:requestId/respond` 还频繁命中，说明旧链残留还没拔干净。

---

## 9. 排错顺序建议

如果后面继续查 Cowork，建议固定顺序：

1. `CoworkView.tsx`
2. `cowork.ts`
3. `electronShim.ts`
4. `webApiContract.ts`
5. `server/routes/cowork.ts`
6. `HttpSessionExecutor / orchestrateWebTurn`
7. `coworkStore / sqliteStore.web.ts`

这样不会漂。
