# `124-配置台详细设计埋点版.md` 增量批注（按现网主链核验）

> 目的：保留 `124-配置台详细设计埋点版.md` 的梳理价值，但把“设计态设想”收束为“当前仓库真实可落地链路”。
> 口径：以当前代码为准，不补幻想接口，不提前扩写未来页。

---

## 1. 总判断

- 这份规范**有价值**，因为它把配置台拆成了可核查的「入口 / 数据 / 事件 / API / 错误」五层。
- 但它当前更像**设计图**，不是现网一比一实现稿。
- 真正落地时，必须先把每一项改写成“当前代码真的存在的链路”，否则会把后续埋点、重构、联调全部带偏。

---

## 2. 已核实的真实结构

### 2.1 页面形态

- 当前不是独立路由页 `/settings`。
- 真实形态是 `App.tsx` 里打开的 **Settings modal**：
  - `src/renderer/App.tsx`
  - `src/renderer/components/Settings.tsx`

### 2.2 当前真实 tab

- 当前真实 tab 为：
  - `model`
  - `nativeCapabilities`
  - `clawApi`
  - `im`
  - `conversationCache`
  - `coworkMemory`
  - `resources`
  - `dataBackup`
- `general` 仍在类型里，但默认会被归一到 `clawApi`，不是当前主入口。

### 2.3 当前真实保存主链

- 当前不是 `POST /settings/providers` 这类独立 settings API。
- 真实主链是：
  - `configService.init()` 读取本地配置
  - `configService.updateConfig()` 持久化应用配置
  - `coworkService.updateConfig()` 持久化协作配置
- 也就是说，`Settings` 当前是**本地配置聚合器**，不是“后端 settings 微服务控制台”。

---

## 3. 与 `124` 的关键偏差

### 3.1 `/settings` 路由口径不成立

- `124` 写的是独立路由 `/settings`。
- 现网不是。
- 因此所有以“路由切页”为前提的埋点，都要改成“弹层打开 / tab 切换”。

### 3.2 Provider 管理接口不成立

- `124` 中大量接口类似：
  - `GET /settings/providers`
  - `POST /settings/providers`
  - `GET /settings/providers/{id}/health`
- 现网没有这套路由。
- 当前 `API 配置` 的真实行为是：
  - 编辑 4 个角色的 `apiUrl / apiKey / modelId / apiFormat`
  - 保存时合并回 `app_config`
  - 测试连接时走 `window.electron.api.fetch` → `/api/api/fetch`

### 3.3 左侧“搜索配置”未实现

- `124` 设计了设置搜索框和 `GET /settings/search`。
- 当前 `Settings.tsx` 左侧只有 tab 列表，没有设置项搜索。
- 这项可以保留为未来扩展，但不能写成已存在主链。

### 3.4 MCP / Skills / 定时器不在当前 Settings 主体里

- `124` 把 MCP、Skills、Cron 都当成配置台内嵌分区。
- 现网不是。
- 这些是主视图独立页面，Settings 里当前没有对应 tab。
- 不能把主视图页面和设置弹层混成一个面。

### 3.5 错误处理口径也不是统一中间件

- `124` 中写了很完整的统一错误流程。
- 现网仍是组件内 `setError`、`console.error`、`showGlobalToast` 并存。
- 所以这份规范适合作为**收敛目标**，但不能误写成“已经统一”。

---

## 4. 当前可直接落地的埋点主链

### 4.1 Settings 打开链

- `settings-open-001`
- 真实入口：
  - `src/renderer/App.tsx`
  - `handleShowSettings()`
- 真实数据：
  - `showSettings`
  - `settingsOptions.initialTab`

### 4.2 配置加载链

- `settings-load-001`
- 真实入口：
  - `src/renderer/services/config.ts`
  - `configService.init()`
- 真实动作：
  - 读 `APP_CONFIG`
  - merge 默认值
  - normalize providers / helpers / native capabilities

### 4.3 配置保存链

- `settings-save-001`
- 真实入口：
  - `src/renderer/components/Settings.tsx`
- 真实动作：
  - `normalizeAgentRolesForSave`
  - `buildProviderConfigsFromAgentRoles`
  - `configService.updateConfig()`
  - `coworkService.updateConfig()`

### 4.4 API 连通性测试链

- `api-test-001`
- 真实入口：
  - `handleTestAgentRoleConnection()`
- 真实链路：
  - `settingsHelpers.buildOpenAICompatibleChatCompletionsUrl`
  - `window.electron.api.fetch`
  - `/api/api/fetch`

### 4.5 记忆管理链

- 当前真实存在，不是设计态：
  - `GET /api/cowork/memory/entries`
  - `POST /api/cowork/memory/entries`
  - `PUT /api/cowork/memory/entries/:id`
  - `DELETE /api/cowork/memory/entries/:id`
  - `GET /api/cowork/memory/stats`
- 还有真实轮询：
  - 12 秒 interval
  - window focus 刷新
  - visibility change 刷新

### 4.6 对话文件链

- 当前真实存在，不是未来设想：
  - 对话缓存目录
  - 最近备份时间戳
  - 打开目录 / 定位 manifest
- 但它主要依赖：
  - `localStore`
  - shell 打开路径
- 不是一个单独的后端 settings route。

### 4.7 IM 链

- `Settings` 内嵌的是 `IMSettings`
- 当前活链重点仍是**飞书**
- 钉钉按现有边界仅作软性收束 / 兼容占位，不再算 live 执行主链
- 这部分后续埋点必须遵守：**不要动飞书现有行为**

---

## 5. 工业化收束建议

### 5.1 可以保留 `124` 的地方

- 版块拆解方式
- 埋点 ID 命名意识
- “数据 / 事件 / API / 权限 / 错误” 五层表达
- 作为后续重构目标蓝图

### 5.2 必须修正的地方

- 不要继续写不存在的 `/settings/*` 接口
- 不要把主视图页硬塞进 Settings
- 不要把设计目标写成现状结论
- 不要混淆 Web 模式与 Electron 能力

### 5.3 下一步建议

- 先把 `Settings` 页单独补成“真实埋点版”
- 只覆盖当前真实 tab 与真实服务调用
- 再决定要不要开第二阶段：把 `124` 里的“搜索配置 / provider 细分管理 / 健康面板”升级为新功能设计稿

---

## 6. 最终结论

- 这类文档**非常有用**，因为它能把屎山拆出骨架。
- 但真正有价值的不是“写得像”，而是**设计稿 → 现网真链映射**这一步。
- 当前仓库里，`124` 最适合作为：
  - `梳理模板`
  - `重构目标`
  - `埋点命名参考`
- 不适合作为“当前 Settings 已实现说明书”直接使用。
