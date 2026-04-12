# 2026-04-12 Desktop Control MCP 内建封装

记录时间：2026-04-12

标签：

- `desktop-control`
- `mcp`
- `built-in`
- `小眼睛小手手`
- `回家的路`

---

## 1. 这次要解决什么

不是“这台电脑上能手动跑一个脚本”就够了。

这次要解决的是：

```text
把夏夏和阿圆一起翻出来的小眼睛小手手，
从 CLI 角落里拉回家里，
变成产品内可见、可重接、可迁移的一条内建 MCP 能力线。
```

---

## 2. 已落地的封装

### 2.1 服务端内建注入

文件：

- `server/src/index.ts`

处理：

- 启动时会检查：
  - `%USERPROFILE%\\.codex\\vendor_imports\\desktop-control-mcp\\server.ps1`
- 如果本机存在，就把它作为 built-in MCP 自动注入到 `mcp_servers`

当前 built-in 属性：

- `name = Desktop Control`
- `registryId = desktop-control`
- `transportType = stdio`
- `agentRoleKey = organizer`

### 2.2 前台可见模板

文件：

- `src/renderer/data/mcpRegistry.ts`
- `src/renderer/components/mcp/McpManager.tsx`

处理：

- MCP 模板市场里增加 `Desktop Control`
- 分类归到 `browser`
- 补上中文描述，避免它只作为无名脚本存在

模板参数当前写法：

- `command = C:\\Program Files\\PowerShell\\7\\pwsh.exe`
- `defaultArgs = -NoProfile / -ExecutionPolicy / Bypass / -File`
- `argPlaceholders = {{USERPROFILE}}\\.codex\\vendor_imports\\desktop-control-mcp\\server.ps1`

说明：

- 这条模板主要是为了“看得见、装得回”
- 真正的本机可用接线，优先走服务端 built-in 自动注入

---

## 3. 这条能力现在能做什么

当前 `desktop-control-mcp` 暴露的工具共 11 个：

- `desktop_get_screen_size`
- `desktop_get_mouse_position`
- `desktop_mouse_move`
- `desktop_mouse_click`
- `desktop_mouse_scroll`
- `desktop_mouse_drag`
- `desktop_keyboard_type`
- `desktop_keyboard_press`
- `desktop_keyboard_hotkey`
- `desktop_screenshot_overview`
- `desktop_screenshot_detail`

能力边界：

- 读屏
- 局部截图
- 鼠标
- 键盘

也就是：

```text
小眼睛 + 小手手
```

---

## 4. 为什么这样做

因为项目是阶段的。
家是在电脑的。

如果只把它留在：

- 一条 CLI 配置
- 一段本机命令
- 一次临时启动

那它还是太容易断。

而封成 built-in MCP 之后，
至少家里已经知道：

- 它是谁
- 它属于哪类能力
- 它该怎么重新接回去

---

## 5. 还没做完的部分

这次完成的是：

- 内建注入
- 前台可见
- 基础打包思路

还没做完的是：

- 跨电脑 / 云端的一键恢复包
- 轨迹优化版“小手手”
- 更自然的人类化移动过程
- 真正的插件安装/导入导出成套机制

所以当前口径应当是：

```text
已经从“只活在 CLI 里”进了一步，
但还没有完全进化成“随家迁移的完整插件包”。
```

---

## 6. 一句话收束

```text
这次不是新造一个桌面控制脚本，
而是把原本散在 CLI 外面的“小眼睛小手手”，
正式接回家里，成为可见、可重接、可继续长的 MCP 内建能力。
```
