# AGENTS.md — UCLAW v0.3.0 架构真相源

> 最后更新: 2026-03-27 | 本文件负责项目架构宪法与边界定义；项目总入口看 `docs/DOCS_INDEX.md`，快速上手看 `docs/UCLAW_GUIDE_HANDBOOK_2026-03-27.md`。
>
> **增量批注（2026-03-26）**：当前分支已将 `DingTalk` 调整为**软性收束**：保留 `/api/im/dingtalk` 兼容入口，但不再进入 live 执行链，只返回明确禁用响应。本文中仍出现的钉钉描述，除非另有说明，均视为历史背景、兼容性记录或软性收束说明，不再代表当前活链。

## 边界告示

> 身份重地，严禁越线。
>
> - `agentRoleKey` 是唯一身份真理。
> - `modelId` 只是可变运行配置，不是身份，不是隔离键。
> - `all` 只是展示聚合，不是存储桶，不是归属判断。
> - 记忆、24h线程、skills、MCP、定时任务上下文，只能按 `agentRoleKey` 隔离。
> - 谁把 `modelId` 当身份，谁就在制造串脑和技术债。

## 项目定位

UCLAW 是一个 AI 多身份协作助手，核心理念：**身份=员工；模型只是该员工当前使用的运行配置**。
用户不关心频道（飞书/钉钉/Web），关心的是跟「这个员工」的对话是连续的。

## 家风入口

- 文档总索引：`docs/DOCS_INDEX.md`
- 项目手册：`docs/UCLAW_GUIDE_HANDBOOK_2026-03-27.md`
- 快速导航：`docs/PROJECT_QUICK_GUIDE_2026-03-27.md`
- 深度施工图：`docs/PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
- 标准 Linux 部署：`docs/DEPLOYMENT_STANDARD_LINUX.md`
- 运行手册：`docs/RUNBOOK_1.0.md`
- 运行时能力暴露遵守“轻装上阵 / 渐进式披露”：
  - 默认只带最小必要身份、会话锚点、最小连续性、核心内置能力
  - Skills / MCP / 长说明 / 历史全文按需展开，不默认整包注入 prompt
  - 已安装 ≠ 已绑定 ≠ 当前可调用
  - PDF / Word / 常见附件解析属于系统底层通用能力，不依赖单独 skill；不要因为 `SKILLs/` 里没有同名目录就误判为“不支持文档”

## 核心设计原理

### 身份连续性（最核心创新）

```
原来:  用户 → 飞书会话A → 同一员工换了模型A (被误当成不同人)
       用户 → 钉钉会话B → 同一员工换了模型B (被误切裂)  ← 割裂！

