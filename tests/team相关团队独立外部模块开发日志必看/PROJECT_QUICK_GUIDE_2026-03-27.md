# UCLAW 项目说明与快速导航（2026-03-27）

> 这份文档给人和 agent 两用。  
> 目标不是讲历史，而是让接手者快速知道：**项目能做什么、源码去哪看、怎么部署、常用命令是什么。**

---

## 1. 项目能力说明

### 1.1 核心能力

- 多角色 AI 协作对话
  - 固定四角色：`organizer` / `writer` / `designer` / `analyst`
  - 身份隔离主键是 `agentRoleKey`
- Web 对话主链
  - 新建会话、续聊、停止、重命名、置顶、历史查询
- 飞书接入
  - 飞书 webhook 收消息、绑定角色、回写共享线程与记忆
- 定时任务
  - 任务创建、编辑、启停、手动运行、运行历史
- Skills / MCP 管理
  - 安装、启停、配置、角色绑定、市场/目录视图
- 记忆系统
  - 24h 身份热线程
  - 用户记忆条目与来源链
  - 每日记忆抽取
- 文档解析
  - `pdf / doc / docx / txt / md / csv / json / xml / html / xlsx(基础)`

### 1.2 当前特色

- 角色身份连续性优先，模型不是身份
- Web 与飞书共用同一套身份连续性主链
- 运行数据默认收口到项目内 `./.uclaw/web`
- 当前前端仍通过 `electronShim` 保持统一调用面，便于旧代码平滑过渡

### 1.3 当前边界

- 现役主线：`Web / Feishu / Scheduler / 记忆链`
- 软性收束：`DingTalk`
- 实验线：`Room`
- 不支持直接作为 Vercel 全功能运行时

---

## 2. 源码目录导航指引

## 2.1 先看哪几个入口

如果是第一次接手，先看这 8 个文件：

1. `docs/AGENTS.md`
2. `docs/PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
3. `src/renderer/App.tsx`
4. `src/renderer/services/cowork.ts`
5. `src/renderer/services/electronShim.ts`
6. `server/src/index.ts`
7. `server/routes/cowork.ts`
8. `server/sqliteStore.web.ts`

## 2.2 目录作用

```text
src/
├─ renderer/      前端页面、组件、service、store
├─ main/          历史核心能力层（store / skill / scheduler / cowork libs）
└─ shared/        前后端共享定义（角色、路径、env alias、运行时协议）

server/
├─ src/           Express 启动入口
├─ routes/        API 路由
├─ libs/          执行器、飞书、记忆、角色运行态、文件解析
├─ websocket.ts   WS 广播总线
└─ sqliteStore.web.ts  Web 版数据库实现

clean-room/spine/modules/
└─ 一期主链编排层（Web / Feishu 轻链）

deploy/linux/
└─ 传统 Linux 部署模板（env / systemd）

