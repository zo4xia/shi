# Bug / 业务流 / 波及范围总表

这份表不是概述。  
它是为了让后面的人一眼看明白：

- 问题是什么
- 从哪个入口进来
- 在代码里流经哪些地方
- 会波及谁
- 当前修到哪了

如果以后又失忆了，就先看这张表。

---

## 1. 总表

| 优先级 | 问题名 | 入口 / 路由 | 真实流向 | 当前现象 | 波及范围 | 当前状态 |
|---|---|---|---|---|---|---|
| P0 | 广播板可见性不一致 | Web 对话 / 飞书 / 微信 / 遗留旧链 | `identity_thread_24h -> resolveContinuityBootstrap -> HttpSessionExecutor(buildSystemPrompt)` 或 `CoworkRunner(buildPromptPrefixAsync)` | 有的 agent 说看得到广播板，有的说看不到 | 所有跨渠道接力用户；尤其影响“连续性有没有真的接住” | 未收口 |
| P0 | `CoworkRunner` 遗留回流 | 定时任务 / 遗留兼容入口 | `Scheduler.executeTask -> runTaskDirectly -> fallback -> startCoworkSession -> CoworkRunner.startSession` | 主链明明已经切轻链，但旧壳仍可能回流 | 定时任务、旧入口、连续性口径、结果形态 | 未收口 |
| P0 | 角色房间内容治理 | `.uclaw/web/roles/<role>/` | `roles -> skills.json / role-capabilities.json -> buildSelectedSkillsPrompt` | 某些 role-bound skill 抢主线，让 agent “像中毒”；`writer` 当前更像是 `xias-ai-short-drama-toolbox-v1` + `gpt-5.4` 上游不稳叠加 | 当前角色本人，尤其 `writer` | 未收口 |
| P1 | 附件分片落盘路径不稳 | 上传文件 / 对话输入框 | `CoworkPromptInput -> saveInlineFile -> dialog.resolveInlineAttachmentDirs` | 分片落盘到错误目录，后续回合找不到 | 上传大文件用户 | 基本修好 |
| P1 | 附件误走网页工具 | 上传文件 / 对话过程工具选择 | `附件路径 -> browser_observe_page(file_path)` | 路径对，但工具错，导致“看不到文件” | 多文件/分片读取 | 基本修好 |
| P1 | 附件读取进度不透明 | 对话页 UI | `attachment_manifest / attachment_read -> Tool card` | 实际已读到哪片，用户还要自己猜 | 所有上传文件用户 | 未收口 |
| P1 | 定时任务 IM 通知误导 | 定时任务表单 / 详情 | `TaskForm -> notifyPlatforms 保存 -> scheduler 不发送` | 用户能选，但不会发 | 定时任务用户 | 已止血 |
| P1 | 定时任务 webhook 只是最小实现 | 定时任务完成回调 | `TaskForm completionWebhookUrl -> scheduler.sendCompletionWebhook` | 能发，但缺重试/回显/记录 | 定时任务通知 | 部分完成 |
| P1 | native capability 开关前端认知不清 | 设置页 / 外挂能力 | `Settings -> NativeCapabilitiesSettings -> app_config.nativeCapabilities` | 用户以为没开，但系统真实开着 | 全部 role；尤其 IMA / Browser Eyes | 已定位，待验证交互是否足够清楚 |
| P2 | 广播板观察窗与对话页割裂 | 设置页 / 对话页 | `broadcast-boards API -> Settings only` | 设置页能看到板，对话页看不见“本轮是否命中” | 正在调试连续性的用户 | 未收口 |

---

## 2. 每条链怎么流

### 2.1 Web / PC 对话主链

