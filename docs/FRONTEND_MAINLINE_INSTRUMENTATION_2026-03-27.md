# {标记} 前端主链埋点文档（第一版）

> {PROGRESS} 目标：把当前 UCLAW 主链页面按 `123-埋点标记规范.md` 收成可施工文档。  
> {PROGRESS} 范围：只覆盖现役主链 `App shell / Sidebar / Cowork / SessionHistory / ScheduledTasks / Skills / MCP / Settings / IM`。  
> {PROGRESS} 不含：Leisure / Storage / Marketplace 等未来页，不把未落地设计强行写进现役主线。

---

## {标记} 1. 埋点符号

| 符号 | 含义 |
|------|------|
| `⚡` | API 接入点 |
| `💾` | 数据绑定 |
| `🔄` | 实时更新 / 轮询 |
| `🔌` | 事件监听 / 用户操作 |
| `📡` | WebSocket / 流式事件 |
| `🔐` | 权限 / 风险确认 |
| `⚠️` | 错误处理 / 回退 |
| `📦` | 数据转换 |
| `🎨` | 动态样式 / 状态视觉 |
| `🧩` | 组件复用 |

---

## {ROUTE} 2. 主导航与视图切换

### {FLOW} App Shell

- `🔌` 主视图切换
  - ID: `app-mainview-switch-001`
  - 数据：`mainView`
  - 事件：`setMainView('cowork' | 'skills' | 'scheduledTasks' | 'mcp' | 'employeeStore' | 'resourceShare' | 'freeImageGen' | 'sessionHistory' | 'room')`
  - 备注：当前不是 react-router 真路由，而是 `App.tsx` 内部状态切屏

- `⚡` 应用初始化
  - ID: `app-init-001`
  - API/服务：`configService.init()` / `themeService.initialize()` / `imService.init()`
  - 数据：`config`、`selectedModel`、`availableModels`
  - 事件：`onMount`
  - 备注：首屏主入口，先于各页面数据流

- `⚡` 设置弹层打开
  - ID: `settings-open-001`
  - 数据：`showSettings`、`settingsOptions.initialTab`
  - 事件：`handleShowSettings`
  - 备注：当前为 modal，不是新页面路由

### {FLOW} Sidebar

- `🔌` 主路径按钮
  - ID: `sidebar-primary-nav-001`
  - 数据：`activeView`
  - 事件：
    - `onNewChat`
    - `onShowSessionHistory`
    - `onShowRoom`
  - 备注：主链入口优先级最高

- `🔌` 工作台按钮
  - ID: `sidebar-workspace-nav-001`
  - 数据：`activeView`
  - 事件：
    - `onShowScheduledTasks`
    - `onShowSkills`
    - `onShowMcp`
    - `onShowEmployeeStore`

- `🔌` 辅助入口
  - ID: `sidebar-extra-nav-001`
  - 数据：`resourceShare` / `freeImageGen`
  - 事件：`onShowResourceShare` / `onShowFreeImageGen`

- `🔌` 批量删除会话
  - ID: `sidebar-session-batch-delete-001`
  - API/服务：`coworkService.deleteSessions(ids)`
  - 数据：`selectedIds`
  - 事件：`handleBatchDelete`
  - 备注：作用于侧边历史会话，不是当前消息流

---

## {ROUTE} 3. Cowork 主对话页

### {FLOW} 会话主链

- `⚡` 启动会话
  - ID: `cowork-session-start-001`
  - API：`POST /cowork/sessions`
  - 服务：`coworkService.startSession`
  - 数据：`prompt` / `cwd` / `title` / `activeSkillIds` / `imageAttachments`
  - 事件：发送首条任务

- `⚡` 继续会话
  - ID: `cowork-session-continue-001`
  - API：`POST /cowork/sessions/{sessionId}/continue`
  - 服务：`coworkService.continueSession`
  - 数据：`sessionId` / `prompt` / `imageAttachments`
  - 事件：继续追问、追任务

