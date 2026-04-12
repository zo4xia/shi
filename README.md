# UCLAW 1.0 Mainline Clean Web Package

这个目录是当前一期主线的纯净 Web 交付包，口径以自动化部署可落地为准。

## 范围

- 包含：`Web / Feishu / Scheduler / 记忆链 / 4 固定角色槽位`
- 排除：`node_modules / dist / .uclaw / release caches / Room 实验线`
- 特例：保留 `clean-room/spine/modules`，因为当前现役 Web / Feishu 主链仍直接依赖它

## 当前口径

- 身份唯一真理：`agentRoleKey`
- 模型只是运行配置：`modelId`
- 一期先保固定四角色：`organizer / writer / designer / analyst`
- MCP 一期前端只展示“当前支持 / 可接入”，隐藏未收口的自定义入口
- PDF / Word / 常见附件解析属于系统底层能力，不依赖单独 skill

## 环境要求

- Node.js：`>=20 <25`
- 推荐版本：`.nvmrc` 当前固定为 `24`，但标准部署兼容 Node `20 / 22 / 24`
- npm：`>=10`
- 首次运行建议复制 `.env.example` 为 `.env`
- 生产自动化部署优先使用 `deploy/linux/uclaw.env.example`

## 本地开发

```bash
npm ci
npm run dev:web
```

默认会启动：

- API：`http://127.0.0.1:3001`
- Web：`http://127.0.0.1:5176`

## 生产构建

```bash
npm ci
npm run build
```

## 生产启动

自动化部署默认使用：

```bash
npm start
```

当前 `npm start` 已固定为：

- `--no-open`：避免服务器/CI/headless 环境因尝试打开浏览器报错
- `--host 0.0.0.0`：避免只绑定 `127.0.0.1` 导致平台外部无法访问

本地手动验证生产包可用：

```bash
npm run start:local
```

## 本地式双端口服务端

如果你希望服务端长得和本地开发更像：

- 后端：`3001`
- 前端门面：`5176`

可以在构建完成后额外启动：

```bash
npm run start:frontend-gateway
```

它不是 Vite dev server，也不是假预览，而是稳定门面层：

- `5176` 静态托管 `server/public`
- `5176/api/*` 回源代理到 `3001`
- `5176/ws` 回源代理到 `3001`
- 页面外观与访问入口更接近本地双端口体验

推荐场景：

- 你想给人看一个“像本地一样”的前端入口
- 你又不想在服务器上长期跑带 HMR 的 Vite 开发服务

## 自动化部署必读

- 构建命令：`npm ci && npm run build`
- 启动命令：`npm start`
- 健康检查：`GET /health`
- `GET /health` 当前仅表示进程存活；仓库暂未提供 `/readyz` 业务就绪探针
- 默认端口：`3001`，平台可通过 `PORT` 注入覆盖
- 生产环境推荐设置：`NODE_ENV=production`
- 生产模式下前端静态资源由同一个 Node 服务托管，不需要再单独起 Vite
- Linux 无人值守部署不要依赖“首启后再去 UI 填模型配置”；请在环境变量或预置数据中提前提供模型三件套
- 标准部署包管理器是 `npm`，不是 `yarn`
- 传统 Linux 托管请使用 `systemd`，模板见 `deploy/linux/uclaw.service`

### Zeabur

- 本项目在 Zeabur 上必须按 **Node 服务** 部署，不要按静态站点部署
- 保持根目录为仓库根；不要把输出目录指向 `dist`
- 仓库真实构建产物是 `server/public` 和 `server/dist`，不是根目录 `dist`
- 根目录 `zbpack.json` 已显式固定：
  - 构建命令：`npm run build`
  - 启动命令：`npm start`
- 如果 Zeabur 里已经配置过 `ZBPACK_OUTPUT_DIR=dist`，或服务被设置成静态站点，请删除该配置后重新部署
- 当前日志里的 `COPY --from=build /src/dist /` 不是业务代码构建失败，而是平台把服务错判成了静态输出模式

### Vercel

