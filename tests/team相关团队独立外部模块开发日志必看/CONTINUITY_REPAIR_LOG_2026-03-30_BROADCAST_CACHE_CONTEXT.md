# 连续性修缮记录（2026-03-30）

## 本轮落地

1. 原始上下文收紧为最近 `3` 条
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 目的：和“广播板优先 + 最近几条正文 + 必要时再翻历史”的边界对齐。

2. 执行器新增 `broadcast_board_write`
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 目的：让 agent 在回合过程中自己写接力棒，而不是只靠回合结束后的被动抽取。
   - 用法边界：记录关键要求、判断、坑点、修复结果、下一棒提醒；不写全文。

3. system prompt 明示广播板职责
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 目的：把“广播板是接力板，不是全文仓库”重新钉回主链。

4. turn cache TTL 提升到 `30` 分钟
   - 文件：`server/libs/turnCache.ts`
   - 目的：在不改动主业务流的前提下，先抬高重复请求的缓存命中率。

5. 轻执行器默认不再靠窄启发式限制 tool loop
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 目的：恢复“是否调用工具由 agent 决定”的主边界，不再把大多数普通回合静默挡回 single-shot。
   - 兼容边界：若上游 OpenAI-compatible 接口不支持 `tools / tool_choice`，自动回退到原 single-shot，不把不兼容供应商直接打挂。

6. tool 兼容解析抽成独立模块
   - 文件：`server/libs/toolRuntimeCompat.ts`
   - 目的：把 `tool_calls / function_call / responses.output.function_call / text preview / 空响应摘要` 从执行器主文件里剥离出来。
   - 价值：后续别的项目或别的执行器要复用 provider 兼容层时，不必再从 `HttpSessionExecutor` 大文件里抄逻辑。

7. tool 请求构造抽成独立模块
   - 文件：`server/libs/toolRuntimeRequest.ts`
   - 目的：统一构造 tool completion 的 URL、headers、body 和请求摘要，避免执行器继续手拼请求。
   - 价值：后续如果要兼容更多 provider 或切到别的执行器，请求层可以单独复用和扩展。

8. 飞书网关启动补了去重和并发守卫
   - 文件：`clean-room/spine/modules/feishuRuntime.ts`
   - 文件：`server/src/index.ts`
   - 文件：`server/routes/feishuWebhook.ts`
   - 目的：同一个 `appId` 即使在配置层重复出现，或自动启动 / 手动启动链路有重叠，也不会再被重复拉起成多个网关实例。
   - 额外处理：状态接口会过滤掉“已停用但还挂在旧指针上的空 gateway”，避免网关列表多出一条离线空壳。

## 运行时回归结果

1. 本地 3001 已替换为新构建实例后，`recent_chats` 真会话验证通过
   - 会话：`242965c7-7960-40ac-976e-af6a2aed3fa2`
   - 结果：`tool_use = 1`、`tool_result = 1`、最终 assistant 正常收尾
   - 说明：当前“agent 只能回一句、不会调工具”的主问题，在现役轻执行器主链上已经恢复

2. 请求摘要与响应摘要已在运行时日志里闭环
   - 第一跳：上游返回 `content = null + tool_calls = 1`
   - 第二跳：带入 `tool_result` 后，上游返回最终 assistant 文本
   - 说明：当前链路已验证为真实的 assistant -> tool -> assistant 两段式闭环，不是伪造状态消息

3. 启动日志还暴露了一个旁路风险
   - 有两个 skill 的 YAML frontmatter 缩进错误，启动时会报解析异常
   - 这和本轮 tool loop 修复不是同一个问题，但会持续污染运行时日志，后续应单独清掉

4. 飞书网关本地回归通过
   - 自动启动：本地 `3001` 新实例启动后，飞书日志为 `3` 个不同 app 各起一次，没有同一 `appId` 的重复实例
   - 手动启动：故意提交带重复 `appId` 的 `/api/im/feishu/gateway/start` 请求，最终只启动 `3` 个网关，没有膨胀成第 `4` 个实例
   - 状态接口：`/api/im/feishu/gateway/status` 现只返回真实的 `3` 个在线 gateway，不再夹带一个离线空壳

## 当前仍保留的旧边界

- `SessionTurnFinalizer` 仍会在回合结束后把本轮新增 `user/assistant` 写入 `identity_thread_24h`
- 这层是兜底归档，不再是广播板唯一来源
- 现在变成“双保险”：
  - 回合中：agent 可主动写接力
  - 回合末：系统继续兜底补写

