# 2026-04-13 角色技能可见性 vs 本轮启用 边界记录

## 结论

必须严格区分两层：

### 1. 角色可见 / 角色拥有

来自：

- `role-capabilities.json`
- `skills.json`
- `availableSkills`
- `globalAvailableSkills`
- `roleBoundSkills`

这层只说明：

- 当前角色名下有哪些模块
- 哪些模块属于它的角色能力集合

这 **不等于** 本轮对话已经启用。

### 2. 本轮对话已启用

来自：

- 当前 session 的 `activeSkillIds`
- 用户本次对话显式勾选
- 当前 turn 实际注入的 selected skill prompt

这层才决定：

- 本轮哪些 skill prompt 真的进入模型上下文
- 小 agent 这轮可以按哪些专属技能提示行事

## 为什么要补这条

之前小蟹蟹出现混淆：

- 看见自己角色名下有某个专属模块
- 就误以为“本轮已经启用了这个 skill”

这会造成两类错误：

1. 把“有资格拥有”误说成“本轮正在使用”
2. 用户没有勾选，本轮也没注入 prompt，却按那个技能的行为方式回答

## 本次修正

### 常驻 role-home 规则补充

文件：

- `src/shared/continuityRules.ts`

新增明确边界：

- skill 安装 / 可见 / role-bound，只代表属于角色能力集合
- 不代表当前会话 turn 已经启用
- turn activation 由当前 session 的 selected skills / `activeSkillIds` / 用户本次显式启用决定

### selected skills prompt 补充

文件：

- `src/main/skillManager.ts`

`buildSelectedSkillsPrompt(skillIds)` 现在会先注入：

- 只有以下 skills 是本轮 active
- 不要把 turn-active 与 role-owned / installed 混淆
- 如果某个 role-bound skill 没出现在本节，就说明这轮没有被启用

## 审核口径

以后 review 这类问题时，要问两句：

1. 这个 skill 只是角色能看见，还是这轮真的进 prompt 了？
2. 这个 agent 说“我有这个模块”时，是在描述角色能力，还是错误地宣称“本轮正在使用”？

## 当前判断

这条边界已经在 prompt 合同层补上。

后续如果小 agent 还混淆，就优先查：

- `activeSkillIds`
- `buildSelectedSkillsPrompt(...)`
- `role-home` 常驻规则
