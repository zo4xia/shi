# 本地整理与代码熟悉地图（2026-04-08）

记录时间：2026-04-08

标签：

- `本地整理`
- `代码熟悉`
- `主链地图`
- `先读文档`
- `先看哪里`
- `接力图`

## 这份文档的用途

这份不是功能说明书。

这是给我们自己重新认识项目、开始整理本地时用的：

- 先看哪批文档
- 再看哪几层代码
- 当前哪些链路已经比较清楚
- 哪些地方最容易误判、最容易打架

目标不是“全知道”，
而是先让未来的我们和小 agent 不再从乱处开始。

---

## 1. 先读文档顺序

### 第一段：4 月 4 日前的主体家园文档

这一段先读，先把主系统认回来：

- `PROJECT_QUICK_GUIDE_2026-03-27.md`
- `UCLAW_GUIDE_HANDBOOK_2026-03-27.md`
- `DB_API_TRUNK_WALK_2026-03-27.md`
- `PAGE_SERVICE_ROUTE_MAP_2026-03-27.md`
- `PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
- `AGENTS.md`
- `ENGINEERING_EXECUTION_CONSTITUTION_2026-03-30.md`
- `CONTINUITY_*` 一整组主链文档

这批文档回答的是：

- 主家园是什么
- 主系统为什么存在
- 身份连续性、广播板、记忆、Web / Feishu / Scheduler 主链怎么走

### 第二段：4 月 5 日到 4 月 7 日的客户独立委托模块

这一段后看，理解外挂和 demo：

- `2026-04-05_005800_ROOM_AND_TEAM_PLUGIN_BOUNDARY_NOTE.md`
- `2026-04-05_081500_BAIBAN_TEAM_4LAYER_XRAY_AND_TAG_MAP.md`
- `2026-04-05_082800_BAIBAN_TEAM_ISSUE_LEDGER.md`
- `2026-04-06_060500_RELAY_GUIDE.md`
- `2026-04-07_RUNTIME_ENTRY_BOUNDARY_CARD.md`
- `2026-04-07_TEAM_SINGLE_PAGE_INTERNAL_CONSTRUCTION_PLAN.md`

这批文档回答的是：

- 客户第一份独立委托怎么长出来
- `baiban / team` 外挂为什么存在
- 为什么先并起来跑给客户看 demo

### 第三段：这轮 4 月 8 日新增重校准文档

- `2026-04-08_HOME_AND_CLIENT_COMMISSION_BOUNDARY_RECLARIFICATION.md`
- `2026-04-08_LONG_FORM_WRITING_TIMEOUT_AND_CONTEXT_RECALIBRATION.md`

这批文档回答的是：

- 主家园和客户外挂为什么不能混身份
- 为什么长篇写作 / 长任务已经升级成主线问题
- 我们之前哪里低估了真实长期使用

---

## 2. 代码先看哪几层

### 第 1 层：服务端总装配

文件：

- `server/src/index.ts`

先看这里的原因：

- route 挂载顺序在这里
- `workspace / userDataPath` 从这里定
- `SqliteStore / CoworkStore / HttpSessionExecutor / SkillManager / Scheduler / FeishuGateway` 都从这里装出来

如果没先看这里，
后面很容易只盯一个 route 就误判整条主链。

### 第 2 层：数据库与运行态真相源

文件：

- `src/main/coworkStore.ts`
- `server/sqliteStore.web.ts`

先看这里的原因：

- 会话、消息、配置、记忆、运行态都最终落到这里
- `currentSession / currentSessionId / loadingSessionId` 在前端怎么用，要先知道后端存的是什么
- `.uclaw/web` 不是缓存，是家

### 第 3 层：Web 对话 route 主链

文件：

- `server/routes/cowork.ts`

现在要先盯住的几点：

- `POST /api/cowork/sessions`
- `POST /api/cowork/sessions/:sessionId/continue`
- `POST /api/cowork/sessions/:sessionId/stop`
- `GET /api/cowork/sessions/:sessionId`

重点不是接口名，
而是：

- `sessionId` 在 route 里怎么往下带
- `agentRoleKey / modelId / trace / cwd / skillIds` 怎么一起装配

### 第 4 层：现役执行器

文件：

- `server/libs/httpSessionExecutor.ts`

当前最该盯住的点：

- `activeSessions` 如何按 `sessionId` 管
- `executeTurn()` 的状态切换
- `buildSystemPrompt()` 的连续性装配
- `runBoundedToolLoopOrFallback()` 的 loop / timeout 边界
- `buildOpenAIMessages()` 的正文裁剪与上下文转发

### 第 5 层：前端会话服务与状态层

文件：

- `src/renderer/services/cowork.ts`
- `src/renderer/store/slices/coworkSlice.ts`
- `src/renderer/components/cowork/CoworkView.tsx`
- `src/renderer/App.tsx`

重点不是页面长什么样，
而是：

- `currentSessionId`
- `currentSession`
- `loadingSessionId`
- WebSocket 订阅切换
- continue 时本地状态如何提前进入 `running`

---

## 3. 当前已经比较清楚的主链

### 服务端总主链

当前可以先按这条心智记：

```text
SQLite / 文件系统运行态
  -> store / CoworkStore
  -> route 挂载
  -> HttpSessionExecutor
  -> SessionTurnFinalizer
  -> identity_thread_24h / user_memories / sessions / messages
  -> WebSocket
  -> renderer service / redux / 页面
