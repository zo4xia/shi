# 2026-04-13 system-handled skills 拆分记录

## 背景

夏夏提出：

- 有些能力其实更适合“系统自己兜住”
- 不应该继续按普通 skills prompt 口径交给小 agent 理解和判断

当前最明确的两项是：

- `blingbling-little-eye`
- `ima-note`

它们更像：

- 系统底座兜底能力
- 或系统已接好的常驻能力

而不是需要每轮都按普通 skill prompt 注入的小模块。

## 本次改动

新增：

- `src/shared/systemHandledSkills.ts`

内容：

- `SYSTEM_HANDLED_SKILL_IDS`
- `isSystemHandledSkillId(...)`
- `partitionSkillIdsByHandling(...)`

## 本次收口点

### 1. index.ts

`buildSelectedSkillsPromptLazily(...)` 现在会先分流：

- system-handled
- prompt-handled

如果这轮 skillIds 全部属于 system-handled：

- 直接返回 `null`
- 不再为了它们去碰 `getSkillManager().buildSelectedSkillsPrompt(...)`

### 2. cowork route

`server/routes/cowork.ts`

构造 executor 时：

- 只对 prompt-handled skills 构建 selected skill prompt
- system-handled skills 不再走普通 skill prompt 注入链

### 3. room route

`server/routes/room.ts`

同样只对 prompt-handled skills 注入 selected skill prompt。

### 4. startup unsupported-runtime check

`server/src/index.ts`

检查“哪些 skills 还依赖未桥接 runtime config/secret”时，
现在只检查 prompt-handled 部分。

system-handled skills 不再被当成“普通技能运行态负担”。

## 当前意义

这一步不是“把 skill 删了”，而是把它们从：

- 普通 skills prompt 口径

转成了：

- 系统自己兜住的能力集合

这样更符合当前二合一原则：

- 系统兜得住的，系统自己兜
- 只有真正需要用户本轮选择和注入 prompt 的，才走普通 skills 线

## 当前判断

这是继续降低 skills 耦合的正确方向。

后面如果再发现某些能力其实更适合 system-handled，
也应该优先往这个集合里收，而不是继续扩散普通 skill prompt 负担。
