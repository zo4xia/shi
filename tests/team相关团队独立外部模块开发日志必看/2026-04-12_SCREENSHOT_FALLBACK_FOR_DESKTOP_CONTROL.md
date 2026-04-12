# 2026-04-12 Desktop Control 的纯眼睛 fallback

记录时间：2026-04-12

标签：

- `desktop-control`
- `screenshot`
- `fallback`
- `小眼睛`

---

## 1. 为什么要补这一层

这次已经验证到：

- `desktop-control-mcp/server.ps1`
- 在当前机器上可能被安全软件直接拦截

这意味着：

```text
完整的小眼睛小手手可能暂时出不来，
但至少不能让“眼睛”也一起失明。
```

所以这次确认：

- `C:\\Users\\Administrator\\.codex\\vendor_imports\\skills\\skills\\.curated\\screenshot`

可以作为：

- 桌面观察
- 全屏截图
- 区域截图
- 当前窗口截图

的保底纯眼睛层。

---

## 2. 当前策略

以后这条能力链按两层理解：

### 第一层：完整桌面 MCP

- `desktop-control-mcp`
- 包含：
  - 眼睛
  - 手手
  - 鼠标键盘

### 第二层：纯眼睛 fallback

- `.curated/screenshot`
- 只负责：
  - 全屏
  - 区域
  - 活动窗口
  - 截图保存

---

## 3. 为什么这层重要

因为如果完整 MCP 被拦住：

- 不能就等于“整个桌面观察能力没了”

至少还要保住：

- 看一眼
- 留一张图
- 知道当前屏幕是什么样

这就是最小的回家能力。

---

## 4. 解耦包更新

`npm run package:desktop-control`

现在除了打包：

- `desktop-control-mcp`

也会顺手把：

- `screenshot-skill-fallback`

一起带上。

这意味着：

```text
小眼睛小手手的备份包里，
至少已经有：
完整桌面 MCP + 纯眼睛 fallback
```

---

## 5. 一句话收束

```text
就算手手暂时被拦住，
眼睛也不能一起瞎。
```
