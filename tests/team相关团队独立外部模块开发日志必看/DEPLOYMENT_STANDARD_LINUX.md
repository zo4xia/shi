# Standard Linux Deployment

## Standard

- Package manager: `npm`
- Install command: `npm ci`
- Build command: `npm run build`
- Preflight command: `npm run deploy:check`
- Start command: `npm start`
- Optional frontend gateway: `npm run start:frontend-gateway`
- Process manager: `systemd`

## Zeabur

- Deploy this repo as a `Node.js` service, not a static site
- Keep the service root at the repository root
- Use build command `npm run build`
- Use start command `npm start`
- Do not set `ZBPACK_OUTPUT_DIR`
- Do not configure static output directory `dist`
- Real build outputs are `server/public` and `server/dist`

If your Zeabur log shows `COPY --from=build /src/dist /`, the platform is looking for a static-site output folder that this repository does not produce

## Render

- Deploy this repo as a `Web Service`, not a static site
- Use build command `npm run build`
- Use start command `npm start`
- Health check path: `/health`
- If you continue using local SQLite, keep the service at a single instance
- If you use a persistent disk for `.uclaw`, mount it inside the project root and keep `UCLAW_DATA_PATH` inside project root, for example:
  - `UCLAW_DATA_PATH=/opt/render/project/src/.uclaw`
- Do not mount data to a path outside project root and then point `UCLAW_DATA_PATH` there, because `deploy:check` and runtime guards will reject it

## Why not `yarn`

- Repo only ships `package-lock.json`
- Standard deployment baseline is `npm`, not `yarn`
- Log warnings like `Unknown env config` usually come from running `npm` inside `yarn`
- `glob` / `inflight` warnings in your log are transitive dev-tool warnings, not the primary deployment breaker
- Root `zbpack.json` explicitly pins Zeabur build/start commands to `npm`

## Required env

These are required for standard unattended deployment:

- `NODE_ENV=production`
- `PORT=3001` or platform-injected port
- `CORS_ORIGIN=https://your-domain.example.com` or the explicit platform public URL
- `UCLAW_DATA_PATH=.uclaw`
- `UCLAW_API_BASE_URL`
- `UCLAW_API_KEY`
- `UCLAW_DEFAULT_MODEL`

## Optional env

- Feishu:
  - `UCLAW_FEISHU_APP_ID`
  - `UCLAW_FEISHU_APP_SECRET`
  - `UCLAW_FEISHU_AGENT_ROLE_KEY`
  - `UCLAW_FEISHU_API_BASE_URL`
  - `UCLAW_FEISHU_APP_NAME`
- Daily memory:
  - `UCLAW_DAILY_MEMORY_API_BASE_URL`
  - `UCLAW_DAILY_MEMORY_API_KEY`
  - `UCLAW_DAILY_MEMORY_MODEL`
  - `UCLAW_DAILY_MEMORY_API_FORMAT`
- Skills MCP Assistant:
  - `UCLAW_SKILLS_MCP_ASSISTANT_API_URL`
  - `UCLAW_SKILLS_MCP_ASSISTANT_API_KEY`
- IMA:
  - `IMA_OPENAPI_CLIENTID`
  - `IMA_OPENAPI_APIKEY`

## Install steps

```bash
cd /opt/uclaw
npm ci
sudo mkdir -p /etc/uclaw
sudo cp deploy/linux/uclaw.env.example /etc/uclaw/uclaw.env
npm run build
npm run deploy:check
sudo cp deploy/linux/uclaw.service /etc/systemd/system/uclaw.service
sudo systemctl daemon-reload
sudo systemctl enable --now uclaw
```

## Optional “looks like local” frontend gateway

如果你要一个和本地开发更接近的双端口形态：

- `3001` = 后端真服务
- `5176` = 前端门面层

不要继续在服务器上长期跑 Vite dev。改用仓库内置前端门面：

```bash
sudo cp deploy/linux/uclaw-frontend.env.example /etc/uclaw/uclaw-frontend.env
sudo cp deploy/linux/uclaw-frontend.service /etc/systemd/system/uclaw-frontend.service
sudo systemctl daemon-reload
sudo systemctl enable --now uclaw-frontend
```

这个门面层会：

- 直接服务 `server/public`
- 把 `5176/api/*` 回源到 `3001`
- 把 `5176/ws` 回源到 `3001`
- 避免 Vite HMR 端口与 `.vite` 缓存权限噪音

## Checks

```bash
systemctl status uclaw
journalctl -u uclaw-frontend -n 200 --no-pager
journalctl -u uclaw -n 200 --no-pager
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:5176/health
```

## Notes

- `CORS_ORIGIN=*` is not accepted by `deploy:check` in standard production mode
- Single-service deployment still needs an explicit public origin; use the final external URL, not `*`
- `UCLAW_DATA_PATH` must remain inside project root
- Run `npm run build` before first start or after upgrades
