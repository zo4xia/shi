# 连续性主链实勘说明（数据库字段 + 路由 + 参数 + 清理）

这份说明只记录当前仓库已经真实落地的链路，不写想象中的设计。

目标：

- 说清楚字段为什么存在
- 说清楚参数从哪里来、往哪里去
- 说清楚先读什么、后读什么
- 说清楚缓存和广播板什么时候清
- 说清楚“日记/每日记忆”到底是怎么写的

## 1. 主表与字段边界

### 1.1 `user_memories`

定义位置：

- `server/sqliteStore.web.ts`

当前字段：

- `id`: 长期记忆主键
- `text`: 记忆正文
- `fingerprint`: 去重指纹
- `confidence`: 置信度
- `is_explicit`: 是否为显式记忆
- `status`: `created | stale | deleted`
- `agent_role_key`: 身份桶，当前真实过滤边界
- `model_id`: 保留为元信息，不再作为身份隔离键
- `created_at`
- `updated_at`
- `last_used_at`

真实作用：

- 它是长期记忆层，不是 24 小时接力层。
- 当前列表、统计、创建、更新、删除都已经按 `agent_role_key` 归桶。
- `model_id` 仍在表里，是兼容字段和元信息，不是“你是谁”的边界。

### 1.2 `user_memory_sources`

定义位置：

- `server/sqliteStore.web.ts`

当前字段：

- `memory_id`
- `session_id`
- `message_id`
- `role`
- `is_active`
- `created_at`
- `agent_role_key`
- `model_id`

真实作用：

- 这是长期记忆来源回链，不是连续性主读取入口。
- 删除长期记忆时，会把对应 source 标成非活跃。

### 1.3 `identity_thread_24h`

定义位置：

- `server/sqliteStore.web.ts`

当前字段：

- `id`
- `agent_role_key`
- `model_id`
- `created_at`
- `updated_at`
- `expires_at`
- `context`
- `last_message_id`
- `channel_hint`
- `message_count`
- `UNIQUE(agent_role_key)`

真实作用：

- 这是 24 小时广播板，不是全文仓库。
- 当前唯一身份边界是 `agent_role_key`。
- `model_id` 在这张表里也只剩兼容用途，真实写入时是空串。
- `context` 里存的是压缩后的接力条目数组，不是完整原文。
- 每条接力条目真实形状是：
  - `role`
  - `content`
  - `channel_hint`
  - `timestamp`
  - `channel_seq`

### 1.4 `turn_cache`

定义位置：

- `server/libs/turnCache.ts`

当前字段：

- `request_hash`
- `schema_version`
- `agent_role_key`
- `base_url`
- `model`
- `assistant_text`
- `created_at`
- `expires_at`
- `last_used_at`
- `hit_count`

真实作用：

- 这是请求级回复缓存，不是身份记忆。
- TTL 现在是 `30 分钟`。
- 当前没有单独“手动清空 turn_cache”的 HTTP 路由。
- 它只会在读写时顺手清理过期项。

## 2. 参数为什么存在，真实往哪里走

### 2.1 `agentRoleKey`

真实作用：

- 这是当前连续性系统的身份主键。
- 会进入：
  - `user_memories.agent_role_key`
  - `identity_thread_24h.agent_role_key`
  - `turn_cache.agent_role_key`
- 读取长期记忆、读取广播板、缓存命中，都是先按它归桶。

### 2.2 `modelId`

真实作用：

- 现在主要是模型配置或兼容信息。
- 会保留在 `user_memories.model_id`。
- `identity_thread_24h` 虽然还有这个字段，但主链已经不拿它做隔离。
- 每日记忆抽取里，`modelId` 是“调用摘要模型”的参数，不是“扫描身份”的参数。

### 2.3 `channel_hint`

真实作用：

- 标记广播板条目来自哪个渠道。
- 当前会从 session 的 `sourceType / systemPrompt / title` 推断。
- 用于生成“飞书-时间-序号-摘要”这类接力锚点。

### 2.4 `channel_seq`

真实作用：

- 每个渠道内的对话序号。
- user / assistant 同轮尽量共用同一个序号，方便跨渠道接力时定位。

### 2.5 `expires_at`

真实作用：

- `identity_thread_24h`: 24 小时广播板过期时间
- `turn_cache`: 请求缓存过期时间

## 3. 底层主链，从数据库往上推

### 3.1 回合结束时，什么会写进广播板

真实入口：

- `server/libs/sessionTurnFinalizer.ts`

真实规则：

- 每轮结束，系统会把本轮新增 `user / assistant` 正文写进 `identity_thread_24h`
- 不写：
  - `thinking`
  - `system`
  - `tool`
- 这里是兜底补写，不是唯一写入入口

额外入口：

- `server/libs/httpSessionExecutor.ts`
- 工具：`broadcast_board_write`

真实规则：

- agent 在回合中可以主动调用 `broadcast_board_write`
- 它会直接写入 `identity_thread_24h`
- 这是主动接力，不必等回合结束

### 3.2 广播板里实际存的不是全文

