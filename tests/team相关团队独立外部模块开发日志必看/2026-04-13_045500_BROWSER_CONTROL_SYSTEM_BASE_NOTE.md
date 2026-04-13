# 2026-04-13 浏览器控制归入系统底座记录

## 结论

“无头的、最传统的浏览器控制”不应归入普通 skills 线。

它更适合归入：

- system foundation
- built-in MCP / native capability lane

而不是：

- 普通 role-bound skill
- 本轮 turn-selected skill prompt

## 当前现状

代码里已经存在 built-in 浏览器控制：

- `Playwright Browser`

位置：

- `server/src/index.ts`

关键描述：

- built-in Chromium
- organizer 专用
- 服务器默认无桌面时自动走 headless

这说明它本质上已经是系统底座能力，而不是普通 skill。

## 为什么不能把它当普通 skill

如果把浏览器控制继续当普通 skill 处理，会出现几类混乱：

1. 让小 agent 误以为浏览器控制需要像普通 skill 一样每轮显式注入 prompt
2. 让 skills 启动链背上不必要的运行态负担
3. 把真正的系统底座能力和“用户本轮选的模块”混在一起

## 正确归类

### 系统底座

- memory
- browser control（headless Playwright 这类）
- browser-eyes
- IMA

### 按需模块

- 其余普通 skills

## 当前落地

### 1. 规则文案补充

文件：

- `src/shared/continuityRules.ts`

增加明确说明：

- built-in browser control 如果出现在 `runtimeMcpTools`，属于 system foundation lane
- 它不是普通 role skill
- 也不能和本轮 turn-selected skills 混淆

### 2. 归类原则

后续如果再做 system-handled / prompt-handled 拆分，
浏览器控制应优先沿着：

- built-in MCP
- native capability

这条线走，
而不是往 `skillIds` 里硬塞。

## 当前判断

这一步的重点不是“新增浏览器控制”，而是：

把它从认知上明确为系统兜底能力。

这样系统结构会更清晰，也更符合夏夏说的二合一原则。
