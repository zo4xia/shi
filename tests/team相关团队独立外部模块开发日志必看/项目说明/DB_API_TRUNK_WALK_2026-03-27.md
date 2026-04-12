# 数据库到底层 API 主链走查（2026-03-27）

> 目标：从当前项目真实代码出发，重新走一遍 `数据库底层 → context 装配 → route 挂载 → 关键 API 主链`。
> 原则：只记当前现役链路，不把设计稿当现状，不把历史兼容口误判成主干。

---

## 1. 底层数据库真相

### 1.1 SQLite 入口

- 入口文件：`server/sqliteStore.web.ts`
- 真实创建点：`SqliteStore.create()`
- 落盘路径规则：
  - `resolveRuntimeUserDataPath(...)`
  - 最终数据库文件名：`uclaw.sqlite`
- 结论：
  - 当前 Web 服务端不是临时内存库
  - 也不是 Electron 专属 userData
  - 而是统一写入运行态目录下的 SQLite 文件

### 1.2 真正的“总落盘点”

- 文件：`server/sqliteStore.web.ts`
- 方法：`flush()`
- 结论：
  - `kv`
  - `cowork_*`
  - `mcp_servers`
  - `scheduled_tasks`
  - `user_memories`
  - `identity_thread_24h`
  - `skill_role_configs`
  - 最终都收口到同一个数据库文件落盘

### 1.3 当前关键表

- `kv`
  - 配置总入口
  - 典型 key：`app_config`、`im_config`
- `cowork_sessions`
  - 会话主表
- `cowork_messages`
  - 消息表
- `cowork_config`
  - 协作配置
- `user_memories`
  - 长短期用户记忆条目
- `user_memory_sources`
  - 记忆来源链
- `identity_thread_24h`
  - 24h 身份连续性热缓存
- `mcp_servers`
  - MCP 服务器定义
- `scheduled_tasks`
  - 定时任务
- `scheduled_task_runs`
  - 定时任务运行历史
- `skill_role_configs`
  - 技能与角色绑定关系

---

## 2. 服务端装配主链

### 2.1 服务入口

- 文件：`server/src/index.ts`
- 真实主入口：`startServer()`

### 2.2 先定根，再定运行目录

- 运行时项目根：
  - `setProjectRoot(resolvedWorkspace)`
- 运行时数据目录：
  - `getUserDataPath(serverOptions.dataDir)`
- 然后写入：
  - `app.set('workspace', ...)`
  - `app.set('userDataPath', ...)`

这一步很关键：  
后面所有 routes 里拿到的 `workspace` / `userDataPath`，都从这里来。

### 2.3 请求 context 注入

- 中间件：`requestContextMiddleware`
- 注入内容：
  - `store`
  - `coworkStore`
  - `coworkRunner`
  - `skillManager`
  - `mcpStore`
  - `scheduledTaskStore`
  - `scheduler`
  - `feishuGateway`

结论：
- 当前 `/api/*` 大部分不是各自独立 new store
- 而是共用单例 context

---

## 3. API 挂载顺序真相

文件：`server/src/index.ts`

当前挂载顺序：

1. `setupStoreRoutes(app)`
2. `setupSkillsRoutes(app)`
3. `setupMcpRoutes(app)`
4. `setupDailyMemoryRoutes(app)`
5. `setupCoworkRoutes(app)`
6. `setupScheduledTaskRoutes(app)`
7. `setupPermissionsRoutes(app)`
8. `setupAppRoutes(app)`
9. `setupApiConfigRoutes(app)`
10. `setupLogRoutes(app)`
11. `setupApiProxyRoutes(app)`
12. `setupDialogRoutes(app)`
13. `setupShellRoutes(app)`
14. `setupFilesRoutes(app)`
15. `setupRoleRuntimeRoutes(app)`
16. `setupFeishuWebhookRoutes(app)`
17. `setupDingTalkWebhookRoutes(app)`
18. `setupSkillRoleConfigRoutes(app)`
19. `setupBackupRoutes(app)`
20. `setupSkillsMcpHelperRoutes(app)`

结论：
- 判断“接口到底有没有”时，先看这里
- 不要先信文档标题或设计图

---

## 4. 两条最关键的配置链

### 4.1 `store` 链：配置/环境同步主入口

- 文件：`server/routes/store.ts`
- 挂载点：`/api/store`

