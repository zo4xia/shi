# 2026-04-12 Web 执行器默认工具回环恢复

记录时间：2026-04-12

标签：

- `continuity`
- `tool-loop`
- `web-executor`
- `single-shot`
- `广播板`

---

## 1. 这次为什么要记

这是一次现役源码里的真实分叉修复，不是口头理解问题。

用户反馈的现象是：

- 对话像一问一答
- 工具一调用就断
- loop 没交给 agent 自己决定

沿现役源码回看后，确认到的真实点是：

```text
web 本地执行器默认分支还在大量落到 single-shot，
远程执行器已经更接近“默认交给 agent 决定是否进入工具回环”。
```

---

## 2. 真实代码分叉点

文件：

- `server/libs/httpSessionExecutor.ts`
- `server/remote_httpSessionExecutor.ts`

现役 `runOpenAIStream()` 本地链里有明确注释：

- 这里只发一次 openai-compatible chat completion
- 不做 assistant -> tool -> assistant 多轮代理循环

这本身不是 bug。

真正的问题在入口分发：

- `executeTurn()` 调的是 `shouldPreferBoundedToolLoop(...)`
- 但本地 `httpSessionExecutor.ts` 里这层判断还主要受窄启发式控制
- 结果是大量普通回合明明已经有工具面，还是先被压进 single-shot

而远程执行器已经不是这个口径：

- 只要 `buildExecutorTools(session, prompt).length > 0`
- 就优先进 bounded loop

所以当时的真实分叉不是“系统没有工具回环”，而是：

```text
remote 比 local 更像现在想要的主线，
local 还卡在旧 gating 上。
```

---

## 3. 这次最小修复

已改：

- `server/libs/httpSessionExecutor.ts`

调整：

- `shouldPreferBoundedToolLoop(...)` 现在先看：
  - `buildExecutorTools(session, prompt).length > 0`
  - `mergedSkillIds.length > 0`
  - `runtimeMcpToolCount > 0`
- 命中后直接优先进 bounded loop
- 只有这些都没有时，才退回旧的 `needsBoundedToolLoop(...)` 启发式

这次没有做的事：

- 没改 bounded loop 本体
- 没改 tool fallback 兼容逻辑
- 没改前端消息分组
- 没重做 memory / broadcast board 结构

所以这是一刀最小入口修复，不是大翻修。

---

## 4. 这次修复的真实意义

它修的不是“多一个工具”。

它修的是：

```text
不要先替 agent 缩成单轮，
只要当前轮确实有工具面，就先把决定权交给 agent。
```

这和 4 月 11 日白天缓存里已经被反复确认的广播板 / 连续性口径是一致的：

- 不要先捂住
- loop 交给 agent
- 成本控制交给缓存命中和三层记忆

---

## 5. 后续还要继续查的点

这次只确认并修了“默认是否进工具回环”的入口分叉。

后续仍要继续查：

1. 某些 provider/model 是否仍会频繁打进 `toolCompatibilityFallback`
2. fallback 后前端是否还会表现成“像断了”
3. `CoworkSessionDetail.tsx` 有没有把某些 tool turn / system stage 看起来压扁
4. stop / abort / sessionsChanged 的时序有没有让用户误以为“工具一调就结束”

### 5.1 MiniMax 额外注意

这条必须单独记：

```text
某些模型，尤其 MiniMax，
会优先吐自己家的 tool use 语法，
这不等于现役 executor 已经真实完成了一次工具调用。
```

当前现役代码里已经有一部分兼容处理：

- `server/libs/toolRuntimeCompat.ts`
- `server/libs/httpSessionExecutor.ts`

已知现象：

- 可能出现 `<invoke ...>` 或 `<minimax:tool_call ...>` 这类标记
- 它们有时只是 provider 自带工具协议痕迹
- 不能直接把它误判成：
  - executor 真调到了工具
  - 工具权限没问题
  - tool loop 已经正常闭环

后续排查时要分清三层：

1. provider 自带的工具语法痕迹
2. executor 真实发出的 `tool_use`
3. executor 真实回写的 `tool_result`

只有第 2、3 层都在当前会话消息链里真实落地，
才算“这轮工具真的跑通了”。

### 5.2 兼容墙处理原则

如果当前 provider/model 撞上原生工具兼容墙：

- 不能静默断掉
- 不能只在日志里知道
- 不能让 agent 继续误以为“再撞一次也许就行”

应该同时满足：

1. 会话里可见地打一条兼容提示
2. 明确告诉 agent：这是兼容墙，不是工具消失
3. 自动换到 `textual_tool_protocol` 继续
4. 不把整轮运行直接打死

当前 2026-04-12 的补充处理已经把这条收进：

- `server/libs/httpSessionExecutor.ts`
- `server/remote_httpSessionExecutor.ts`

### 5.3 当前还没做到的事

这里要写死，避免未来自欺：

```text
当前仓里还没有真正的 textual_tool_protocol 自动续跑引擎。
```

现状是：

- 兼容墙命中后
- 会先打一条 `pre_tool` 提示
- 再带着更硬的 fallback prompt
- 重新跑一轮普通 completion

所以当前真实能力是：

- 能明示兼容墙
- 能换轨
- 能尽量逼模型在同一回复里继续任务
- 如果第一轮 fallback 仍然只像兼容提示，
  会在同一 turn 内再强制续一轮，
  不让它只剩一句“不能用工具”就立刻收尾

但还不是：

- executor 自己接管一条新的多轮 textual tool loop
- 或者在后台自动续跑多个子回合

这条必须记住。
后面如果用户还觉得“像停了”，
不要先说他看错了，
而要承认：

- 现在只是换轨继续回复
- 还不是完整自动续跑

---

## 6. 一句话收束

```text
这次不是新发明了 agentic loop，
而是把 web 本地链落后的入口 gating，
重新拉回到“默认先让 agent 决定”的现役主线上。
```
