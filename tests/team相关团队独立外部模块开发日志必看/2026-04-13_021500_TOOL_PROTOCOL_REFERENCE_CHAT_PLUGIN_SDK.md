# 2026-04-13 chat-plugin-sdk 作为 tool protocol 参考的相关性记录

参考路径：

- `F:\code\chat-plugin-sdk-master`

## 结论先行

这份 SDK **有参考价值**，但它的价值主要在：

- 协议边界怎么声明
- 网关层怎么隔离
- 参数 schema 怎么固定
- settings / manifest / request payload 怎么分层

它 **不是** 我们当前 executor tool loop 的直接实现参考，不能把它当成“原生工具调用兼容层”的现成答案。

## 与我们当前问题的关联点

### 1. 它强调“先定协议骨架，再做调用”

参考：

- `docs/guides/communication-mechanisms.md`
- `docs/guides/plugin-invoke.md`
- `src/types/manifest.ts`

里面的核心思路是：

- 调用载荷有明确结构
- 网关统一接住请求
- 参数先按 schema 校验
- settings 单独走 header
- manifest / identifier / apiName / params 各自有稳定位置

这个思路和我们现在的问题是相关的：

- 我们当前最容易坏的地方，不是“没有工具”，而是“协议层太散、兼容层太松、不同入口各说各话”。
- 所以它能提醒我们把 `tool intent`、`tool params`、`runtime capability truth`、`fallback text protocol` 分层做硬。

### 2. 它明确提到从 `function_call` 向 `tool_calls` 的兼容适配

参考：

- `docs/guides/plugin-invoke.md`

原文要点：

- OpenAI 新实现从 `function_call` 更新为 `tool_calls`
- LobeChat 已做兼容适配

这和我们现在的问题是相关的，因为我们也在处理：

- OpenAI `tool_calls`
- legacy `function_call`
- Anthropic 风格工具块
- provider-native invoke markup

所以这份 SDK 可以作为“兼容适配必须被当成一层正式协议工程”的旁证。

### 3. 它的 gateway 思路值得借

参考：

- `docs/guides/server-gateway.md`
- `docs/guides/communication-mechanisms.md`

可借的不是它的代码形态，而是这个原则：

- 模型侧只负责产生调用意图
- 网关/中间层负责校验、转发、聚合、错误包装
- 插件服务端只负责真实业务

这对我们当前 house 的启发是：

- `Room`
- `HttpSessionExecutor`
- provider-specific tool compatibility handling

不应该混成一层。

## 不能硬套的地方

### 1. 它处理的是 plugin/function contract，不是 agent 内部 bounded tool loop

这份 SDK 假设：

- 宿主已经完成意图识别
- 插件/函数是 manifest 驱动的明确 API
- gateway 负责转发

而我们当前更痛的地方是：

- 多 provider 原生工具格式不统一
- tool completion 可能半成功半失败
- 有的 provider 会吐 `<invoke>` 但实际上没执行成功
- 小 agent / Room / 主执行器 还存在入口分叉

所以如果把这份 SDK 当成“可以直接拿来解决我们当前 executor 兼容墙”的证据，那就不严谨。

### 2. 它没有直接覆盖我们这种 provider-native syntax wall

我当前看到它强调的是：

- manifest
- function/tool contract
- gateway forwarding
- OpenAPI / settings / postMessage

没看到它直接处理我们这类问题：

- `<invoke>`
- `<minimax:tool_call>`
- responses 风格混杂输出
- executor 识别到了 syntax trace，但实际没有 tool completion

因此它更适合作为“协议工程参考”，不适合作为“当前兼容层实现证明”。

## 对 review 严谨性的要求

如果后面在 review 或设计说明里引用这份 SDK，表述应当是：

### 严谨表述

- 它可以作为 **tool protocol / gateway layering / schema contract** 的参考。
- 它说明了把函数调用视为正式协议层，而不是临时字符串拼接，是合理方向。
- 它能支持我们继续强化 `textual_tool_protocol`、tool payload contract、gateway-style separation。

### 不严谨表述

- “这个 SDK 证明我们当前 executor 这样做就是对的”
- “这个 SDK 里已经有我们需要的多 provider native tool compat 方案”
- “可以直接照它改，就能解决 MiniMax / invoke markup / small agent tool wall”

这些说法都跳步了。

## 对当前 house 的具体可借点

后面如果要继续收紧 house 的 tool use 体系，可以借它的三条：

1. 固定 request payload 合同
   - tool name
   - tool params
   - source role / identity
   - runtime capability truth snapshot
   - fallback reason

2. 固定 settings / secrets 分层
   - settings 不混在自然语言里
   - secrets 不混在普通 config 里
   - 运行时通过明确入口注入

3. 固定 gateway / executor / business handler 分层
   - executor 负责识别和调度
   - compat layer 负责多 provider 适配
   - 真实 tool handler 负责执行

## 当前判断

这份 SDK 与我们当前问题 **有中度相关性**。

相关在“协议骨架与分层原则”。

不直接相关在“我们当前这条多 provider executor tool loop 的具体兼容墙实现”。