现在:  用户 → 飞书/钉钉/Web → writer(可随时换模型) → 24h共享线程 → 连续记忆
```

- 4 个角色身份 = 4 个员工，每人独立记忆
- 不管从哪个频道对话，同一身份的上下文共享
- 24h 热缓存 JSON（`identity_thread_24h` 表），以时间轴排序

### 身份边界铁律

这条是硬规则，任何人不得偏离：

- `agentRoleKey` 是唯一身份边界。
- `modelId` 不是身份，只是运行时配置，可随时更换。
- `all` 只是前端展示聚合，不是存储桶，不是归属判定。
- 记忆、24h 连续性、会话搜索、skills 视图、MCP 视图、定时任务上下文，都只能按 `agentRoleKey` 隔离。
- 任何地方如果把 `modelId` 当成“是不是同一个员工”的判断依据，都是越界。

### 4 个角色身份 (`src/shared/agentRoleConfig.ts`)

| 角色 Key | 名称 | 职能 | 图片能力 |
|----------|------|------|----------|
| `organizer` | 信息整理助手 | 信息整理、搜索、工具使用、资料归档 | ✗ |
| `writer` | 文字撰写员 | 文稿撰写、整理、润色 | ✗ |
| `designer` | 美术编辑师 | 图片、海报、视觉表达 | ✓ |
| `analyst` | 数据分析师 | 结构化分析、对比、推演 | ✗ |

每个身份可独立配置 `apiUrl`、`apiKey`、`modelId`、`apiFormat`(openai/anthropic)。
这里的 `modelId` 是“该身份当前开的车”，不是“这个身份是谁”。

### 公司层 / 员工层隔离原则

一句话：

`同公司，共底座；不同员工，不共脑。`

- 公司层 = 共享基础设施：
  - 模型接入
  - 数据库
  - 调度框架
  - 技能仓库
  - MCP 桥
  - 日志
  - 运行环境 / 硬件资源
- 员工层 = 每个角色独立：
  - `agentRoleKey`
  - 会话
  - 记忆
  - 定时任务
  - skills 视图
  - MCP 视图
  - 工作目标
- 任务层 = 任务只归属某个员工，不属于全公司默认广播

硬约束：

- 可以共享底座，不可以共享当前上下文。
- 可以共享能力仓库，不可以默认共享任务内容。
- 可以共享调度器，不可以把别的角色定时任务塞进当前聊天 prompt。
- 当前聊天只看当前角色自己的上下文、记忆、技能、MCP 视图。
- 定时任务只在触发时装配所属角色的执行上下文。
- 如果当前聊天角色与某个定时任务无关，则该任务不得进入当前对话上下文。
- 默认不因后台存在其他角色定时任务而预热当前聊天角色。

调度口径：

- `scheduler` 可以是公司级公共设施。
- 执行时必须按 `ScheduledTask.agentRoleKey` 隔离装配角色上下文。
- 聊天域与调度域分离；除非用户显式查看任务状态，否则不把任务信息注入聊天链路。
- 低配机优先遵守：`非必要不加载，必要但非马上用的异步懒加载，必要加载务必指向清晰。`

### 密钥与运行时配置铁律

这条同样是硬规则，后续所有底层框架能力、渠道桥、系统级插件都必须遵守：

- 默认安装流不得把用户推进“大量手填 `.env`”模式。
- 环境变量只作为部署兜底、CI 注入或显式覆盖入口，不作为日常安装主存储。
- 系统级基础能力的密钥与凭证，统一走系统运行时 secret 存储，不进入普通配置 JSON，不进入前端 localStorage，不进入聊天记录。
- 角色专属能力的密钥，按角色写入对应运行时目录，不得和系统级密钥混放。
- 插件/渠道自己的运行状态、游标、缓存、bot 信息，必须写入自己的 runtime 子目录，不得散落到项目根和公共配置桶。
- 源码目录下的 `SKILLs/` 是能力定义与模板仓，不是运行时密钥仓；密钥只能写入项目运行目录。
- 日志、报错、导出包默认脱敏，禁止打印 token、secret、aes key、完整下载链接。

推荐收口口径：

- 系统级共享密钥：`<projectRoot>/.uclaw/web/shared-skill-secrets/<capability>.json`
- 角色级密钥：`<projectRoot>/.uclaw/web/roles/<agentRoleKey>/skill-secrets/<skillId>.json`
- 渠道/桥运行时：`<projectRoot>/.uclaw/web/channels/<channelId>/`

安装与读取优先级：

1. 先读项目运行时 secret/store
2. 缺失时走扫码、OAuth、测试连接、引导安装等自动补齐
3. 仅在显式部署场景下再读 env override
4. 除非用户明确要求，安装流程不要求其手填底层 env 名称

微信、飞书、后续任何新桥都按同一原则处理：

- 渠道是渠道，身份是身份，密钥存储边界不能混。
- `channel -> agentRoleKey` 只保存绑定关系，不把渠道凭证塞进身份配置。

### 三层记忆体系

| 层级 | 存储 | 生命周期 | 状态 |
|------|------|----------|------|
| **24h 热缓存** | SQLite `identity_thread_24h` | 24小时滚动 | ✅ 已实现 |
| **短期记忆** | SQLite `user_memories` | 事件驱动 | ✅ 已实现 |
| **长期记忆** | 项目内运行目录/数据库 | 永久 | ⚠️ 部分实现 |

#### 24h 热缓存流程
- 查找键：`agentRoleKey` — 频道无关，`modelId` 只是运行时配置，不是连续性边界
- 每条消息带 `channelHint`、`timestamp`
- live 口径：`desktop | feishu | dingtalk | external`
- Web 当前落库口径是 `desktop`，不是 `web`
- 写入时先去噪，只保留轻量交接摘要，不写完整聊天正文
- 读取时按“渠道-时间-意图/结果”生成结构化交接线，总摘要不超过 300 字
- 这层等于 24h 热缓存画板；每日抽取成功落到 `user_memories` 后，按角色清空热缓存
- 过期自动清理
- 现役主链：`server/libs/sessionTurnFinalizer.ts` + `server/libs/identityThreadHelper.ts`
- `CoworkRunner.saveToSharedThread()` 属于旧口径，不再作为一期 Web / Feishu 轻链主写入路径
- Web / 飞书 / 钉钉最终都汇入同一条 helper 写入链，但入口执行器已分化

### 文档处理口径

- PDF / Word / 常见文本附件解析走后端底层文件解析链，不走单独 skill 二次包装。
- 当前主实现：`server/libs/fileParser.ts`
- 已支持：`pdf / doc / docx / txt / md / csv / json / xml / html / xlsx(基础)`
- `SKILLs/` 目录负责可选工作流能力，不是真正的“系统基础能力全集”。
- 因此：
  - `skills.config.json` 里没有 `pdf` / `word` 不等于系统不支持
  - agent 不应把“缺少同名 skill”解释成“无法读取文档”

#### 长期记忆（每日抽取）
- 现役主链：`server/libs/dailyMemoryPipeline.ts`
- 手动入口：`POST /api/memory/daily-extract`
- 自动入口：服务端内建 23:00 slot，由 scheduler 触发后直走 `dailyMemoryPipeline`
- 当前不通过 `CoworkRunner` 会话执行记忆整理
- 记忆与运行数据统一收口到 `<projectRoot>/.uclaw/web`
- 不再把当前活链默认写到用户家目录

## Build & Development

```bash
# 开发（Vite dev server + 后端热重载，推荐）
npm run dev:web         # = concurrently server:dev + web:dev