## 这轮修复的意图

不是把系统做成只会一问一答的 `RPA`，
而是让同一身份在不同频道里，先看广播板，再看最近 3 条正文，然后继续接力。

补充：

- “只回一条、像被捂嘴”的一个真实根因，是 `HttpSessionExecutor` 之前默认先走 `runOpenAIStream()`，只有命中窄启发式才进入 `runBoundedToolLoop()`。
- 这会把本该由 agent 自己决定的工具调用，错误地下沉成“先过 regex 审批再说”。

## 结构收束补丁

1. 广播板观察窗与记忆管理 UI 抽成独立组件
   - 文件：`src/renderer/components/settings/CoworkMemorySettingsPanel.tsx`
   - 接线文件：`src/renderer/components/Settings.tsx`
   - 目的：把 `coworkMemory` 标签页里“连续性说明 + 广播板观察窗 + 记忆条目管理 + 编辑弹窗”从巨型设置页主文件中拆出来。
   - 边界：这次不改任何广播板读写规则、不改接口、不改数据结构，只收束 UI 组织形态。
   - 价值：
     - 后续继续做广播板命中、上下文来源、缓存命中展示时，不必再在 `Settings.tsx` 巨型 switch 里硬塞。
     - 这块组件可以原样复用到别的项目或别的设置容器里。
     - 下次排查“看不见广播板”时，入口边界更清楚，不容易又把主线埋回大文件。

2. 最小验证
   - 命令：`npm --prefix 'D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean' run build:web`
   - 结果：通过

## 工具状态流补丁

1. 收紧 tool loop 的“兼容性回退”判定
   - 文件：`server/libs/toolRuntimeCompat.ts`
   - 变更：`isToolLoopCompatibilityError(...)` 不再把 `empty response / 空响应 / 未产出最终 assistant 内容` 当成“上游不支持 tools”。
   - 原因：这类错误更像 tool loop 自己的运行时异常或 provider 响应漂移；如果把它们静默吞掉再回退 single-shot，就会把 agent 又压回“一次一句”的假正常状态。
   - 新边界：只有明确的 `tool/tool_choice/function_call` 不兼容，才允许回退到 `runOpenAIStream()`；真正的 tool loop 异常应暴露出来，便于继续修正，不再伪装成正常单轮回复。

2. 统一最终 assistant 的阶段标记
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 变更：流式最终回复从创建、更新到收口都补上 `metadata.stage = 'final_result'`。
   - 原因：和已有的 `stage = 'pre_tool'` 对齐，避免后续外部渠道、UI、导出、埋点再把“过程说明”和“最终答复”混成同一种 assistant 消息。
   - 价值：后面继续做“多条 assistant 回复 / 工具状态流”展示时，可以直接按阶段分层，不必再靠文案猜。

3. 补硬 tool grounding 口径
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 变更：系统提示新增 `Tool Grounding` 规则。
   - 规则：当前回合一旦已经出现 `tool_result`，assistant 不得再说“我不能调用 / 不能访问 / 工具不可用”；必须直接基于结果回答，最多说明结果不完整。
   - 原因：上一轮真实回归里，模型已经成功调了 `recent_chats`，但最终文案仍口头否认自己能调用工具，属于模型口径漂移，不是执行链没跑。

4. 补 provider 伪 SSE / 误回退识别
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 文件：`server/libs/toolRuntimeCompat.ts`
   - 变更一：`stream:false` 的 tool completion 如果收到 `data:` 包，会先走 SSE 解析再尝试合成 payload。
   - 变更二：`isToolLoopCompatibilityError(...)` 不再用过宽的 `tool` 单词命中，避免把任意带 `tool` 字样的错误都误判成“模型不支持 tools”。
   - 变更三：若上游只返回 usage / 空 choices 的伪 SSE，会明确抛成 `does not appear to support tool completions`，再进入 fallback。
   - 变更四：fallback single-shot 额外补一段 `Tool Compatibility Notice`，要求模型诚实说明“当前 provider/model 这轮没执行 tool completions”，不要再谎报成“项目里没有这个工具”。
   - 真实结论：`organizer / glm-5.1` 当前能完整走 tool loop；`writer / gpt-5.4` 这组供应商目前返回的是 usage-only 伪 SSE，更像 provider 不支持这类 tool completion，而不是本地链路没进工具模式。

## 当前进度