- `⚡` 停止会话
  - ID: `cowork-session-stop-001`
  - API：`POST /cowork/sessions/{sessionId}/stop`
  - 服务：`coworkService.stopSession`
  - 备注：只停当前运行态，不删历史

- `⚡` 获取单会话
  - ID: `cowork-session-get-001`
  - API：`GET /cowork/sessions/{sessionId}`
  - 服务：`coworkService.loadSession`
  - 数据：`currentSession`

- `⚡` 获取会话列表
  - ID: `cowork-session-list-001`
  - API：`GET /cowork/sessions`
  - 服务：`coworkService.loadSessions`
  - 数据：`sessions`

- `⚡` 重命名 / 置顶 / 删除
  - ID: `cowork-session-actions-001`
  - API：
    - `PATCH /cowork/sessions/{sessionId}`
    - `PATCH /cowork/sessions/{sessionId}/pin`
    - `DELETE /cowork/sessions/{sessionId}`
    - `DELETE /cowork/sessions`
  - 服务：`renameSession` / `setSessionPinned` / `deleteSession` / `deleteSessions`

### {FLOW} 流式与审批

- `📡` 流式消息
  - ID: `cowork-stream-message-001`
  - WS：`cowork:stream:message`
  - 服务：`cowork.onStreamMessage`
  - 数据：`message`

- `📡` 流式增量更新
  - ID: `cowork-stream-message-update-001`
  - WS：`cowork:stream:messageUpdate`
  - 服务：`cowork.onStreamMessageUpdate`
  - 数据：`messageId` / `content`
  - 备注：当前内容更新做了节流批量刷新

- `📡` 审批请求
  - ID: `cowork-stream-permission-001`
  - WS：`cowork:stream:permission`
  - 数据：`pendingPermissions`

- `⚡` 审批响应
  - ID: `cowork-permission-respond-001`
  - API：`POST /cowork/permissions/{requestId}/respond`
  - 服务：`coworkService.respondToPermission`
  - 数据：`requestId` / `result`

- `📡` 完成 / 错误 / 会话变更
  - ID: `cowork-stream-state-001`
  - WS：
    - `cowork:stream:complete`
    - `cowork:stream:error`
    - `cowork:sessions:changed`

### {FLOW} 记忆与配置

- `⚡` 获取协作配置
  - ID: `cowork-config-get-001`
  - API：`GET /cowork/config`
  - 服务：`coworkService.loadConfig`

- `⚡` 更新协作配置
  - ID: `cowork-config-put-001`
  - API：`PUT /cowork/config`
  - 服务：`coworkService.updateConfig`

- `⚡` 记忆条目列表
  - ID: `cowork-memory-list-001`
  - API：`GET /cowork/memory/entries`
  - 服务：`coworkService.listMemoryEntries`
  - 数据：`query` / `agentRoleKey` / `status`

- `⚡` 记忆条目增删改
  - ID: `cowork-memory-mutate-001`
  - API：
    - `POST /cowork/memory/entries`
    - `PUT /cowork/memory/entries/{id}`
    - `DELETE /cowork/memory/entries/{id}`
  - 服务：`createMemoryEntry` / `updateMemoryEntry` / `deleteMemoryEntry`

- `⚡` 记忆统计
  - ID: `cowork-memory-stats-001`
  - API：`GET /cowork/memory/stats`
  - 服务：`coworkService.getMemoryStats`

---

## {ROUTE} 4. SessionHistory 对话记录页

- `⚡` 记录列表来源
  - ID: `session-history-list-001`
  - API：复用 `GET /cowork/sessions`
  - 服务：`coworkService.loadSessions`
  - 数据：`sessions`
  - 备注：当前历史页建立在会话列表之上，不是独立 history route

- `📦` 来源过滤
  - ID: `session-history-filter-001`
  - 数据：`sessionHistorySourceFilter`
  - 事件：`normalizeSessionSourceFilter(filter)`
  - 备注：当前支持 `all / desktop / external`

- `🔌` 点击历史项打开详情
  - ID: `session-history-open-detail-001`
  - 服务：`coworkService.loadSession`
  - 数据：`sessionId`

