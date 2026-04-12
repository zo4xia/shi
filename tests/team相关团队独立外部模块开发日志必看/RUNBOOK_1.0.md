# RUNBOOK 1.0

## 环境

- Node.js: `>=20 <25`
- 推荐版本：`.nvmrc` 当前为 `24`，但标准部署兼容 Node `20 / 22 / 24`
- 首次运行先复制 `.env.example -> .env`
- 生产自动化部署优先使用 `deploy/linux/uclaw.env.example`

## 自动化部署基线

- Root Directory: `delivery-mainline-1.0-clean`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`
- `/health` 当前只代表进程存活，不代表模型配置就绪；仓库暂未提供 `/readyz`
- 生产模式下由同一个 Node 服务同时提供 API、WebSocket 和静态前端
- Linux 无人值守部署必须在启动前提供模型配置，不要把“首启后再去 UI 填写”当成自动化基线
- 标准部署包管理器是 `npm`
- 传统 Linux 托管模板见 `deploy/linux/uclaw.service`

## 为什么 `npm start` 要这样配

- 默认启动脚本带 `--no-open`，避免 headless 环境尝试拉起浏览器直接报错
- 默认启动脚本带 `--host 0.0.0.0`，避免只绑定本机回环地址导致平台探活失败
- 默认端口仍是 `3001`，平台如果注入 `PORT` 会优先使用平台端口

## 开发

```bash
npm ci
npm run dev:web
```

默认会启动：

- backend: `http://127.0.0.1:3001` 起自动避让
- frontend: `http://127.0.0.1:5176` 起自动避让

## 生产

```bash
npm run build
npm run start
```

本地手动验证生产包：

```bash
npm run start:local
```

## 最小环境变量

```dotenv
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-domain.example.com
UCLAW_API_BASE_URL=
UCLAW_API_KEY=
UCLAW_DEFAULT_MODEL=
```

说明：

- API 三件套只可在人工值守首启时通过 UI 补录；Linux 自动化/systemd/CI 部署时应在启动前注入
- 保留旧变量别名兼容：`LOBSTERAI_*`

推荐生产模板：

```dotenv
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-domain.example.com
UCLAW_DATA_PATH=.uclaw
UCLAW_API_BASE_URL=https://api.openai.com/v1
UCLAW_API_KEY=your_api_key
UCLAW_DEFAULT_MODEL=gpt-5.4
```

变量解释：

- `NODE_ENV`：生产环境写 `production`
- `PORT`：平台通常会覆盖注入，不需要改成别的固定值
- `CORS_ORIGIN`：标准生产部署必须写明确外部访问源，不能写 `*`
- 如果是同域单体部署，也写最终对外 URL，例如 `https://your-app.onrender.com`
- 如果是反向代理/端口映射部署，就写用户实际访问到的公开入口，不要写容器内回环地址
- `UCLAW_DATA_PATH`：推荐写 `.uclaw`；不要写到项目根目录外
- `UCLAW_API_BASE_URL`：模型 API 根地址
- `UCLAW_API_KEY`：模型 API 密钥
- `UCLAW_DEFAULT_MODEL`：默认模型名

一般不要手填：

- `UCLAW_APP_ROOT`
- `UCLAW_WORKSPACE`

因为服务启动时会自动推断项目根目录；只有非常规启动方式才需要覆盖。

## 数据目录规则

- 默认数据目录：`./.uclaw/web`
- 可通过 `UCLAW_DATA_PATH` 或 `--data-dir` 指定
- 该路径必须在项目根目录内部；如果指到项目外部，运行时会自动忽略并回退默认目录
- 自动化部署若需要持久化，请把磁盘挂载到项目目录里，再把 `UCLAW_DATA_PATH` 设成该挂载目录
- Render 如果继续使用本地 SQLite，请把持久化目录挂到项目根内，例如 `/opt/render/project/src/.uclaw`

示例：

```dotenv
UCLAW_DATA_PATH=.uclaw
```

或：

```dotenv
UCLAW_DATA_PATH=/opt/render/project/src/.uclaw
```

## 传统 Linux 基线

```bash
npm ci
npm run build
npm run deploy:check
npm start
```

- `systemd` 模板：`deploy/linux/uclaw.service`
- env 模板：`deploy/linux/uclaw.env.example`
- 详细声明：`docs/DEPLOYMENT_STANDARD_LINUX.md`

## 常见部署检查项

- `npm run build` 后必须存在 `server/dist/server/src/cli.js`
- 生产环境不需要执行 `npm run dev:web`
- 健康检查请打到 `/health`，不要打首页
- 如果平台要求监听公网，必须使用 `npm start` 或等效的 `--host 0.0.0.0`
- 如果探活失败，先检查平台是否真的把 `PORT` 注入到 Node 进程
- 如果数据没有落盘，先检查 `UCLAW_DATA_PATH` 是否被设到了项目目录之外

## 飞书一期

最少检查：

- `UCLAW_FEISHU_APP_ID`
- `UCLAW_FEISHU_APP_SECRET`
- `UCLAW_FEISHU_AGENT_ROLE_KEY`

## 文档解析

- PDF / Word / 常见文本附件读取走系统底层解析链
- 不需要单独安装 `pdf` / `word` skill
- 当前支持：`pdf / doc / docx / txt / md / csv / json / xml / html / xlsx(基础)`

## 纯净包刷新

```bash
npm run package:web-clean
```