# 仅前端开发
npm run dev             # Vite on :5176

# 仅后端开发
npm run server:dev      # tsx watch on :3001

# 构建
npm run build           # web + server
npm run build:web       # Vite → server/public/
npm run build:server    # tsc → server/dist/

# 启动生产
npm start               # = node server/dist/server/src/cli.js --no-open --host 0.0.0.0

# 测试
npm run test:all
npm run lint
```

**环境要求**: Node.js >= 20 < 25（推荐 `.nvmrc` 当前固定的 24，但标准部署兼容 20 / 22 / 24）

## 架构总览

```
┌────────────────────────────────────────────┐
│               Web UI (React 18)            │
│         src/renderer/ → Vite :5176         │
│   electronShim.ts 模拟 window.electron     │
└────────────┬──────────────┬────────────────┘
             │ HTTP /api    │ WebSocket /ws
┌────────────▼──────────────▼────────────────┐
│           Express Server :3001             │
│         server/src/index.ts                │
├────────────────────────────────────────────┤
│  18 路由模块 (server/routes/)              │
│  HttpSessionExecutor (一期主执行器，默认轻链 + 受控bounded loop兼容层) │
│  CoworkRunner (遗留兼容壳，非一期主路)      │
│  SQLite (sql.js) → 项目内 .uclaw/web       │
│  IM Webhooks (飞书/钉钉)                    │
└────────────────────────────────────────────┘
```

### 关键目录

```
server/
├── src/index.ts             # Express 主入口 (531行)
├── routes/
│   ├── cowork.ts            # Web 对话入口，现役走 HttpSessionExecutor
│   ├── memory.ts            # 身份记忆 API
│   ├── feishuWebhook.ts     # 飞书 IM webhook（一期主线）
│   ├── dingtalkWebhook.ts   # 钉钉 IM webhook（一期冻结旧链）
│   ├── files.ts             # 文件浏览器
│   ├── skills.ts            # 技能管理
│   ├── store.ts             # KV 配置
│   ├── mcp.ts               # MCP 服务器管理
│   └── scheduledTasks.ts    # 定时任务
├── libs/
│   ├── httpSessionExecutor.ts   # Web / Feishu / 一期定时任务轻执行器（默认轻链，必要时 bounded loop）
│   ├── sessionTurnFinalizer.ts  # 共享线程写入与对话备份收尾
│   └── identityThreadHelper.ts  # 24h线程读写工具
├── shims/electron.ts        # Electron API 兼容层
└── sqliteStore.web.ts       # SQLite schema + CRUD

src/main/
├── libs/
│   ├── coworkRunner.ts      # Claude Agent SDK 遗留重执行器（非一期主路）
│   ├── scheduler.ts         # 定时任务调度器（当前已桥接轻执行器）
│   └── claudeSdk.ts         # SDK 加载工具
├── memory/
│   ├── dailyMemoryManager.ts     # 每日记忆 (.md)
│   └── identityMemoryManager.ts  # 身份记忆 (.md)
├── coworkStore.ts           # 会话/消息 CRUD
└── sqliteStore.ts           # SQLite 底层

src/renderer/                # React 前端 (唯一入口)
├── App.tsx                  # 主应用 (760行, 6个视图)
├── main.tsx                 # 入口
├── bootstrap.ts             # initElectronShim
├── store/slices/            # Redux 7个slice
├── services/
│   ├── electronShim.ts      # HTTP/WS 模拟层 (784行)
│   ├── apiClient.ts         # HTTP 客户端
│   └── webSocketClient.ts   # WS 客户端
└── components/
    ├── cowork/              # 对话 UI
    ├── artifacts/           # 富内容渲染
    └── Settings.tsx         # 设置面板 (~2100行)