---

## {ROUTE} 5. ScheduledTasks 定时任务页

- `⚡` 任务列表
  - ID: `scheduled-task-list-001`
  - API：`GET /tasks`
  - 服务：`scheduledTaskService.loadTasks`

- `⚡` 创建任务
  - ID: `scheduled-task-create-001`
  - API：`POST /tasks`
  - 服务：`scheduledTaskService.createTask`

- `⚡` 编辑任务
  - ID: `scheduled-task-update-001`
  - API：`PUT /tasks/{id}`
  - 服务：`scheduledTaskService.updateTaskById`

- `⚡` 删除任务
  - ID: `scheduled-task-delete-001`
  - API：`DELETE /tasks/{id}`
  - 服务：`scheduledTaskService.deleteTask`

- `⚡` 开关 / 立即运行 / 停止
  - ID: `scheduled-task-actions-001`
  - API：
    - `POST /tasks/{id}/toggle`
    - `POST /tasks/{id}/run`
    - `POST /tasks/{id}/stop`
  - 服务：`toggleTask` / `runManually` / `stopTask`

- `⚡` 运行历史
  - ID: `scheduled-task-runs-001`
  - API：
    - `GET /tasks/{id}/runs`
    - `GET /tasks/{id}/runs/count`
    - `GET /tasks/runs/all`
  - 服务：`loadRuns` / `countRuns` / `loadAllRuns`

- `📡` 实时状态推送
  - ID: `scheduled-task-ws-001`
  - 数据：`taskState` / `run`
  - 备注：当前服务层已设置 listeners，同步 Redux

---

## {ROUTE} 6. Skills 视图

- `⚡` 技能列表
  - ID: `skills-list-001`
  - API：`GET /skills`
  - 服务：`skillService.loadSkills`

- `⚡` 启用 / 禁用技能
  - ID: `skills-toggle-001`
  - API：`POST /skills/enabled`
  - 服务：`skillService.setSkillEnabled`

- `⚡` 更新技能元数据
  - ID: `skills-metadata-001`
  - API：`PUT /skills/{id}/metadata`
  - 服务：`skillService.updateSkillMetadata`

- `⚡` 删除 / 下载 / 上传导入
  - ID: `skills-import-export-001`
  - API：
    - `DELETE /skills/{id}`
    - `POST /skills/download`
    - `POST /skills/import-upload`
  - 服务：`deleteSkill` / `downloadSkill` / `importUploadedSkill`

- `⚡` 市场与根目录
  - ID: `skills-marketplace-001`
  - API：
    - `GET /skills/marketplace`
    - `GET /skills/root`
    - `GET /skills/autoRoutingPrompt`
  - 服务：`fetchMarketplaceSkills` / `getSkillsRoot` / `getAutoRoutingPrompt`

- `⚡` 技能配置
  - ID: `skills-config-001`
  - API：
    - `GET /skills/{skillId}/config`
    - `PUT /skills/{skillId}/config`
    - `POST /skills/{skillId}/testEmail`
  - 服务：`getSkillConfig` / `setSkillConfig` / `testEmailConnectivity`

- `⚡` 角色技能绑定
  - ID: `skills-role-config-001`
  - API：
    - `GET /skill-role-configs`
    - `GET /skill-role-configs/all`
    - `POST /skill-role-configs`
    - `PUT /skill-role-configs/{id}`
    - `DELETE /skill-role-configs/{id}`
    - `POST /skill-role-configs/batch-install`
  - 服务：`listRoleConfigs` / `listAllRoleConfigs` / `installSkillForRole` / `batchInstallSkillForRoles` / `removeRoleConfig` / `updateRoleConfig`

---

## {ROUTE} 7. MCP 视图

- `⚡` MCP 列表
  - ID: `mcp-list-001`
  - API：`GET /mcp`
  - 服务：`mcpService.loadServers`