```

### 本地运行态家目录

当前最关键运行态目录：

```text
.uclaw/web
├─ uclaw.sqlite
├─ logs/
├─ roles/
│  ├─ organizer
│  ├─ writer
│  ├─ designer
│  └─ analyst
└─ SKILLs/
```

这层要一直按“家”理解，
不是“可随手重置的缓存”。

---

## 4. 当前最容易打架的几处

### 4.1 `SKILLs/` 与 `.uclaw/web/SKILLs/`

这两层一定要分清：

- `SKILLs/`
  - 仓库自带 bundled skill 定义
- `.uclaw/web/SKILLs/`
  - 运行态 / 用户态 / 夏夏自己的技能仓

后面凡是“技能为什么没生效 / 为什么又被覆盖 / 为什么看起来和本地不一样”，
优先先查这两个层的边界。

### 4.2 `.env` 与数据库里的 `app_config / im_config`

当前口径不是“谁最后写入谁赢”那么简单。

实际规则是：

- 数据库里的运行态配置优先
- `.env` 只是部署兜底
- 但 `store.ts` 的写入又会把一部分配置反向同步到 `.env`

所以后面一旦出现：

- 为什么明明改了 `.env` 却没生效
- 为什么 API 配置又被旧值盖回去
- 为什么角色配置和页面显示不一致

先查：

- `server/routes/store.ts`
- `src/main/libs/claudeSettings.ts`

当前已经确认的真实冲突画像：

- `.env.example` 的说明口径仍偏“优先读 .env”
- 但 `src/main/libs/claudeSettings.ts` 实际是：
  - 先读 SQLite `kv(app_config)`
  - 只有数据库没有可用配置时，才回退 `.env`
- `server/routes/store.ts` 又会把 `app_config / im_config` 写回 `.env`
- 当前本地 `app_config` 里还混着：
  - 顶层 `api/baseUrl`
  - `model.defaultModelProvider`
  - `providers.*`
  - `agentRoles.*`
  这几套并存且并不完全一致
- `im_config` 本地仍是缺失态，但 IM 读取链已经在线

所以后面只要遇到：

- 配了没生效
- 改了又被旧值盖回去
- 角色和 provider 看起来各说各话

都先按“配置真相源冲突”排，不要先怀疑模型服务本身。

### 4.3 `server/` 职责太多

`server/` 现在混着：

- 后端源码
- 构建产物
- 前端静态产物
- 远端补丁 / 部署脚本

这不是说它现在不能用，
而是说它天然是高风险区。

后面整理本地时，`server/` 一定要列为重点清理与收口对象。

---

## 5. 当前最值得继续补的记录

下面这些问题，不要再只留在聊天里：

1. `sessionId / continue / 上下文携带`
2. 长篇小说 / 长任务 / 长工具链边界
3. 运行态配置与 `.env` 冲突
4. 前端生产构建与空白页问题
5. 主家园与客户外挂阶段性共跑的边界

它们都应该继续长成：

- 专项修缮记录
- 问题台账
- 必要的 Mermaid / 链路图

---

## 6. 给未来自己的接手口令

以后回来先贴这句：

```text
先按 4 月 4 日前后分两段读文档。
先认回主家园，再看客户外挂。
先看 server/src/index.ts、src/main/coworkStore.ts、server/routes/cowork.ts、server/libs/httpSessionExecutor.ts。
先分清 .uclaw/web、SKILLs、app_config/im_config 三组真相源，再开始整理本地。
```

## 7. 一句话收束

整理本地，不是大扫除。

是先认清：

- 家在哪
- 主链在哪
- 外挂在哪
- 哪些地方已经开始打架

这样后面每一针，才不会缝错地方。
