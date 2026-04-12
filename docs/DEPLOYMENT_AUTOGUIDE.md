# UCLAW Deployment Autoguide

## 目标

把“部署说明”从纯文字手册收口成可执行预设，减少三类重复踩坑：

- 手抄环境变量时漏填 / 填错
- 把完整运行时误投到不支持的平台
- 前后端拆分时忘了把静态前端指向真正后端

## 入口

```bash
npm run deploy:init -- --target linux --public-origin https://chat.example.com --api-base-url https://api.openai.com/v1 --api-key sk-demo --model gpt-5.4
```

或：

```bash
npm run deploy:init -- --target vercel-static --backend-origin https://api.example.com
```

默认输出目录：

```text
deploy/generated/<target>
```

## 支持目标

- `linux`
  传统 Linux / 云主机 / systemd 完整运行时
- `render`
  Render Web Service 完整运行时
- `railway`
  Railway 完整运行时
- `zeabur`
  Zeabur Node Service 完整运行时
- `frontend-static`
  静态前端壳，适用于 Vercel / Netlify / Cloudflare Pages

## 生成内容

### 完整运行时目标

会生成：

- `uclaw.env` 或 `.env.production`
- `DEPLOYMENT.md`
- `preset-summary.json`

### 静态前端目标

会生成：

- `.env.production.local`
- `DEPLOYMENT.md`
- `preset-summary.json`

## 核心口径

- 完整运行时仍优先 Linux / Render / Railway / Zeabur
- 仓库根 `vercel.json` 继续阻止“完整 UCLAW 运行时”误投到 Vercel
- 如果只是静态前端壳，使用 `frontend-static` 目标，后端单独部署
- 前端最推荐只填 `VITE_BACKEND_ORIGIN`
- `VITE_PUBLIC_API_BASE` / `VITE_PUBLIC_WS_URL` 只在 API 或 WS 路径非标准时再单独覆盖

## 构建期注入

`index.html` 已加入以下部署期入口：

- `uclaw-backend-origin`
- `uclaw-api-base`
- `uclaw-ws-url`
- `uclaw-settings-access-password`

它们会由 Vite 的 `VITE_*` 构建变量写入 HTML，静态部署时不再只能靠运行后手改。

## 推荐流程

### 单体完整运行时

1. 运行 `npm run deploy:init -- --target linux|render|railway|zeabur ...`
2. 把生成的 env 填到平台
3. 执行 `npm ci`
4. 执行 `npm run build`
5. 执行 `npm run deploy:check`
6. 启动 `npm start`

### 静态前端 + 独立后端

1. 先把后端部署到 Render / Railway / Zeabur / Linux
2. 记下最终后端公网域名
3. 运行 `npm run deploy:init -- --target frontend-static --backend-origin https://api.example.com`
4. 用生成的 `.env.production.local` 进行前端构建
5. 再把静态产物投到 Vercel / Netlify / Cloudflare Pages

## 仍然刻意不做的事

- 不伪装成“仓库根可以直接完整部署到 Vercel”
- 不把外部数据目录放到项目根之外
- 不把 UI 手填配置当成无人值守部署基线