### 第一段：基本稳住

- `writer` 角色锚点没飘
- `writer + kimi-k2.5` 工具回环已测通
- `writer + kimi-k2.5` 多工具串联已测通：`recent_chats + conversation_search`
- `organizer` 飞书工具链能跑
- “模型不是身份”这条边界已经钉住

### 第二段：输出面与历史回灌收口

1. 飞书 / webhook 只外发 `final_result`
   - 文件：`server/libs/feishuGateway.ts`
   - 文件：`server/routes/feishuWebhook.ts`
   - 变更：`extractNewAssistantReplies(...)` 现在只提取：
     - `assistant`
     - 非 `thinking`
     - `stage` 为空的旧消息，或 `stage = 'final_result'`
   - 原因：`pre_tool / tool_trace` 这类过程 assistant 不能再被当成正式答复回帖到飞书。

2. 上游历史只带正式 assistant
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 变更：装配 OpenAI-compatible 上游历史时，只回灌 `final_result` 或旧式无阶段 assistant。
   - 原因：如果把 `pre_tool` 过程说明也当成 assistant 历史带回去，后续回合会把过程话术误当成“上次真正说过的话”，直接污染连续性。

3. 前端展示不再把所有 assistant 一律叫“正式回复”
   - 文件：`src/renderer/components/cowork/CoworkSessionDetail.tsx`
   - 变更：assistant 卡片现在按 `stage` 分层：
     - `final_result / 空 stage` => `正式回复`
     - `pre_tool` => `过程信息 · 执行前说明`
     - `tool_trace` => `过程信息 · 运行轨迹`
   - 附带：markdown 导出同样会给非 `final_result` assistant 打上 `Assistant Process` 标签。

4. 第二段当前结论
   - “过程 assistant 被当成正式回复”这条漂移，已在：
     - 渠道外发
     - 前端展示
     - 上游历史回灌
     三个面同时收口。
   - 这一步的目标不是让 agent 少说话，而是把“正式回复”和“过程信息”边界焊死，避免下一轮又把状态消息当正文。

## 文件输入链补丁

1. 前端文本大文件分片补成用户可见主链
   - 文件：`src/renderer/utils/textFileChunking.ts`
   - 文件：`src/renderer/components/cowork/CoworkPromptInput.tsx`
   - 变更：
     - 把生成出来的文本分片文件名规则抽成可识别 descriptor
     - 输入区附件 chip 不再只显示 `part-01-of-xx` 原始碎片名，而是显示：
       - 原文件名
       - `文本分片 01/xx` 或 `解析分块 01/xx`
   - 原因：用户需要看得出“这些碎片其实属于同一份源文件”，否则很像系统自己炸成一堆无关附件。

2. prompt 明示“这些分片属于同一份文件”
   - 文件：`src/renderer/components/cowork/CoworkPromptInput.tsx`
   - 变更：提交时会对分片附件按源文件分组，额外补一行：
     - `输入文件说明: xxx 已按顺序拆成 N 份，请把这些 part 视为同一份文件连续处理。`
   - 原因：降低模型把同一文档分片误判成多份独立材料的概率。

3. 文件选择器允许一次选多份
   - 文件：`src/renderer/components/cowork/CoworkPromptInput.tsx`
   - 变更：隐藏 `input[type=file]` 补上 `multiple`
   - 原因：拖拽早就支持多文件，但点击上传还只允许单选，口径不一致。

### 当前口径

- 身份锚点看 `agentRoleKey`，不是 `modelId`
- 当前连续性、广播板、长期记忆、工具状态流，仍按 `writer / organizer / analyst / designer` 这四个角色桶来落
- `modelId` 只代表角色当前挂的发动机，不代表“你是谁”

## 附件阅读主链补丁

### 这轮死守的边界

- 不捂嘴：agent 仍可多次回复、多次工具调用、多轮连续阅读
- 透明的是状态，不是限制：程序负责显示“读到第几片、哪一片已完成”，不是强制每片都停下来问用户
- 大文件不再假装已经全部读完：优先给索引，再按需读取
- 角色锚点不变：仍按 `writer / organizer / analyst / designer` 落身份与连续性，不按模型分桶
- 广播板 / 长期记忆 / 最近 3 条正文这条连续性主链，本轮未改

### 当前真实实现

