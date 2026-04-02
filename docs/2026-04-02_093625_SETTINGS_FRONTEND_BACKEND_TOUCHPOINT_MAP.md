# Settings 前后端交点图

时间：2026-04-02 09:36:25

## 目的

这份文档不是为了讲设置页长什么样。

它是为了先把最危险的东西钉住：

- 设置页哪些地方会读后端
- 哪些地方会写后端
- 哪些是统一保存时才生效
- 哪些是一点就立即生效
- 哪些白天可以改壳
- 哪些必须留到晚上夜深人静再动

一句话：

> 先把交点图看清，再决定哪里能掀、哪里不能碰。

---

## 总原则

### 安全等级定义

| 等级 | 名称 | 含义 | 允许动作 |
|---|---|---|---|
| `S0` | 禁动区 | 一旦误碰，极可能直接影响客户现用配置、联通状态或数据完整性 | 白天不动，夜里也要极谨慎 |
| `S1` | 夜间操作区 | 逻辑链较深，建议夜深人静时单独处理 | 白天只看不改，晚上小步验证 |
| `S2` | 轻改区 | 可做壳层、tab、卡片、宽度、折叠等前端整理，但不碰逻辑 | 白天可动样式与结构 |
| `S3` | 安全区 | 只读展示或低风险纯视觉区域 | 白天优先处理 |

### 白天可以动

- tab 结构
- 卡片壳
- 过渡组件
- 宽度/间距/视觉层级
- 说明收起/展开

### 晚上再动

- 配置保存主链
- 连接测试
- 记忆增删改
- 会话/模型同步逻辑
- 即时生效的底层配置

### 白天禁动

- `IMSettings`
- 自动启动即时生效链
- 备份导入/恢复动作
- `configService.updateConfig()` 总保存链

---

## 交点总表

| 区块 | 前端入口 | 读取来源 | 写入出口 | 参数/数据结构 | 生效时机 | 安全等级 | 白天能动吗 |
|---|---|---|---|---|---|---|---|
| 整页加载 | `Settings.tsx` | `configService.getConfig()` / `localStore.getItem()` / `window.electron.autoLaunch.get()` / `workspace.getPath()` | 无 | `AppConfig`、备份时间戳、workspace path | 打开设置时 | `S2` | 只可改壳 |
| 统一保存主链 | `Settings.tsx#handleSubmit` | 当前表单 state | `configService.updateConfig()` / `apiService.setConfig()` / `coworkService.updateConfig()` | `theme/language/useSystemProxy/conversationCache/dailyMemory/nativeCapabilities/agentRoles/providers/shortcuts` | 点击“保存” | `S0` | 不建议 |
| 配置持久化 | `services/config.ts#updateConfig` | 当前 config | `localStore.setItem(APP_CONFIG)` | `AppConfig` | `updateConfig()` 时 | `S0` | 禁动 |
| 对话文件目录 | `conversationCache` tab | `conversationCacheDirectory` state | 统一保存时写入 | `conversationFileCache.directory` | 保存 | `S2` | 可动壳 |
| 对话归档状态 | `conversationCache` tab | `localStore.getItem(CONVERSATION_FILE_BACKUP_STATE_KEY)` | 无 | `conversationFileCache.lastBackupDate` | 打开设置/点刷新 | `S3` | 可动壳 |
| 打开目录 / manifest | `conversationCache` tab | shell 路径 | 无 | `open/reveal(path)` | 点击按钮即执行 | `S2` | 只改样式 |
| 自动启动 | `general` tab | `window.electron.autoLaunch.get()` | `window.electron.autoLaunch.set(next)` | `enabled: boolean` | 点击开关即生效 | `S1` | 夜里再动 |
| 系统代理 | `general` tab | 本地 state | 统一保存时写入 | `useSystemProxy: boolean` | 保存后生效 | `S2` | 可动壳 |
| Agent 角色配置 | `model` tab | `agentRoles` / `providers` | 统一保存时写入 `agentRoles/providers/api/model` | `AgentRoleConfigMap` | 保存 | `S1` | 白天只改结构 |
| 角色启停 | `model` tab 左侧 | 本地 state | 统一保存 | `role.enabled` | 保存 | `S2` | 只改展示 |
| 角色连接测试 | `handleTestAgentRoleConnection` | 表单 URL/Key/Model/Format | `window.electron.api.fetch()` | provider probe payload | 点击按钮即时请求 | `S1` | 夜里再动 |
| 每日记忆 | `coworkMemory` tab | `dailyMemory.*` | 统一保存 | `enabled/apiUrl/apiKey/modelId/apiFormat` | 保存 | `S1` | 白天只改壳 |
| Native Capabilities | `nativeCapabilities` tab | `value` props | `onChange -> nativeCapabilities state` -> 统一保存 | `NativeCapabilitiesConfig` | 保存 | `S3` | 最适合白天过渡 |
| Cowork Memory | `coworkMemory` tab | `coworkService.listMemoryEntries/getMemoryStats/listBroadcastBoards` | `create/update/deleteMemoryEntry` | query、entry payload | 页面内即时请求/即时写入 | `S1` | 夜里再动 |
| Data Backup | `DataBackup` | `GET /api/backup/stats` | `GET /api/backup/export` / `POST /api/backup/import` | sqlite blob / stats | 按钮即时执行 | `S1` | 白天只改壳 |
| IMSettings | `IMSettings.tsx` | 多平台配置 + runtime 状态 | `imService.updateConfig()` / gateway restart / refresh / qr login | Feishu / Wechat / NIM / QQ / Telegram / Discord... | 多数是失焦或点击即生效 | `S0` | 白天禁动 |

