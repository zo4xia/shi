# 页面 → 服务 → Route 对照表（2026-03-27）

> 目标：把当前主页面消费点钉到具体服务，再钉到后端 route。
> 作用：后面做埋点、改造、排错时，不再只看页面文件乱猜。

---

## 1. App 壳

- 页面入口：`src/renderer/App.tsx`
- 主要服务：
  - `configService`
  - `themeService`
  - `apiService`
  - `imService`
  - `coworkService`
- 作用：
  - 首屏配置恢复
  - 主题初始化
  - 模型列表装载
  - IM 延后补齐
  - Settings modal / 主视图切换

---

## 2. Cowork 主链

### 页面

- `src/renderer/components/cowork/CoworkView.tsx`
- `src/renderer/components/cowork/CoworkSessionDetail.tsx`
- `src/renderer/components/cowork/SessionHistoryView.tsx`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/components/ModelSelector.tsx`
- `src/renderer/components/cowork/FolderSelectorPopover.tsx`

### 服务

- `src/renderer/services/cowork.ts`

### 兼容壳

- `window.electron.cowork.*`
- `window.electron.getApiConfig`
- `window.electron.checkApiConfig`
- `window.electron.saveApiConfig`
- `window.electron.generateSessionTitle`
- `window.electron.getRecentCwds`

### 后端 route

- `server/routes/cowork.ts`
- `server/routes/apiConfig.ts`

---

## 3. Settings

### 页面

- `src/renderer/components/Settings.tsx`

### 服务

- `configService`
- `coworkService`
- `localStore`
- 内嵌 `IMSettings`

### 后端 route

- `server/routes/store.ts`
- `server/routes/cowork.ts`
- `server/routes/apiProxy.ts`
- `server/routes/app.ts`
- `server/routes/shell.ts`
- `server/routes/roleRuntime.ts`
- `server/routes/feishuWebhook.ts`（通过 `IMSettings/imService`）

---

## 4. Skills

### 页面

- `src/renderer/components/skills/SkillsManager.tsx`
- `src/renderer/components/skills/SkillsPopover.tsx`
- `src/renderer/components/skills/EmailSkillConfig.tsx`
- `src/renderer/components/cowork/CoworkPromptInput.tsx`
- `src/renderer/components/scheduledTasks/TaskForm.tsx`
- `src/renderer/components/mcp/McpManager.tsx`

### 服务

- `src/renderer/services/skill.ts`

### 后端 route

- `server/routes/skills.ts`
- `server/routes/skillRoleConfigs.ts`
- `server/routes/roleRuntime.ts`

---

## 5. Scheduled Tasks

### 页面

- `src/renderer/components/scheduledTasks/ScheduledTasksView.tsx`
- `src/renderer/components/scheduledTasks/TaskForm.tsx`
- `src/renderer/components/scheduledTasks/TaskList.tsx`
- `src/renderer/components/scheduledTasks/TaskDetail.tsx`
- `src/renderer/components/scheduledTasks/TaskRunHistory.tsx`
- `src/renderer/components/scheduledTasks/AllRunsHistory.tsx`

### 服务

- `src/renderer/services/scheduledTask.ts`

### 后端 route

- `server/routes/scheduledTasks.ts`

---

## 6. MCP

### 页面

- `src/renderer/components/mcp/McpManager.tsx`

### 服务

- `src/renderer/services/mcp.ts`

### 后端 route

- `server/routes/mcp.ts`

---

## 7. IM / 飞书

### 页面

- `src/renderer/components/im/IMSettings.tsx`
- `src/renderer/components/scheduledTasks/TaskForm.tsx`
- `src/renderer/App.tsx`

### 服务

- `src/renderer/services/im.ts`

### 特征

- 这条链不是纯 `window.electron` 兼容壳
- 它混合使用：
  - `localStore`
  - 直连 `fetch('/api/im/feishu/...')`

### 后端 route

- `server/routes/store.ts`（`im_config`）
- `server/routes/feishuWebhook.ts`
- `server/routes/dingtalkWebhook.ts`（兼容残留，不算现役主链）

---

## 8. 一句话收束

后面看页面不要再直接从 JSX 猜后端。

建议固定顺序：

1. 页面文件
2. 对应 service
3. `electronShim.ts` / `webApiContract.ts`
4. `server/src/index.ts`
5. 对应 `server/routes/*.ts`
6. 落库点 `sqliteStore.web.ts`
