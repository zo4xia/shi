# 2026-04-13 Office 轻壳 + 根路径一致性复盘足迹

## 这轮目标

把两条主线先立住：

1. `Office` 相关能力只能轻接入，不能破坏用户本机环境
2. 整个项目的路径系统必须收敛到唯一根锚点

## 已完成

### 1. Office 轻壳已经立住

本轮没有接安装，没有接自动下载，没有接执行器。

只做了：

- 在 native capability 层新增 `office-native-addon`
- 默认关闭
- 支持手动填写二进制路径
- 支持只读探测少数常见目录
- 不改 PATH
- 不往其他 agent 家目录投放 skill

关键文件：

- `src/shared/nativeCapabilities/config.ts`
- `server/libs/officeFoundation.ts`
- `server/libs/roleRuntimeViews.ts`
- `src/renderer/components/settings/NativeCapabilitiesSettings.tsx`
- `src/renderer/components/skills/SkillsPopover.tsx`
- `src/shared/continuityRules.ts`

### 2. Office 真相边界已经收紧

当前设置层允许“看见并配置” Office 轻通道；
但运行时真相层不会把它误说成“当前已可调用”。

规则：

- 探测到二进制 != 已桥接执行器
- 没接执行器之前，不进入 `runtimeNativeCapabilities`
- 最多写 warning，不冒充可用

### 3. 项目根路径钉子已经补强

当前唯一锚点口径：

- `projectRoot`
- `runtimeRoot = <projectRoot>/.uclaw`
- `userDataPath = <runtimeRoot>/web`

主链修复点：

- `scripts/dev-runner.mjs`
- `scripts/bind-ima-skill.ts`
- `scripts/bind-blingbling-little-eye.ts`
- `scripts/sync-app-config-env.ts`
- `scripts/smoke-cowork-session.mjs`
- `server/routes/app.ts`
- `server/libs/playwrightRuntime.ts`
- `SKILLs/daily-memory-extraction/fileArchiver.ts`

### 4. Review 子 agent 已完成一轮捡漏

子 agent 关注的是：

- 根路径漂移
- `workspaceRoot` 被 `session.cwd` 或请求参数覆盖
- UI / capability snapshot 把“已配置”误说成“已可用”

它抓到的三条问题中：

- `fileArchiver.ts` 的 `process.cwd()` 已修
- `feishuGateway.ts` / `wechatbotGateway.ts` 的 `session.cwd -> workspaceRoot` 已修
- `room.ts` 的请求 `workspaceRoot` 覆盖项目根已修

## 当前规则总结

### Office 规则

- Office 是 system foundation 候选，不是普通 skill
- 不执行官方一键安装脚本
- 不破坏用户现有 agent 家目录
- 不自动安装，不自动启用
- 先探测，后声明；没桥执行器前不说自己会用

### 路径规则

- 只认一个 `projectRoot`
- 相对路径必须相对 `projectRoot`
- runtime 路径只能走共享 helper
- `workingDirectory` / `session.cwd` 不是项目根，只能做任务执行信息

## 残留但暂不继续膨胀

这轮刻意没有继续扩张到：

- Office 真执行桥
- Office watcher
- Office MCP 注册
- 全部辅助脚本的根路径 helper 统一化
- 所有旧模块的多候选找根策略清理

原因：

- 当前主线目标是先把规则钉住
- 让系统先“不会说过头，不会写偏家，不会乱碰用户环境”

## 下一步建议

### P1

- 继续收“多套找根策略”的残留
- 尤其是 `skillManager / pythonRuntime / skillServices / server index static public fallback`

### P2

- 如果后续真的需要 Office 实际能力
- 先只接最小执行桥：
  - `officecli --version`
  - 安全探针
  - 少量只读/轻编辑门面

### P3

- 把用户反馈里和“技能边界 / 能力声明 / 文件处理 / 启动抢跑”相关的条目
- 和本轮足迹做一次对照复盘

## 结论

这轮不是扩容，
而是在做减法和收敛：

- Office 先做轻壳，不乱接
- 根路径只认一个真相源
- 已配置和已可用明确分层
- review 捡漏点已回收

系统比之前更像一个“会收口的家”，
不是继续膨胀的临时拼装物。