---

## 最高风险交点

### 1. 设置页统一保存总入口

文件：

- `src/renderer/components/Settings.tsx`

关键位置：

- `handleSubmit`

原因：

- 这里把 `theme / proxy / conversationCache / dailyMemory / nativeCapabilities / agentRoles / providers / shortcuts` 一起装配
- 一旦这里带偏，客户现有配置会一起被写坏

结论：

- 安全等级：`S0`
- 白天不要动逻辑
- 只能动布局和容器

### 2. 真正的配置落盘口

文件：

- `src/renderer/services/config.ts`

原因：

- `updateConfig()` 最终负责写到本地配置存储
- 这不是普通展示逻辑，是落盘真理

结论：

- 安全等级：`S0`
- 禁止白天乱碰

### 3. IMSettings

文件：

- `src/renderer/components/im/IMSettings.tsx`

原因：

- 多个平台配置都在这里
- 失焦、切换、按钮操作都可能立即保存、立即刷新、立即重启 gateway
- 客户正在使用中，最容易误伤

结论：

- 安全等级：`S0`
- 白天完全绕开
- 只看，不动

---

## 最适合白天过渡组件化的 tab

### 1. `nativeCapabilities`

原因：

- 纯受控组件
- 只通过 `value / onChange` 回传
- 最终仍走统一保存链
- 不会先碰即时生效

结论：

- 最适合做 Settings 过渡组件试点

### 2. `resources`

原因：

- 只读入口页
- 几乎零配置写入风险
- 适合验证 tab-shell、壳层和滚动区过渡

结论：

- 适合白天轻改

### 3. `dataBackup`

原因：

- 可以改外壳和布局
- 但绝不能碰导入/导出/恢复逻辑

结论：

- 只改外观，不动动作

---

## 当前建议

白天继续做：

1. `nativeCapabilities`
2. `resources`
3. `dataBackup` 外壳

白天不要碰：

1. `IMSettings`
2. `handleSubmit`
3. `configService.updateConfig`
4. 连接测试链
5. 记忆增删改链

---

## 一句话总结

> 设置页不是不能动，而是必须先知道哪里只是壳，哪里是一碰就会把客户现用配置带偏的真实交点。