1. 抽出共享分片元信息解析
   - 文件：`src/shared/attachmentChunkMetadata.ts`
   - 作用：统一识别
     - `xxx.part-01-of-12.ext`
     - `xxx.extracted.part-01-of-12.txt`
   - 原因：前端附件 chip、服务端附件运行时、后续别的项目都要共用这一层，不能再各写一套正则。

2. 抽出服务端附件运行时
   - 文件：`server/libs/attachmentRuntime.ts`
   - 现有能力：
     - `buildAttachmentRuntimeContext(...)`
     - `attachment_manifest` 用到的 manifest 文本
     - `attachment_read` 的按片读取
     - 大文件/分片附件的 inline manifest prompt
   - 目的：把附件索引、分片归组、按片读取、结果格式化从 `httpSessionExecutor.ts` 巨型文件里剥出去。

3. 执行器新增两个内置附件工具
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 新工具：
     - `attachment_manifest`
     - `attachment_read`
   - 边界：
     - 附件一旦存在，就给 agent 一个真实可调用的附件工具面
     - 不再要求 agent 只靠 prompt 里被截断的附件正文瞎猜

4. 分片/多文件 turn 不再默认全文内联
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 改动点：`inlineAttachmentContent(...)`
   - 新规则：
     - 普通少量附件：保留原有“小文件直接解析内联”捷径
     - 分片附件或多文件附件：改为返回 manifest，提示 agent 用 `attachment_manifest / attachment_read` 按需读
   - 真实含义：
     - 我们不再把“上传了很多片”硬塞成一大段 prompt 正文
     - 也不再让模型口头假装“我已经看完全部”

5. 给附件型回合放宽受控工具回环
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 新规则：
     - 普通回合：仍是 `10 步 / 90 秒`
     - 检测到分片附件：放宽到 `24 步 / 180 秒`
   - 原因：
     - 前端文本分片上限本来就是 `24` 片
     - 如果还用 `10` 步，很容易在“真正按片读文件”时再次撞到假性安全边界
   - 注意：
     - 这不是捂嘴，相反是给 agent 真实阅读空间
     - 但仍保留受控边界，避免无限工具回环

6. UI 工具摘要改成人能读懂的进度
   - 文件：`src/renderer/components/cowork/sessionDetailHelpers.ts`
   - 新行为：
     - `attachment_read` 显示成 `源文件 03/12`
     - `attachment_manifest` 显示成 `manifest · 3 sources`
   - 目的：
     - 让“程序已经实际读取到哪一片”在会话区直接可见
     - 不再让用户盯着原始 JSON 猜到底读没读

### 当前真实结果

- agent 仍然自由，不是被限制成“一片一问”
- 但附件阅读进度开始有程序层的可见锚点
- 大文件处理从“全文塞 prompt”往“索引 + 按需读取”切过去了
- 这条线和 `openclaw-lark` 的思路一致：过程状态透明，文件先引用再处理

## 分片落盘路径事故记录

### 事故现象

- 用户反馈：大文件切片后，agent 经常只能看到第一片或前几片，像是“找不到后续文件”
- 真实判断：这更像“分片文件挂载/保存目录链不稳定”，不是 agent 不愿意阅读

### 实勘结果

1. 当前对话工作目录真相源
   - `GET /api/cowork/config` 返回：
     - `workingDirectory = D:\\Users\\Admin\\Desktop\\3-main\\delivery-mainline-1.0-clean`

2. 当前对话文件缓存目录配置
   - `GET /api/store/app_config` 返回：
     - `conversationFileCache.directory = ''`
   - 说明：这次并没有用户自定义文件缓存目录接管保存。

3. 当前测试分片真实落盘位置
   - 文件：`探险的故事-世界的小居民有什么样的个性色彩呢.part-01-of-05 ... part-05-of-05`
   - 实际落在：
     - `D:\\Users\\Admin\\Desktop\\3-main\\delivery-mainline-1.0-clean\\.uclaw\\web\\attachments`
   - 而不是预期优先落点：
     - `D:\\Users\\Admin\\Desktop\\3-main\\delivery-mainline-1.0-clean\\.cowork-temp\\attachments\\manual`

### 根因判断

- `saveInlineFile` 后端原先只信前端透传的 `cwd`
- 如果前端在某个时机没有稳定把 `cwd` 带上，保存链就会绕过当前工作目录
- 最终退回到用户数据目录 `.uclaw\\web\\attachments`
- 一旦分片落到这条旁路目录，后续消息挂载/读取链就更容易“只带到第一片或前几片”

### 已做修复