真实实现：

- `server/libs/identityThreadHelper.ts`

真实规则：

- 写入前会走 `normalizeSharedThreadSummary(...)`
- 会裁掉低信号、寒暄、重复、水词
- 会保留：
  - 用户要求
  - 决策
  - 结果
  - 坑点
  - 修复
  - 下一棒
- 最终广播板是“摘要锚点阵列”，不是全文记录

### 3.3 运行时先读什么

真实实现：

- `server/libs/continuityBootstrap.ts`
- `server/libs/httpSessionExecutor.ts`

真实顺序：

1. `resolveContinuityBootstrap(...)` 先读 `identity_thread_24h`
2. 如果广播板为空，再回退读取 `user_memories`
3. 如果是从长期记忆回补，会调用 `seedIdentityThreadBootstrap(...)` 把回补摘要重新写回广播板
4. 构造上游请求时，只额外转发最近 `3` 条原始正文消息

也就是说，当前真实链路不是“直接灌全量历史”，而是：

1. 广播板摘要
2. 长期记忆兜底回补
3. 最近 3 条原始正文
4. 需要精确时再回原对话

## 4. 路由真实暴露了什么

### 4.1 长期记忆路由

文件：

- `server/routes/cowork.ts`

当前接口：

- `GET /api/cowork/memory/entries`
- `POST /api/cowork/memory/entries`
- `PUT /api/cowork/memory/entries/:id`
- `DELETE /api/cowork/memory/entries/:id`
- `GET /api/cowork/memory/stats`

真实边界：

- 这些都是 `user_memories` 的 CRUD / stats
- 已支持 `agentRoleKey` 过滤

### 4.2 广播板观察接口

文件：

- `server/routes/cowork.ts`

当前接口：

- `GET /api/cowork/memory/broadcast-boards`

真实边界：

- 这是 `identity_thread_24h` 的只读观察窗
- 用来“看见每个身份最近 24h 接力板”
- 不是编辑接口

### 4.3 手动每日记忆抽取

文件：

- `server/routes/dailyMemory.ts`

当前接口：

- `POST /api/memory/daily-extract`

真实边界：

- 直接走 `dailyMemoryPipeline`
- 不经过 `CoworkRunner.startSession`

## 5. 缓存和广播板什么时候清

### 5.1 `turn_cache`

真实实现：

- `server/libs/turnCache.ts`

清理规则：

- 只在 `getTurnCacheEntry(...)` / `putTurnCacheEntry(...)` 时顺手清过期项
- 命中时会更新：
  - `last_used_at`
  - `hit_count`
- 过期即删
- 当前没有专门 HTTP 清空接口

### 5.2 `identity_thread_24h`

真实实现：

- `server/libs/identityThreadHelper.ts`
- `SKILLs/daily-memory-extraction/dailyMemoryExtraction.ts`

清理规则：

- 平时靠 `expires_at` 24 小时自然过期
- 每日记忆抽取开始前，会先跑一次 `cleanupExpiredIdentityThreads(...)`
- 对某个身份的热缓存，只会在“成功写入长期记忆”后才调用 `clearIdentityThreadForRole(...)`

这条非常关键：

- 如果当天没提炼出新的长期记忆，就不清广播板
- 目的是保留补跑机会，不把接力棒提前丢掉

## 6. “日记 / 每日记忆”到底怎么写

真实实现：

- `SKILLs/daily-memory-extraction/dailyMemoryExtraction.ts`

抽取流程：

1. 扫描 `identity_thread_24h` 里所有未过期身份
2. 逐身份读取广播板消息
3. 调 LLM 提炼
4. 写入长期记忆
5. 只有写成功才清 24h 广播板

当前提炼输出结构：

- `userInfo`
- `projectContext`
- `decisions`
- `notes`

当前“日记条目”优先规则：

- 如果内容涉及：
  - 跨天查询
  - 周报汇总
  - 文件整理
  - 科研 / 工作主题
- 会优先要求摘要模型写成可回查、可搜索的 `notes`

所以现在的“写日记”不是单独一张 `diary` 表，而是：

- 用 `decisions + notes + projectContext` 这套结构化长期记忆去承接

## 7. 当前真实结论

### 7.1 没有消失的部分

- 广播板主链还在
- 长期记忆主链还在
- 每日抽取主链还在
- 启动补跑和 23:00 定时也还在

### 7.2 还容易把人带偏的旧口径

- 把 `identity_thread_24h` 叫成“conversation cache”
- 把 `modelId` 写成身份扫描键
- 把广播板误说成全文
- 把缓存清理说成“有显式清空接口”

这些都和当前真实代码不一致。

### 7.3 现在必须守住的运行边界

1. 身份边界是 `agentRoleKey`，不是 `modelId`
2. 广播板是接力板，不是全文仓库
3. 先看广播板，再看最近 3 条正文，再决定是否翻长历史
4. 降本靠缓存命中、摘要复用、广播板共享、按需加载，不靠“捂嘴”
5. 24h 广播板只有在成功沉淀进长期记忆后才应该清
