# MAINLINE 1.0 Boundary

> **增量批注（2026-03-26）**：当前分支已对 `DingTalk` 做软性收束：保留兼容入口但不再属于 live 运行面；现役主线以 `Web / Feishu / Scheduler / 身份记忆链` 为准。

## 一期主线

- Web 对话
- Feishu 渠道
- Scheduler 调度
- 按身份隔离的 24h 线程与记忆
- 固定四角色运行配置

## 一期不扩

- Room 实验线
- 自定义 agent 新增能力
- MCP 自定义入口对外暴露
- 把旧重链重新拉回主线

## 铁律

- `agentRoleKey` 是唯一身份真理
- `modelId` 不是身份键
- `all` 只是展示聚合
- 记忆、skills、MCP、线程、任务上下文都只能按身份隔离
- 环境变量不是默认安装主存储，只是部署兜底
- 系统级密钥走共享 runtime secret，角色级密钥走角色目录，渠道运行时走 `channels/<channelId>/`
- `SKILLs/` 只放定义与模板，不放运行时 secret
- 渠道绑定只保存 `channel -> agentRoleKey`，不把渠道凭证混进身份配置

## 文档处理口径

- PDF / Word / 常见附件解析属于底层通用能力，不额外包一层 skill
- 当前实现位于 `server/libs/fileParser.ts`
- `SKILLs/` 里没有同名目录，不代表系统不支持该文档类型