| 步骤 | 文件 | 作用 | 已知坑 |
|---|---|---|---|
| 1 | `server/routes/cowork.ts` | Web 对话入口 | 不要误判成还直冲 `CoworkRunner` |
| 2 | `server/libs/httpSessionExecutor.ts` | 现役执行器 | 广播板/skills/native capability 都在这里装配，最容易抢线路 |
| 3 | `server/libs/continuityBootstrap.ts` | 广播板/长期记忆读取真相源 | 数据层没坏时，不要把“口头看不到”误判成“板没了” |
| 4 | `server/libs/sessionTurnFinalizer.ts` | 回合结束写共享线程兜底 | 只写 `user/assistant` 正文，不写 thinking/tool |
| 5 | `server/libs/identityThreadHelper.ts` | 广播板读写 | 广播板是接力板，不是全文仓库 |

### 2.2 飞书主链

| 步骤 | 文件 | 作用 | 已知坑 |
|---|---|---|---|
| 1 | `server/routes/feishuWebhook.ts` / `server/libs/feishuGateway.ts` | 飞书入站消息、会话绑定、回帖 | 角色绑定要按 `agentRoleKey`，不能串脑 |
| 2 | `server/libs/httpSessionExecutor.ts` | 现役执行器 | 广播板命中和 tools 都在这里 |
| 3 | `server/libs/sessionTurnFinalizer.ts` | 回合末写广播板 | 过程信息不应被当成正式回复 |

### 2.3 微信桥接主链

| 步骤 | 文件 | 作用 | 已知坑 |
|---|---|---|---|
| 1 | `server/libs/wechatbotGateway.ts` | 微信桥接入站、文件解析、会话绑定 | 最容易被怀疑“串线”；必须盯 `agentRoleKey` 和 `sourceType=external` |
| 2 | `server/libs/channelSessionBinding.ts` | 渠道 + 角色 -> 会话绑定 | 绑定错就会跨人串线 |
| 3 | `server/libs/httpSessionExecutor.ts` | 对话执行 | 广播板主链在这里拼进 system prompt |

### 2.4 定时任务主链

| 步骤 | 文件 | 作用 | 已知坑 |
|---|---|---|---|
| 1 | `server/routes/scheduledTasks.ts` | 任务 CRUD / 手动运行入口 | 这里不发送通知，只是入口 |
| 2 | `src/main/scheduledTaskStore.ts` | 任务存储与 run 历史 | `notifyPlatforms` 只是存储，别误判成已接线 |
| 3 | `src/main/libs/scheduler.ts` | 真正执行、状态更新、webhook | 这里还有 `CoworkRunner` fallback 活口 |
| 4 | `server/src/index.ts` | 把 scheduler 优先桥到 `HttpSessionExecutor` | 方向对了，但旧口还在 |

### 2.5 附件 / 本地文件主链

| 步骤 | 文件 | 作用 | 已知坑 |
|---|---|---|---|
| 1 | `src/renderer/components/cowork/CoworkPromptInput.tsx` | 前端分片、上传、组装 `输入文件:` | 前端会切片，但不是问题本体 |
| 2 | `server/routes/dialog.ts` | `saveInlineFile` / `parseInlineFile` | 保存目录真相源如果漂，就会“找不到文件” |
| 3 | `server/libs/attachmentRuntime.ts` | 附件 manifest / 读取 | 现役附件工具面 |
| 4 | `server/libs/httpSessionExecutor.ts` | 把附件链接入对话执行 | 错把附件交给浏览器工具时，就会看起来像“不会读” |

---

## 3. 当前最值得继续打标签的文件

优先顺序：

1. `server/libs/httpSessionExecutor.ts`
2. `src/main/libs/scheduler.ts`
3. `src/main/libs/coworkRunner.ts`
4. `server/libs/wechatbotGateway.ts`
5. `server/routes/dialog.ts`
6. `src/renderer/components/cowork/CoworkSessionDetail.tsx`
7. `src/renderer/components/settings/CoworkMemorySettingsPanel.tsx`

---

## 4. 现在最稳的继续修顺序

1. 先收广播板可见性一致性
2. 再压 `CoworkRunner` 活口
3. 再治 `writer` 房间里的 skill 抢主线
4. 再补 UI 的强状态透明

不要反过来。  
不要先做花的。  
不要再把主链做重。