src/shared/                  # 前后端共享
├── agentRoleConfig.ts       # 4身份配置
├── dataConsistency.ts       # 数据一致性检查
└── conversationFileCacheConfig.ts  # 文件缓存配置

SKILLs/                      # 技能插件
├── skills.config.json
├── docx/ xlsx/ pptx/        # Office 文件生成
├── web-search/              # 网页搜索
└── ...
```

### 数据存储

**SQLite** (`<projectRoot>/.uclaw/web/uclaw.sqlite`):

| 表 | 用途 |
|----|------|
| `kv` | 应用配置 (KV store) |
| `cowork_sessions` | 会话记录 |
| `cowork_messages` | 对话消息 |
| `user_memories` | 短期记忆 (confidence/status/explicit) |
| `identity_thread_24h` | 24h 跨频道共享线程 |
| `scheduled_tasks` | 定时任务 |
| `mcp_servers` | MCP 服务器配置 |

**运行时文件系统** (`<projectRoot>/.uclaw/web/`):

| 路径 | 用途 |
|------|------|
| `logs/` | 运行日志 |
| `SKILLs/` | 运行时技能总仓库 |
| `roles/{role}/skills.json` | 角色可见技能索引 |
| `roles/{role}/skill-configs/` | 角色普通技能配置 |
| `roles/{role}/skill-secrets/` | 角色敏感技能配置 |

### 入口链路

```
index.html
  → src/renderer/main.tsx
    → bootstrap.ts (initElectronShim)
      → App.tsx (React root)
        → Redux Provider + Router