- `⚡` 新增 / 编辑 / 删除
  - ID: `mcp-mutate-001`
  - API：
    - `POST /mcp`
    - `PUT /mcp/{id}`
    - `DELETE /mcp/{id}`
  - 服务：`createServer` / `updateServer` / `deleteServer`

- `⚡` 启用开关
  - ID: `mcp-enable-001`
  - API：`POST /mcp/{id}/enabled`
  - 服务：`setServerEnabled`

- `⚡` 市场
  - ID: `mcp-marketplace-001`
  - API：`GET /mcp/marketplace`
  - 服务：`mcpService.fetchMarketplace`

---

## {ROUTE} 8. Settings 配置台

- `⚡` 配置恢复
  - ID: `settings-load-001`
  - 服务：`configService.init()` / `localStore.getItem(APP_CONFIG)`
  - 数据：`AppConfig`
  - 备注：该埋点已在 `config.ts` 留过源码标记

- `⚡` 配置保存
  - ID: `settings-save-001`
  - 服务：`configService.updateConfig`
  - 数据：`Partial<AppConfig>`

- `⚡` API 配置检查 / 保存
  - ID: `settings-api-config-001`
  - API：
    - `GET /api-config`
    - `GET /api-config/check`
    - `PUT /api-config`
  - 服务：`coworkService.getApiConfig` / `checkApiConfig` / `saveApiConfig`

- `⚡` 数据备份
  - ID: `settings-backup-001`
  - API：
    - `GET /backup/export`
    - `POST /backup/import`
    - `GET /backup/stats`
  - 备注：当前由设置页相关子模块承接

- `⚡` 日志与工作目录
  - ID: `settings-runtime-paths-001`
  - API：
    - `GET /app/workspace`
    - `GET /log/path`
    - `GET /app/info`

- `⚡` 角色运行时
  - ID: `settings-role-runtime-001`
  - API：
    - `GET /role-runtime/{roleKey}`
    - `PUT /role-runtime/{roleKey}/config`
    - `POST /role-runtime/{roleKey}/probe`
    - `PUT /role-runtime/{roleKey}/notes`
  - 备注：只按 `agentRoleKey` 隔离，禁止把 `modelId` 当身份键

---

## {ROUTE} 9. IM / Feishu 运行态

- `💾` IM 初始化
  - ID: `im-init-002`
  - 服务：`localStore.getItem('im_config')` → `mergeIMConfig`
  - 备注：该埋点已在 `im.ts` 源码存在

- `⚡` 飞书网关状态
  - ID: `feishu-gateway-status-001`
  - API：`GET /api/im/feishu/gateway/status`
  - 服务：`imService.refreshRuntimeStatus('feishu')`

- `⚡` 飞书网关启动 / 停止
  - ID: `feishu-gateway-control-001`
  - API：
    - `POST /api/im/feishu/gateway/start`
    - `POST /api/im/feishu/gateway/stop`
  - 服务：`imService.startGateway('feishu')` / `stopGateway('feishu')`

- `⚠️` 钉钉说明
  - ID: `dingtalk-soft-contained-001`
  - 备注：当前只保留兼容入口，不进入 live 主执行链；文档可记录，但不要误判为现役主链

---

## {PROGRESS} 10. 第二批待补

- `EmployeeStoreView` 页面级埋点
- `RoomView` 页面级埋点
- `resourceShare / freeImageGen` iframe 页埋点
- `Settings.tsx` 各 tab 细分埋点
- `CoworkView` 子组件级埋点：输入框 / 图片附件 / 搜索弹层 / 权限弹层
- 统一 grep 口径：`ID:` / `⚡` / `📡` / `{ROUTE}` / `{FLOW}`

---

## {PROGRESS} 11. 使用规则

- 先写埋点，再改页面
- 新增 API 必须先补到本文件
- 新增主视图必须先补 `主导航 → 页面 → 服务 → 后端路由` 四段
- review 先搜 `ID:`，再搜具体 API，再看代码
- 任何“看起来只是 UI”的改动，如果涉及 `💾 / ⚡ / 🔄 / 📡`，都不允许跳过埋点