scripts/
└─ 构建、预检、交付包生成、绑定、烟测脚本
```

## 2.3 前端怎么看

- 总壳：`src/renderer/App.tsx`
- 页面：`src/renderer/components/*`
- 服务层：`src/renderer/services/*`
- 状态：`src/renderer/store/slices/*`
- 协议：`src/renderer/services/webApiContract.ts`

主页面：

- `cowork`
- `sessionHistory`
- `scheduledTasks`
- `skills`
- `mcp`
- `employeeStore`
- `resourceShare`
- `freeImageGen`
- `room`

## 2.4 后端怎么看

- 总入口：`server/src/index.ts`
- 路由挂载顺序也在这里看
- 重要 route：
  - `server/routes/cowork.ts`
  - `server/routes/scheduledTasks.ts`
  - `server/routes/skills.ts`
  - `server/routes/mcp.ts`
  - `server/routes/store.ts`
  - `server/routes/feishuWebhook.ts`
  - `server/routes/dingtalkWebhook.ts`

## 2.5 数据与运行态怎么看

- 路径规则：`src/shared/runtimeDataPaths.ts`
- 数据库 schema：`server/sqliteStore.web.ts`
- 角色配置：`src/shared/agentRoleConfig.ts`
- 角色运行态文件：`server/libs/roleSkillFiles.ts`

---

## 3. 部署指南与结构

### 3.1 推荐部署方式

优先级从高到低：

1. 传统 Linux 主机 / VM
2. Render Web Service
3. Zeabur Node 服务模式

### 3.2 不推荐方式

- Vercel 全功能运行时
  - 当前仓库需要 `Express + WebSocket + 长状态`
  - 前端产物也不在根 `dist`

### 3.3 构建产物结构

```text
server/public   # 前端构建输出
server/dist     # 后端构建输出
.uclaw/web      # 运行数据目录
```

### 3.4 标准生产环境变量

```dotenv
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-domain.example.com
UCLAW_DATA_PATH=.uclaw
UCLAW_API_BASE_URL=
UCLAW_API_KEY=
UCLAW_DEFAULT_MODEL=
```

可选：

- `UCLAW_FEISHU_APP_ID`
- `UCLAW_FEISHU_APP_SECRET`
- `UCLAW_FEISHU_AGENT_ROLE_KEY`
- `UCLAW_DAILY_MEMORY_*`
- `UCLAW_SKILLS_MCP_ASSISTANT_*`
- `IMA_OPENAPI_CLIENTID`
- `IMA_OPENAPI_APIKEY`

### 3.5 Linux 部署结构

```text
/opt/uclaw                  # 项目目录
/etc/uclaw/uclaw.env       # 生产 env
/etc/systemd/system/uclaw.service
/opt/uclaw/.uclaw          # 持久化运行数据
```

对应模板：

- `deploy/linux/uclaw.env.example`
- `deploy/linux/uclaw.service`
- `docs/DEPLOYMENT_STANDARD_LINUX.md`

---

## 4. 基础指令

### 4.1 开发

```bash
npm ci
npm run dev:web
```

默认：

- API：`http://127.0.0.1:3001`
- Web：`http://127.0.0.1:5176`

### 4.2 构建

```bash
npm run build
```

细分：

```bash
npm run build:web
npm run build:server
```

### 4.3 启动生产

```bash
npm start
```

本地仅回环：

```bash
npm run start:local
```

### 4.4 部署预检

```bash
npm run deploy:check
```

### 4.5 质量检查

```bash
npm run lint
npm run test:all
```

### 4.6 纯净交付包

```bash
npm run package:web-clean
npm run package:delivery:linux
```

---

## 5. 快速排障

### 5.1 启不来先看什么

- `server/dist/server/src/cli.js` 是否存在
- `.env` 或生产 env 是否提供 API 三件套
- `UCLAW_DATA_PATH` 是否仍在项目根内部
- `CORS_ORIGIN` 生产是否还写成 `*`

### 5.2 页面没反应看什么

- 前端入口：`src/renderer/App.tsx`
- 对话服务：`src/renderer/services/cowork.ts`
- 兼容桥：`src/renderer/services/electronShim.ts`
- WS：`src/renderer/services/webSocketClient.ts`

### 5.3 后端行为不对看什么

- 总入口：`server/src/index.ts`
- route：`server/routes/*.ts`
- 执行器：`server/libs/httpSessionExecutor.ts`
- DB：`server/sqliteStore.web.ts`

---

## 6. 相关文档入口

- 架构宪法：`docs/AGENTS.md`
- 施工图总图：`docs/PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
- 页面 → 服务 → Route：`docs/PAGE_SERVICE_ROUTE_MAP_2026-03-27.md`
- DB / API 主链：`docs/DB_API_TRUNK_WALK_2026-03-27.md`
- Linux 部署：`docs/DEPLOYMENT_STANDARD_LINUX.md`
