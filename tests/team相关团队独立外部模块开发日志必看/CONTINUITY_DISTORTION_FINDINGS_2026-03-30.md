# 连续性失真点排查（2026-03-30）

> 目的：记录当前仓库里，哪些地方正在把“有身份、有接力的 agent”压成更像 `RPA / 单次结果壳` 的行为。
>
> 这份文档不是最终修复说明，而是修缮前的故障定位图。

## 1. 当前判断

当前项目不是“连续性全没了”，而是：

- 数据层还在
- 主链还在
- 语义还在
- 但部分执行链、兼容壳、展示层策略，正在把真实过程压扁

所以问题更像：

- `Agent` 语义还活着
- `RPA` 化行为在局部冒头

## 2. 失真点总表

| 等级 | ID | 文件 | 现象 | 判断 |
|---|---|---|---|---|
| P0 | `distortion-runner-final-result-001` | `src/main/libs/coworkRunner.ts` | 最终结果有截断和复用旧消息逻辑 | 兼容壳存在真相压缩风险 |
| P0 | `distortion-runner-truncate-001` | `src/main/libs/coworkRunner.ts` | streaming / tool / final result 都可能被截断 | 若下游误拿作真相源，会失真 |
| P0 | `distortion-executor-one-shot-001` | `server/libs/httpSessionExecutor.ts` | 轻执行器单 shot 时每轮通常只产出一个 assistant 最终消息 | 能力上更像“单轮结果机”，不是完整 agentic loop |
| P1 | `distortion-ui-display-filter-001` | `src/renderer/components/cowork/CoworkSessionDetail.tsx` | thinking / tool / system 会被分组、折叠、过滤 | display-only 可接受，但不能反向污染真相源 |
| P1 | `distortion-shared-thread-summary-001` | `server/libs/identityThreadHelper.ts` | 共享线程只保留摘要和锚点 | 这是设计，不是 bug；但必须防止被误当全文 |
| P1 | `distortion-loop-heuristic-001` | `server/libs/httpSessionExecutor.ts` | bounded tool loop 触发依赖启发式判断 | 判断过窄时，会把本该 agentic 的请求压回 single-shot |

## 3. 逐点说明

### 3.1 `coworkRunner` 最终结果覆盖与复用

文件：

- `src/main/libs/coworkRunner.ts`

关键位置：

- `truncateLargeContent(...)`
- `persistFinalResult(...)`
- `handleStreamEvent(...)`
- `finalizeStreamingContent(...)`

现象：

- final result 会先走截断
- 某些情况下会更新已有 assistant message，而不是新建消息
- 这是为了避免流式重复，但也容易把“不同阶段的输出”压到一个壳里

判断：

- 对“同一条流式消息的收口”来说，复用是合理的
- 但对“本来应该保留为不同语义阶段的输出”来说，风险很高
- 旧兼容壳不是现役 Web 主链，但仍可能影响某些入口

### 3.2 `HttpSessionExecutor` 的 single-shot 边界

文件：

- `server/libs/httpSessionExecutor.ts`

关键位置：

- `runOpenAIStream(...)`
- `needsBoundedToolLoop(...)`
- `runBoundedToolLoop(...)`

现象：

- 默认轻链是 single-shot
- 只有命中启发式时才进 bounded tool loop
- 因此一部分本该具有多步行为的请求，会退化成“只出一个结果”

判断：

- 这是典型的“能力压缩”
- 不一定是 bug，但确实是 `Agent -> RPA-lite` 的主要来源之一

### 3.3 `CoworkSessionDetail` 的展示过滤

文件：

- `src/renderer/components/cowork/CoworkSessionDetail.tsx`

关键位置：

- `buildDisplayItems(...)`
- `buildConversationTurns(...)`
- `isRenderableAssistantOrSystemMessage(...)`
- `buildMarkdownExport(...)`

现象：

- tool_use / tool_result 被配对分组
- thinking 默认折叠
- 导出时会跳过部分内容

判断：

- 这些可以作为 UI 策略存在
- 但不能作为记忆抽取真相定义
- 不能把 UI 里看不到，误判成底层不存在

### 3.4 `identity_thread_24h` 只保留摘要

文件：

- `server/libs/identityThreadHelper.ts`

现象：

- 共享线程不是全文，只保留渠道-时间-序号-意图/结果摘要

判断：

- 这是广播板式设计，本身没错
- 错在下游若把它当全文
- 正确口径：它是交接棒，不是全文仓库

## 4. 当前最值得先修的顺序

1. `coworkRunner` 的高危压缩边界
2. `HttpSessionExecutor` 的 loop 触发边界
3. `CoworkSessionDetail` 的 display/truth 边界
4. 记忆抽取是否严格基于原始消息，而不是基于折叠后的展示文本

## 5. 当前结论

如果只问一句：

`为什么会越来越像 RPA？`

答案是：

- 轻执行器默认 single-shot
- 旧兼容壳仍保留截断与复用消息逻辑
- 展示层做了大量折叠和过滤
- 摘要层本就不是全文

这些叠在一起，就会让人感觉：

- agent 不再“活着说话”
- 而是在“跑流程然后吐一个结果”

所以后续修缮重点不是“重写架构”，而是把这些压缩边界一层层松开，同时保住已有稳定链路。
