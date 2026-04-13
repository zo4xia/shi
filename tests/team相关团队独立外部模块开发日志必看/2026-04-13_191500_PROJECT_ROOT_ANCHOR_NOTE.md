# 2026-04-13 项目根路径锚点记录

## 核心原则

整个项目的路径系统以 **当前项目工作目录根** 为唯一锚点。

固定口径：

- `projectRoot` = 当前项目根目录
- `runtimeRoot` = `<projectRoot>/.uclaw`
- `userDataPath` = `<runtimeRoot>/web`
- 其他所有相对路径，都必须以 `projectRoot` 为参照再解析

禁止继续出现的做法：

- 直接信任 `process.cwd()` 作为项目根
- 让脚本因为启动位置不同，把文件写去别的目录
- 用用户家目录 / `HOME` 去冒充项目工作区

## 当前落地

### 服务端主钉子

- `server/src/index.ts`
- 启动时先把 `workspace` 解析成 `resolvedWorkspace`
- 然后立刻调用 `setProjectRoot(resolvedWorkspace)`

这意味着：

- `.env`
- `.uclaw`
- runtime 文件
- 角色目录
- 各种相对路径

都应该从这根钉子收敛

### 已修的高风险偏移点

- `scripts/dev-runner.mjs`
  - 不再用 `process.cwd()` 当项目根
  - 改为按脚本位置反推项目根

- `scripts/bind-ima-skill.ts`
  - 改为按脚本位置反推项目根

- `scripts/bind-blingbling-little-eye.ts`
  - 改为按脚本位置反推项目根

- `scripts/sync-app-config-env.ts`
  - SQL.js 资源路径与 `.env` 路径都回到项目根

- `scripts/smoke-cowork-session.mjs`
  - 默认 `cwd` 改为项目根

- `server/routes/app.ts`
  - `/api/app/workspace`
  - `/api/app/runtimePaths`
  - 不再回退到 `HOME`
  - 统一回到 `getProjectRoot()`

- `server/libs/playwrightRuntime.ts`
  - 不再从 `process.cwd()` 找本地 Playwright 依赖
  - 统一从 `getProjectRoot()` 找

- `SKILLs/daily-memory-extraction/fileArchiver.ts`
  - 相对文件路径改为相对 `projectRoot` 解析

## 当前状态

主链里功能性 `process.cwd()` 已清掉。

当前残留只剩：

- 注释中的说明文本

## 本轮 Review 回收结果

来自子 agent 的 3 条关键捡漏，这轮处理结果如下：

### 已修 1

- `SKILLs/daily-memory-extraction/fileArchiver.ts`
- 之前还会用 `path.resolve(process.cwd(), filePath)` 解析相对附件路径
- 现已改成相对 `getProjectRoot()` 解析

### 已修 2

- `server/libs/feishuGateway.ts`
- `server/libs/wechatbotGateway.ts`
- 之前会把 `session.cwd` 带进 `workspaceRoot`
- 现已改成只把项目根锚点作为 `workspaceRoot`
- `session.cwd` 仍可作为任务执行信息存在，但不再冒充“工作区真相”

### 已修 3

- `server/routes/room.ts`
- 之前允许请求体里的 `workspaceRoot` 或 `session.cwd` 覆盖项目根
- 现已固定为 `getProjectRoot()`

结论：

- Review 提到的 3 个高/中风险漂移口子，当前都已收口

## 已落地的唯一规则

### Rule 1

- 服务启动后，项目根只认 `setProjectRoot(resolvedWorkspace)`
- 运行时项目根真相源只认 `getProjectRoot()`

### Rule 2

- runtime 数据路径不允许各自拼
- 必须走：
  - `resolveRuntimeRoot()`
  - `resolveRuntimeUserDataPath()`

### Rule 3

- 对外回显“工作区/项目根”时，不再回退到 `HOME`
- 必须优先返回：
  - `req.app.get('workspace')`
  - 否则 `getProjectRoot()`

### Rule 4

- 脚本如果需要项目根，不允许偷吃启动目录
- 必须：
  - 通过共享 helper 取根
  - 或按脚本位置反推项目根

### Rule 5

- 相对文件路径解析必须相对 `projectRoot`
- 不允许再出现：
  - `path.resolve(process.cwd(), relativePath)`

## 残留清单

### A. 可以接受的残留

这些残留当前不破坏“唯一根锚点”，先记账，不急着动：

- 多个辅助脚本仍在用 `path.resolve(__dirname, '..')`
  - `scripts/create-standard-delivery-bundle.mjs`
  - `scripts/preflight-deploy.mjs`
  - `scripts/refresh-clean-web-package.mjs`
  - `scripts/start-frontend-gateway.mjs`
  - `scripts/start-smart.mjs`
  - `scripts/generate-deploy-preset.mjs`
  - `scripts/package-desktop-control-mcp.mjs`
  - `scripts/ensure-playwright-browser.mjs`

说明：

- 这些脚本已经不依赖 `cwd`
- 但还没统一抽成同一个共享 helper

### B. 后续可继续做减法的残留

这些地方虽然没有直接跑偏，但还存在“多套找根策略”：

- `src/main/skillServices.ts`
  - 仍有 `path.resolve(__dirname, '..')`
  - 目前用于 web-search skill 路径候选，功能上不依赖 `cwd`，但仍不是单一 helper

- `src/main/skillManager.ts`
  - 候选路径里同时保留 `getProjectRoot()` 与 `__dirname_esm` 多路推断
  - 当前属于兼容旧布局的多候选查找，后续可继续做减法

- `src/main/libs/pythonRuntime.ts`
  - 仍有 `path.resolve(__dirname_esm, '..', '..', '..')`
  - 当前与 `getProjectRoot()` 并存，属于双路找根

- `server/src/index.ts`
  - 静态资源路径仍保留多套 `__dirname` 回退探测
  - 当前是编译产物 public 目录兼容链，不是 `cwd` 漂移，但仍不够单一

- `server/routes/wechatbotBridge.ts`
  - `workspaceRoot` 仍有 `req.app.get('workspace') || ''`
  - 当前不会直接写偏，但口径不如统一回 `getProjectRoot()` 收敛

说明：

- 这些不是 `cwd` 漂移问题
- 是“根路径推断策略尚未完全单一化”的问题

### C. 明确保留、不应误删的边界

以下不是问题，复盘时不要误伤：

- `workingDirectory` / `session.cwd`
  - 这是任务执行目录
  - 它本来就不等于 `projectRoot`

- `req.app.get('workspace')`
  - 这是服务启动时注入的项目工作区
  - 只要最终回到 `getProjectRoot()` 体系，就是合法入口

## 后续规则

以后新增路径逻辑时，顺序固定：

1. 先拿 `getProjectRoot()`
2. 再拼相对路径
3. 如果需要 runtime 数据，走 `resolveRuntimeRoot()` / `resolveRuntimeUserDataPath()`
4. 不允许随手 `path.resolve(process.cwd(), ...)`
5. 如果脚本暂时不能直接用共享 helper，也必须显式记录“它是脚本位置反推根”，不能偷偷自创新口径

## 结论

这轮之后，项目路径系统更接近“收敛态”：

- 根路径只有一个真相源
- 运行路径与项目路径关系清晰
- 启动位置变化不会再轻易把家写偏
