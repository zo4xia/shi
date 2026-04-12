# UCLAW 指南手册（2026-03-27）

> 给后来的人，也给后来的 agent。  
> 这份手册只做一件事：**把项目的线头、边界、命令、部署和排障一次说清。**

---

## 1. 先记住这几条

- 不要把 `modelId` 当身份，身份唯一键是 `agentRoleKey`
- 不要先改代码再找主链，必须先找入口、服务层、路由层、落盘点
- 不要把 `server/public` / `server/dist` 当源码维护
- 不要把当前仓库当成 Vercel 全功能运行时项目
- 不要让运行目录飘出项目根

---

## 2. 项目到底是什么

### 2.1 技术栈

- 前端：React 18 + Vite + Redux Toolkit + Tailwind
- 后端：Express + WebSocket(`ws`)
- 数据：`sql.js` 落盘 SQLite 文件
- 语言：TypeScript

### 2.2 当前现役能力

- Web 多角色协作对话
- 飞书消息接入
- 定时任务
- Skills / MCP 管理
- 24h 连续线程与用户记忆
- 每日记忆抽取
- 常见文档解析

### 2.3 当前边界

- 现役主线：`Web / Feishu / Scheduler / 记忆链`
- 软性收束：`DingTalk`
- 实验线：`Room`

---

## 3. 先看哪几个文件

第一次接手，先按这个顺序：

1. `docs/AGENTS.md`
2. `docs/UCLAW_GUIDE_HANDBOOK_2026-03-27.md`
3. `docs/PROJECT_QUICK_GUIDE_2026-03-27.md`
4. `docs/PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
5. `src/renderer/App.tsx`
6. `src/renderer/services/cowork.ts`
7. `src/renderer/services/electronShim.ts`
8. `server/src/index.ts`
9. `server/routes/cowork.ts`
10. `server/sqliteStore.web.ts`

---

## 4. 源码目录怎么认

```text
src/
├─ renderer/      前端页面、组件、services、store
├─ main/          历史核心能力层
└─ shared/        前后端共享常量、路径、角色定义

server/
├─ src/           Express 入口
├─ routes/        API 路由
├─ libs/          执行器、飞书、记忆、文件解析
├─ websocket.ts   WS 总线
└─ sqliteStore.web.ts

clean-room/spine/modules/
└─ 一期轻链主干编排层

deploy/linux/
└─ Linux 部署模板

scripts/
└─ 构建、预检、打包、烟测
```

---

## 5. 前端线头

### 5.1 总入口

- `src/renderer/App.tsx`

### 5.2 页面层

- `src/renderer/components/*`

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

### 5.3 服务层

- `src/renderer/services/cowork.ts`
- `src/renderer/services/scheduledTask.ts`
- `src/renderer/services/skill.ts`
- `src/renderer/services/mcp.ts`
- `src/renderer/services/im.ts`

### 5.4 兼容桥

- `src/renderer/services/electronShim.ts`
- `src/renderer/services/webApiContract.ts`
- `src/renderer/services/webSocketClient.ts`

---

## 6. 后端线头

### 6.1 总入口

- `server/src/index.ts`

### 6.2 关键路由

- `server/routes/cowork.ts`
- `server/routes/scheduledTasks.ts`
- `server/routes/skills.ts`
- `server/routes/mcp.ts`
- `server/routes/store.ts`
- `server/routes/feishuWebhook.ts`
- `server/routes/dingtalkWebhook.ts`

### 6.3 当前 Web 对话主链

```text
App / CoworkView
-> coworkService
-> electronShim / contract
-> /api/cowork
-> orchestrateWebTurn
-> HttpSessionExecutor
-> coworkStore / sqlite
-> websocket 回推前端
```

---

## 7. 数据与运行目录

### 7.1 数据库

- 文件：`server/sqliteStore.web.ts`
- 数据库文件：`uclaw.sqlite`
- 默认落盘：`./.uclaw/web/uclaw.sqlite`

### 7.2 路径规则

- 文件：`src/shared/runtimeDataPaths.ts`
- 原则：运行目录必须在项目根内部

### 7.3 最重要的表

- `kv`
- `cowork_sessions`
- `cowork_messages`
- `user_memories`
- `identity_thread_24h`
- `scheduled_tasks`
- `scheduled_task_runs`
- `mcp_servers`
- `skill_role_configs`

---

## 8. 部署指南

### 8.1 推荐平台

1. 传统 Linux 主机 / VM
2. Render Web Service
3. Zeabur Node 服务模式

### 8.2 不推荐

- Vercel 全功能运行时

### 8.3 构建产物

- 前端：`server/public`
- 后端：`server/dist`

### 8.4 标准环境变量

```dotenv
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-domain.example.com
UCLAW_DATA_PATH=.uclaw
UCLAW_API_BASE_URL=
UCLAW_API_KEY=
UCLAW_DEFAULT_MODEL=
```

### 8.5 Linux 目录结构

```text
/opt/uclaw
/etc/uclaw/uclaw.env
/etc/systemd/system/uclaw.service
/opt/uclaw/.uclaw
```

模板文件：

- `deploy/linux/uclaw.env.example`
- `deploy/linux/uclaw.service`
- `docs/DEPLOYMENT_STANDARD_LINUX.md`

---

## 9. 基础指令

### 开发

```bash
npm ci
npm run dev:web
```

### 构建

```bash
npm run build
```

### 启动生产

```bash
npm start
```

### 本地回环启动

```bash
npm run start:local
```

### 部署预检

```bash
npm run deploy:check
```

### 质量检查

```bash
npm run lint
npm run test:all
```

### 交付包

```bash
npm run package:web-clean
npm run package:delivery:linux
```

---

## 10. 常见问题

### 10.1 为什么部署总翻车

通常是四个钉子没钉住：

1. 前端源码/产物没分清
2. 启动命令错了
3. Node / npm 版本口径乱了
4. 运行目录飘了

### 10.2 真正的固定答案

- 前端源码：`src/renderer`
- 前端产物：`server/public`
- 后端入口：`server/src/index.ts`
- 启动命令：`node server/dist/server/src/cli.js --no-open --host 0.0.0.0`
- Node 口径：`>=20 <25`
- 运行目录：`<projectRoot>/.uclaw/web`

### 10.3 当前最值得警惕的风险

- `src/renderer/components/FeedbackButton.tsx` 里有前端硬编码 webhook
- `Settings.tsx` 职责过重
- `Room` 容易被误当主链

---

## 11. 相关文档

- `docs/PROJECT_QUICK_GUIDE_2026-03-27.md`
- `docs/PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
- `docs/PAGE_SERVICE_ROUTE_MAP_2026-03-27.md`
- `docs/DB_API_TRUNK_WALK_2026-03-27.md`
- `docs/DEPLOYMENT_STANDARD_LINUX.md`