- 文件：`server/routes/dialog.ts`
- 修复：`resolveInlineAttachmentDirs(...)` 现在的兜底顺序改成：
  1. 前端显式 `cwd`
  2. `coworkConfig.workingDirectory`
  3. `workspaceRoot`
  4. `conversationFileCache.directory`
  5. 最后才退回 `userDataPath`

### 当前边界

- 系统内部确实有“对话文件保存目录”这条动态配置线，不能只看前端传参
- 以后分片文件落盘必须优先跟随当前对话工作目录真相源
- 这一步是为了解“分片后找不到文件”，不是为了限制 agent 阅读
- 如果用户没有显式设置对话文件目录，默认应回到项目根目录下的 `uploud` 相对路径体系；部署到服务器时也必须守这个相对根约束，不能漂到不可预期的绝对路径黑箱里

## 附件误走浏览器工具事故

### 事故现象

- 用户在过程信息里明确看到：
  - `browser_observe_page`
  - `{"file_path":"D:\\Users\\Admin\\Desktop\\3-main\\delivery-mainline-1.0-clean\\uploud\\attachments\\manual\\..."}`
- 说明本地文本分片路径被误当成“页面/文件观察目标”交给了小眼睛工具。

### 根因判断

1. `browser_observe_page` 本身允许传 `file_path`
   - 文件：`src/shared/nativeCapabilities/browserEyesAddon.ts`

2. `HttpSessionExecutor` 的 organizer + 小眼睛链路，会在系统提示和预加载观察里优先鼓励页面观察
   - 文件：`server/libs/httpSessionExecutor.ts`

3. 当用户消息同时带有 `输入文件: 路径` 时，本地分片文件路径和 HTML 页面路径在模型视角里混成了一类
   - 结果：模型把“读附件分片”错判成“观察本地页面文件”

### 已做修复

1. 执行器侧硬隔离
   - 文件：`server/libs/httpSessionExecutor.ts`
   - 修复：
     - 只要当前用户消息里带附件引用，就不再触发 `buildPreloadedPageObservationPrompt(...)`
     - `resolveObservationTarget(...)` / `extractFirstObservationTarget(...)` 也不会再把这些附件路径当浏览器观察目标

2. 浏览器 addon 侧意图隔离
   - 文件：`src/shared/nativeCapabilities/browserEyesAddon.ts`
   - 修复：
     - 只要消息里包含 `输入文件:`，`detectBrowserEyesIntent(...)` 直接返回 `null`
   - 目的：
     - 防止本地文件分片再次误命中 `browser_observe_page`

### 当前边界

- 附件分片路径不是网页，不应再被小眼睛当作 `file_path` 页面目标
- 有附件时，优先走附件读取链，不让浏览器观察工具抢道

### 用户实测补证

- 过程信息中真实出现：
  - `browser_observe_page`
  - `{"file_path":"D:\\Users\\Admin\\Desktop\\3-main\\delivery-mainline-1.0-clean\\uploud\\attachments\\manual\\..."}`
  - 执行结果：`小眼睛暂时没有观察到有效结果。`

这条证据说明三件事：

1. 分片文件并没有丢
   - 文件真实存在
   - 文件夹真实存在

2. 当前回合也不是没拿到路径
   - 路径已经正确传到 agent / 工具层
   - 并且路径位于用户设置的目录：`uploud\\attachments\\manual`

3. 真正错误点是“工具选错”
   - 不是“不阅读”
   - 不是“文件不存在”
   - 不是“路径不对”
   - 而是拿着正确的本地文本分片路径，去调用了 `browser_observe_page`

### 当前事故定性

- 这次问题已经收缩成：**附件路径进入 agent 后，被错误路由到网页观察工具**
- 现在不是文件系统问题，而是工具调度问题

## 本轮实测结论（成功）

- 本地分片测试已成功
- 关键成功条件：
  1. 分片文件真实落盘
  2. 文件路径真实传入当前回合
  3. 附件任务不再误走 `browser_observe_page`
  4. agent 能继续顺着分片往下读

### 新增固定口径

- 本地文件夹规则：
  - 如果用户显式设置了对话文件保存目录，就优先走用户设置目录
  - 如果用户没有设置，就默认读取/保存到**项目根目录相对路径**下的 `uploud` 文件夹对应路径
- 原因：
  - 部署到服务器时必须保持“相对项目根目录”的稳定性
  - 避免再次漂到用户数据目录或其他不可见黑箱路径
