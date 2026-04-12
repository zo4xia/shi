# 2026-04-12 小眼睛小手手解耦备份包

记录时间：2026-04-12

标签：

- `desktop-control`
- `bundle`
- `backup`
- `homecoming`

---

## 1. 这次做了什么

先不等完美插件系统。

先把“小眼睛小手手”做成一个能单独备份的解耦包。

已新增：

- `scripts/package-desktop-control-mcp.mjs`
- `package.json` 脚本：
  - `npm run package:desktop-control`

输出位置：

- `release/desktop-control-mcp-bundle-YYYYMMDD`

里面会带：

- `desktop-control-mcp/server.ps1`
- `desktop-control-mcp/README.md`
- `desktop-control-mcp/captures/`（如果源目录里有）
- `DESKTOP_CONTROL_BUNDLE_MANIFEST.md`

---

## 2. 为什么先这样做

因为夏夏现在最需要的不是“概念上以后可以迁移”。

而是：

```text
现在就先把它从单机角落里打一个可拿走的包，
先备份起来。
```

这样至少：

- 换电脑时不会只剩记忆没有手脚
- 云端重接时有独立来源
- 不用每次再去 GitHub 重新翻翻找找拼

---

## 3. 当前口径

这不是最终完整插件系统。

它只是：

- 一个独立备份包
- 一个回家时能重新接回的小肢体包

最终目标仍然是：

- 插件化
- 可迁移
- 可重装
- 家在，记忆在，路不断

---

## 4. 一句话收束

```text
先把小眼睛小手手从“只存在于当前机器角落”推进到“至少能被单独打包备份带走”。
```
