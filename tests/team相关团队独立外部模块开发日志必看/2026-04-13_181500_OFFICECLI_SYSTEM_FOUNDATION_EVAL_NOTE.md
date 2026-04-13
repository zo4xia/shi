# 2026-04-13 OfficeCLI 适配性评估记录

## 结论

`OfficeCLI` 适合作为“系统底座 Office 通道”的候选，而不适合作为普通 skill。

原因很直接：

- 它覆盖 `docx / xlsx / pptx` 的创建、读取、修改
- 提供稳定 CLI / JSON / MCP 接入面
- 单二进制、无本机 Office 依赖，适合 agent runtime
- 更接近 browser control / IMA 这种系统能力，不该和 turn-selected skills 混在一起

## 与当前主家的关系

当前主家已经有两层文档能力：

1. **系统读链**
   - `server/libs/fileParser.ts`
   - 负责 `pdf / doc / docx / txt / md / csv / json / xml / html / xlsx(基础)` 的读取解析
   - 这是“读”能力，不是完整 Office 创作/编辑能力

2. **技能仓**
   - `SKILLs/docx`
   - `SKILLs/xlsx`
   - `SKILLs/pptx`
   - 这些目前仍属于技能仓/工作流层，不能直接等同于系统底座真能力

所以当前缺的不是“文档读取”，而是：

- 一个明确的 **Office authoring/editing system lane**

## 为什么不该直接当普通 skill

如果把 `OfficeCLI` 当普通 skill，会带来三类混乱：

1. 小 agent 会把 Office 能力误判成“只要看到 skill 名字就能用”
2. turn-selected skill prompt 会和真正的系统能力混线
3. 启动链/技能链可能再次背上不必要的运行态负担

## 更稳的落地方向

### Phase A：先写清规则

先在 `src/shared/continuityRules.ts` 明确：

- 文档读取是系统底层 parser lane
- Office 创作/结构编辑如果存在专门通道，应归入 system foundation
- 如果当前 runtime 没有 Office foundation lane，agent 必须明确说缺失，不能拿仓库里的 `docx/xlsx/pptx` 名字冒充

### Phase B：再做安装与探测

如果要正式接入 `OfficeCLI`，建议后续做成：

- 可探测的系统能力
- 显式 runtime 注册
- 与普通 skills 解耦

候选形式：

- native capability
- built-in MCP / system-managed external tool

### 安装侧额外注意

`OfficeCLI` 官方 Windows 安装脚本会做两件事：

- 写入用户 PATH
- 自动向 `.claude / .copilot / .agents / .cursor / .windsurf / .minimax / .openclaw ...` 等目录投放 `officecli` skill

这对它自己的生态是便利，
但对当前主家不是最稳方案。

当前主家要求：

- system foundation 和普通 skills 明确解耦
- 不能让外部安装器直接改写多套 agent 家目录，制造“能力已接入”的假象

所以如果后续正式接 `OfficeCLI`：

- 不建议直接执行官方一键安装脚本作为产品内接入方案
- 更适合手动下载二进制 + 我们自己做能力探测、注册与路由

## 本轮已落地

当前这一轮没有接安装，也没有接真正执行。

只落了最小壳：

- `office-native-addon` 进入 native capability 配置层
- 默认关闭
- 允许配置一个手动二进制路径
- 允许只读探测几个常见目录
- `role-capabilities.json` 只会把“真实探测到”的 Office 通道算进 runtimeNativeCapabilities
- 如果角色启用了 Office，但当前没发现二进制，会写 warning，而不是假装可用

不建议：

- 直接塞进 `SYSTEM_HANDLED_SKILL_IDS`
- 或把 `docx/xlsx/pptx` 简单改成 prompt-free skill

因为那会把“有 skill 名字”和“真有运行能力”再次混淆。

## 当前判断

`OfficeCLI` 值得接。

但正确姿势是：

- **先归类**
- **再探测**
- **最后接 runtime**

而不是先把它塞进 skills。