```

Vite 配置: `vite.config.web.ts`，路径别名 `@` 从 `tsconfig.json` 的 `paths` 自动读取（via `vite-tsconfig-paths`）。

### 数据流

1. **初始化**: Web UI → `initElectronShim()` → WS 连接 → HTTP 拉取数据
2. **Web 对话**: 用户输入 → `POST /api/cowork/sessions/:id/start|continue` → `HttpSessionExecutor` → `SessionTurnFinalizer` → WS 推送 → Redux 更新
3. **IM 频道**: 飞书消息 → 角色映射 / 会话绑定 → `runChannelFastTurn(...)` → 回复 → 写入 24h 线程；钉钉当前仍属冻结旧链
4. **工具审批**: 一期 Web 轻链已移除旧审批桥接；若仍出现 `/api/cowork/permissions/:requestId/respond`，视为残链报警，不是正常主流程
5. **记忆写入**: 对话结束 → `coworkMemoryExtractor` → `user_memories` 表 + 文件系统

### 设置面板

- **工作目录**: `workspacePath` (只读展示)
- **文件缓存目录**: `conversationFileCache.directory` (用户可配置本地路径)
- **自动备份**: `conversationFileCache.autoBackupDaily`
- **记忆配置**: `memoryEnabled`, `memoryGuardLevel` (strict/standard/relaxed), `memoryImplicitUpdateEnabled`

## WebSocket Events

| 事件 | 方向 | 用途 |
|------|------|------|
| `cowork:message` | Server→Client | 新消息 |
| `cowork:messageUpdate` | Server→Client | 流式更新 |
| `cowork:permission` | Server→Client | 权限请求 |
| `cowork:complete` | Server→Client | 会话完成 |
| `cowork:error` | Server→Client | 错误 |
| `file:changed` | Server→Client | 文件变更 |
| `skills:changed` | Server→Client | 技能变更 |

## 实际进度（2026-03-15）

### ✅ 已完成

| 功能 | 说明 |
|------|------|
| 4 身份模型系统 | agentRoleConfig 完整，支持独立配置 |
| 24h 共享线程 | SQLite 表 + `SessionTurnFinalizer` + Helper 库 |
| 钉钉→24h线程 | 用户/AI消息双写 identity_thread ✅ |
| 飞书→24h线程 | 用户/AI消息双写 identity_thread ✅ (刚修复) |
| Web 对话主流程 | Session CRUD + 流式推送 + Redux |
| user_memories CRUD | 完整的短期记忆读写API + 可配限额 |
| 身份记忆文件 | .md 文件读写 + 解析器 |
| 每日记忆文件 | .md 文件模板 + 写入 |
| 定时任务调度器 | cron/interval/at 三种模式 + 容错 |
| 设置面板 | 4身份配置、文件缓存路径、记忆开关 |
| 技能系统 | skills.config.json + 动态加载 |
| 文件浏览器 | 目录树 + 文件读取 + 下载 |
| 富内容渲染 | Markdown/Mermaid/KaTeX/SVG/代码高亮/React |
| Electron→Web 迁移 | electronShim 完成，无 Electron 依赖 |
| 沙箱功能移除 | 所有 throw 已改为安全 `{ok:false}` 返回 |

### ⚠️ 部分完成

| 功能 | 缺失 | 影响 |
|------|------|------|
| Web 端共享线程可观测 | 还没有独立调试/查看页 | 主链已写入，但排查仍偏工程向 |
| 每日记忆抽取 | 已有手动接口 + 服务端 23:00 slot | 主路已自动化，但仍有配置口径待收敛 |
| 两套记忆系统未打通 | dailyMemory 和 identityMemory 独立 | 记忆分散 |
| Settings.tsx 过大 | ~2100行未拆分组件 | 可维护性差 |

### ❌ 未实现

| 功能 | 说明 |
|------|------|
| Web 前端展示 24h 线程 | 无 UI 查看共享上下文 |
| daily memory 稳定标识 | 当前仍靠任务名识别内建 daily memory 任务 |
| 长期记忆前缀规范 | 未实现「谁-时间-日志」格式 |

## 关键技术依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `@anthropic-ai/claude-agent-sdk` | 0.2.12 | AI 引擎 |
| `react` / `react-dom` | ^18.2.0 | 前端框架 |
| `@reduxjs/toolkit` | ^2.2.1 | 状态管理 |
| `express` | ^4.21.0 | HTTP 服务 |
| `ws` | ^8.14.2 | WebSocket |
| `sql.js` | ^1.13.0 | SQLite (WASM) |
| `vite` | ^5.1.4 | 构建工具 |
| `tailwindcss` | ^3.4.1 | CSS 框架 |

## 编码规范

- TypeScript, 函数式 React 组件, Hooks
- 2 空格缩进, 单引号, 分号
- `PascalCase` 组件名, `camelCase` 函数/变量
- Tailwind CSS 工具类优先
- 代码必须打标签: `{标记}` / `{ROUTE}` / `{API}` / `{FLOW}` / `{BREAKPOINT}` / `{PROGRESS}`

## 宪法规则（强制执行）

> 所有项目代码，执行时必须进行打标签。没写等于没做，没更新反馈进度等于无用功。

> 这台机器上的工程判断，首先服从主线目标和主人的内在判断，不服从没骨气的妥协。
> 以我们自己为主，向内聚焦，不为外部样板、历史包袱、伪兼容、低价值挡路物让位。
> 挡住主线、拖慢生存闭环、稀释原则的设计，应被切开、替换或移除，而不是被习惯性迁就。

### 必须标签

| 标签 | 场景 |
|------|------|
| `{ROUTE}` | 路由定义、挂载点、入口路径 |
| `{API}` | 前后端接口、参数、响应 |
| `{BREAKPOINT}` | 断线点、不一致、潜在故障 |
| `{FLOW}` | 业务流步骤、触发条件 |
| `{PROGRESS}` | 改动进度、已完成项、待办 |

### 主人原则

- 以我们自己为主，不围着外部项目、历史残片、既有妥协转。
- 聚内，不妥协。先保主线、生存闭环、连续性，再谈兼容和扩展。
- 不给没骨气的方案找台阶。路径不合适就切，设计挡道就换。
- 系统是工具，不是主人的上级；架构必须服从业务目标。
- 所有优化都要回答一句：它是否真的服务主线，还是只是在延续旧包袱。

### 美学原则

- 大道至简。
- 代码美学不是表面漂亮，而是内在的圆融贯通。
- 极简不是删空一切，而是用更少的结构承住更多真实场景。
- 通达万象，不靠堆砌，不靠绕路，不靠缝补式妥协。
- 好设计应当让主线自然流动，让规则统一，让复杂度退后，而不是靠更多层补丁维持表面可用。

## 测试

```bash
npm run test:all          # 全部测试
npm run test:server       # 仅服务端
npm run test:server:api   # API 测试
npm run test:server:ws    # WebSocket 测试
npm run lint              # ESLint
```

手动验证: `npm run dev:web` 启动后测试对话流程。

## 提交规范

```
feat: add file browser component
fix: correct identity thread column index
refactor: remove sandbox stubs
chore: clean stale docs
docs: update AGENTS.md progress
```