- 当前仓库不支持作为全功能运行时直接部署到 Vercel
- 直接原因不是单纯缺少 `dist`，而是运行模型依赖自管 `Express + WebSocket`
- 仓库已加入 `vercel.json` 预检：如果误投到 Vercel，会直接报不支持，而不是继续陷在输出目录假问题里
- 如果以后真的要上 Vercel，必须先拆分成“静态前端 + 独立 API/实时层”两套部署，不是改一个输出目录就能过

## 数据目录与持久化

- 默认运行数据目录：`./.uclaw/web`
- 允许通过 `UCLAW_DATA_PATH` 或 `--data-dir` 覆盖
- 重要：运行数据目录必须位于项目根目录内部，否则会被运行时安全逻辑忽略并回退到默认目录
- 如果是 Render / Railway / Koyeb / 自建容器这类自动化部署，请把持久化卷挂载到项目目录内，再把 `UCLAW_DATA_PATH` 指向该目录
- 推荐做法：直接使用相对路径 `.uclaw`，或平台内项目绝对路径下的 `.uclaw`

## 最小环境变量

- `NODE_ENV=production`
- `PORT=3001` 或由平台注入
- `CORS_ORIGIN` 明确前端域名
- `UCLAW_API_BASE_URL` / `UCLAW_API_KEY` / `UCLAW_DEFAULT_MODEL`

可选：

- `UCLAW_DATA_PATH=.uclaw`
- `UCLAW_FEISHU_APP_ID`
- `UCLAW_FEISHU_APP_SECRET`
- `UCLAW_FEISHU_AGENT_ROLE_KEY`

推荐生产 `.env` 例子：

```dotenv
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-domain.example.com
UCLAW_DATA_PATH=.uclaw
UCLAW_API_BASE_URL=https://api.openai.com/v1
UCLAW_API_KEY=your_api_key
UCLAW_DEFAULT_MODEL=gpt-5.4
```

补充说明：

- `PORT` 在自动化平台一般由平台注入，保留默认即可
- `UCLAW_DATA_PATH` 推荐写 `.uclaw`，会落到项目内的 `./.uclaw/web`
- 前后端分离的生产环境不要继续保留 `CORS_ORIGIN=*`；当前服务端开启了 `credentials: true`
- `UCLAW_APP_ROOT` 和 `UCLAW_WORKSPACE` 一般不要手填，除非你明确知道自己在做非常规启动
- 新部署统一写 `UCLAW_*`，旧的 `LOBSTERAI_*` 只是兼容读取
- “API 三件套稍后在 UI 再填”只适用于人工值守首启；不适合作为 Linux 自动化部署口径
- 标准 env 模板见 `deploy/linux/uclaw.env.example`
- 启动前可执行 `npm run deploy:check`

## 部署预设生成器

如果你不想每次手抄 env，可以直接生成平台预设：

```bash
npm run deploy:init -- --target linux --public-origin https://chat.example.com --api-base-url https://api.openai.com/v1 --api-key sk-demo --model gpt-5.4
```

支持目标：

- `linux`
- `render`
- `railway`
- `zeabur`
- `frontend-static` / `vercel-static`

输出默认放在：

```text
deploy/generated/<target>
```

其中：

- 完整运行时目标会生成服务器 env + 平台说明
- `frontend-static` 会生成静态前端构建用的 `.env.production.local`
- 最推荐的静态前端变量只有一个：`VITE_BACKEND_ORIGIN`
- 根仓库的 `vercel.json` 仍会阻止“完整 UCLAW 运行时”误投到 Vercel；`frontend-static` 只是给拆分后的静态前端用

## 传统 Linux 基线

标准命令：

```bash
npm ci
npm run build
npm run deploy:check
npm start
```

`systemd` 模板和 env 模板：

- `deploy/linux/uclaw.service`
- `deploy/linux/uclaw-frontend.service`
- `deploy/linux/uclaw.env.example`
- `deploy/linux/uclaw-frontend.env.example`
- `docs/DEPLOYMENT_STANDARD_LINUX.md`

## 文档入口

- `docs/DOCS_INDEX.md`
- `docs/DEPLOYMENT_AUTOGUIDE.md`