关键口：
- `GET /api/store/:key`
- `POST /api/store/:key`
- `PUT /api/store/:key`
- `DELETE /api/store/:key`

其中重口径：

#### `app_config`

- 写入前走：
  - `prepareAppConfigForStore(...)`
- 写入后触发：
  - `syncAppConfigToEnv(...)`
  - `syncRoleCapabilitySnapshots(...)`

结论：
- `app_config` 不是普通 KV
- 它会继续影响 `.env` 和角色运行态视图

#### `im_config`

- 写入后触发：
  - `syncImConfigToEnv(...)`
  - `syncImaConfigToRoleSecrets(...)`
  - `ensureImaSkillBindings(req)`

结论：
- `im_config` 也不是轻写
- 它会波及 IM 环境变量和技能 secret/runtime 文件

### 4.2 `api-config` 链：兼容入口

- 文件：`server/routes/apiConfig.ts`
- 挂载点：`/api/api-config`

结论：
- 这是配置写入口之一
- 但当前项目真正的总配置心脏仍然是 `app_config`

---

## 5. `cowork` 主链

### 5.1 挂载点

- 文件：`server/routes/cowork.ts`
- 挂载：`/api/cowork`

### 5.2 当前现役执行口径

- Web 新建会话：
  - `POST /api/cowork/sessions`
- Web 续聊：
  - `POST /api/cowork/sessions/:sessionId/continue`

真实执行链不是老口径直冲 `CoworkRunner`，而是：

1. route 收请求
2. `createRequestTrace(...)`
3. `createWebInboundRequest(...)`
4. `orchestrateWebTurn(...)`
5. `HttpSessionExecutor`
6. `coworkStore` 持久化 session / message

结论：
- 现役 Web 主链是轻执行器主路
- `CoworkRunner` 仍存在，但不应误判成当前 Web 主干

### 5.3 当前真实会话相关接口

- `POST /sessions`
- `POST /sessions/:sessionId/continue`
- `POST /sessions/:sessionId/stop`
- `DELETE /sessions/:sessionId`
- `DELETE /sessions`
- `PATCH /sessions/:sessionId/pin`
- `PATCH /sessions/:sessionId`
- `GET /sessions/:sessionId`
- `GET /sessions`
- `GET /config`
- `PUT /config`
- `POST /permissions/:requestId/respond`
- `GET /memory/entries`
- `POST /memory/entries`
- `PUT /memory/entries/:id`
- `DELETE /memory/entries/:id`
- `GET /memory/stats`

---

## 6. 身份边界在数据库层怎么落

当前数据库和路由里最关键的边界是：

- `agent_role_key` 才是身份唯一真理
- `model_id` 只是运行时配置兼容字段

最明显的证据：

- `identity_thread_24h` 表有唯一约束：`UNIQUE(agent_role_key)`
- `sqliteStore.web.ts` 已写明：
  - `model_id` 不参与身份隔离
- 记忆、任务、消息、会话都显式保留 `agent_role_key`

结论：
- 这条边界已经深入到 schema，不只是上层口号

---

## 7. 当前稳定性判断

### 7.1 稳的地方

- SQLite 单库收口清晰
- route 挂载顺序明确
- `workspace` / `userDataPath` 来源统一
- `cowork` Web 主链已有明确现役执行口径
- `identity_thread_24h` 身份边界比较清楚

### 7.2 仍要盯的地方

- `CoworkRunner` 仍在主入口构造，属于历史兼容壳残留
- `store` 写入会联动 `.env`、roles 视图、secrets，副作用较大
- `im_config` / `app_config` 都不是“轻写”
- 钉钉仍有兼容路由，但不再应被当成 live 主链

---

## 8. 这轮走查的收束

如果后面继续“边走边插旗边埋点”，建议下一批只盯这 4 个点：

1. `server/src/index.ts`
   - 继续补装配顺序和 context 标记
2. `server/routes/cowork.ts`
   - 标清 Web 主链 / 非主链 / 记忆链 / 审批链
3. `server/routes/store.ts`
   - 标清轻读 / 重写 / env 同步 / role runtime 同步
4. `src/renderer/services/*`
   - 把前端调用和后端真实接口一一钉住

这样做的好处是：
- 不会飘
- 不会乱扩
- 能把“数据库 → API → 前端”一条线钉死
