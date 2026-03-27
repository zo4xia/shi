# 执行器与运行态文件深层走查（2026-03-27）

> 目标：把链路再往下扎一层，不停在 route，而是落到执行器和 runtime 文件生成器。

---

## 1. Cowork 执行器深层

### 1.1 入口

- 文件：`server/libs/httpSessionExecutor.ts`

这是当前 Web / Feishu 一期现役执行器。

### 1.2 它真正负责什么

- session running/idle/completed/error 状态切换
- 写 user message / assistant message / system error message
- 拼 system prompt
- 选 API 配置
- 判断是否走：
  - 普通 openai-compatible stream
  - designer images
  - bounded tool loop
- 最终收尾 `finalizer.finalize(sessionId)`

### 1.3 关键判断

它不是“单纯请求模型”的工具类。

它已经是：
- 会话执行中枢
- 状态机
- 提示词装配器
- 消息写入器
- 收尾器入口

---

## 2. Orchestrator 层

### 2.1 入口

- 文件：`clean-room/spine/modules/sessionOrchestrator.ts`

### 2.2 它做的事

`orchestrateWebTurn(...)` 主要负责：

- 判断是新会话还是续聊
- 准备 session ingress
- 读取 continuity bootstrap
- 构建 metadata
- 异步发给 executor

### 2.3 角色

它更像：
- 会话入口编排层

不是：
- 实际模型执行器

---

## 3. Role Runtime 文件生成链

### 3.1 技能索引文件

- 文件：`server/libs/roleSkillFiles.ts`
- 产物：
  - `roles/<role>/skills.json`

它从：
- `skill_role_configs`
- 已安装技能仓库

生成：
- 当前角色可见技能索引

### 3.2 角色设置视图

- 文件：`server/libs/roleRuntimeViews.ts`
- 方法：`syncRoleSettingsView(...)`
- 产物：
  - `roles/<role>/role-settings.json`

它从：
- `app_config`

生成：
- 当前角色只读设置视图

### 3.3 能力快照

- 文件：`server/libs/roleRuntimeViews.ts`
- 方法：`syncRoleCapabilitySnapshot(...)`
- 产物：
  - `roles/<role>/role-capabilities.json`

它汇总：
- `skills.json`
- `skill_role_configs`
- runtime MCP
- native capabilities
- 仓库已有技能
- invalid bindings

---

## 4. 现在已经能确认的真相

### 4.1 Web 主链已经不是“页面直调模型”

真实链：

- 页面
- service
- shim
- route
- orchestrator
- executor
- finalizer
- db / websocket

### 4.2 `role-capabilities.json` 是真相汇总面

它不是单点配置文件。

它是把：
- DB 绑定
- runtime files
- mcp
- native capabilities
- 仓库状态

重新折叠成一份角色快照。

### 4.3 `role-settings.json` 是只读投影，不是源头

源头仍然是：
- `app_config`

这点不能混。

---

## 5. 现在这套图的价值

到这一步，链路已经不是“文件列表梳理”了，而是能回答：

- 页面点一下到底走到哪
- 为什么同样叫 skill，结果有三层真相
- 为什么 `CoworkRunner` 不能再被误认成现役 Web 主路
- 为什么 `role runtime` 不是一个普通配置页接口

---

## 6. 下一步最值钱的方向

如果继续，我建议做这两件里的一件：

1. `Cowork` 端到端埋点稿
   - 页面动作
   - service
   - shim
   - route
   - executor
   - ws 回推

2. `Skills/RoleRuntime` 真相关系表
   - `skill_role_configs`
   - `roles/<role>/skills.json`
   - `roles/<role>/role-capabilities.json`
   - `app_config`
   四者逐项对照
