# 前端面板画像表

时间：2026-04-02 03:06:21

## 用途

这份表不是为了评判页面“好不好看”。

它的作用是：

- 说清楚每个页面 / 面板现在到底是什么
- 它用了哪些壳和组件
- 它的叠层问题主要在哪里
- 它现在处于“已开始收口”还是“仍然偏胖”
- 后续最适合从哪里下刀

这份表配合：

- `docs/2026-04-01_153626_FRONTEND_ONION_PEEL_RULE.md`
- 代码里的 `## {提取}` 标记

一起使用。

---

## 面板画像表

| 面板/组件 | 文件 | 现在用了什么组件/壳 | 叠层情况 | 功能元素 | 当前判断 | 适合提取 |
|---|---|---|---|---|---|---|
| 设置总面板 | [Settings.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/Settings.tsx) | 自己的 page-shell、移动端导航卡/切换栏、`ModalWrapper`、`ErrorMessage`、多个子面板 | 外层 `fixed inset-0` 大壳；之前有局部 `absolute` 小弹层，已迁掉两块 | 模型设置、外挂能力、IM、对话文件、记忆管理、资源、备份 | 重灾区，但已开始收口 | `SettingsMobileShell`、`SettingsMobileTabStrip`、`SettingsSubModal` |
| 设置页内部子弹层 | [Settings.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/Settings.tsx) | `ModalWrapper` | 连接测试结果、添加/编辑模型已迁出局部 overlay | 结果反馈、模型编辑 | 正在从“套娃”变成统一壳 | `SettingsSubModal` |
| 技能主面板 | [SkillsManager.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/skills/SkillsManager.tsx) | `ConfirmDialog`、`ImportDialog`、本地添加菜单、技能详情弹层、分组列表 | 仍有详情弹层 `createPortal`；添加菜单是局部 dropdown | 搜索、导入、清理重复、清理无效、角色绑定、详情查看 | 胖，但已经开始收纳 | `GroupedCatalogSection`、`CatalogManagerShell`、详情壳继续统一 |
| 技能快速选择器 | [SkillsPopover.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/skills/SkillsPopover.tsx) | 桌面 popover + 移动端 `ModalWrapper` 降级 | 桌面是 `absolute` popover，移动端已降级 | 搜索技能、外挂能力、管理技能入口 | 方向正确，衣服开始分场合穿 | `SkillsPickerSheet / DesktopPopover` |
| MCP 主面板 | [McpManager.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/mcp/McpManager.tsx) | `ConfirmDialog`、`RolePickerDialog`、`McpServerFormModal` | 删除确认和角色选择已迁，表单 modal 也已统一壳 | 搜索、安装、删除、角色绑定、模板入口 | 比之前清爽很多 | `CatalogManagerShell`、MCP 列表区块后续继续薄化 |
| MCP 表单弹窗 | [McpServerFormModal.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/mcp/McpServerFormModal.tsx) | `ModalWrapper` | 已不再自己手写 fixed modal | 名称、描述、transport、env、headers | 已穿对衣服 | 后续只需抽表单字段块，不急 |
| 模型选择器 | [ModelSelector.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/ModelSelector.tsx) | 桌面 popover + 移动端 `OptionSheet` | 桌面 `absolute` dropdown，移动端已降级 | 角色模型切换 | 典型样板，已经对路 | `OptionSheet / DesktopPopover` |
| 文件夹选择器 | [FolderSelectorPopover.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/cowork/FolderSelectorPopover.tsx) | 桌面 popover + `DirectoryBrowser` 用 `ModalWrapper` | 桌面最近目录菜单还是 popover；目录浏览器已统一 modal 壳 | 最近文件夹、添加文件夹、浏览目录 | 基本走上正轨 | `FolderPickerSheet / DesktopPopover` |
| 公共 modal 基座 | [ModalWrapper.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/ui/ModalWrapper.tsx) | 自己 | 全局 modal 基座 | 标题、内容、底部动作区、移动端全屏壳 | 当前最重要公共件 | `MobilePageShellModal / DesktopCenteredModal` 继续细化 |
| 公共确认框 | [ConfirmDialog.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/ui/ConfirmDialog.tsx) | 基于 `ModalWrapper` | 无额外重复层 | 删除/清理/危险操作确认 | 已开始接管多页 | 后续覆盖更多确认类 |
| 公共角色选择框 | [RolePickerDialog.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/ui/RolePickerDialog.tsx) | 基于 `ModalWrapper` | 无额外重复层 | 角色选择 | 已接管 MCP | 可继续给别的角色绑定场景用 |
| 公共导入框 | [ImportDialog.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/ui/ImportDialog.tsx) | 基于 `ModalWrapper` | 无额外重复层 | 导入类弹窗 | 已接管 Skills GitHub 导入 | 可继续扩展到其它导入场景 |
| 公共选项 sheet | [OptionSheet.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/ui/OptionSheet.tsx) | 基于 `ModalWrapper` | 无额外重复层 | 移动端选项切换 | 已接管 ModelSelector | 适合继续接管 Skills/Folder 等移动端选项 |
| Cowork 首页 | [CoworkView.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/cowork/CoworkView.tsx) | 首页 hero、角色卡条、最近会话条、输入区、`WindowTitleBar` | 顶部 header 与全局按钮层曾重叠，现已统一腾位 | 首页欢迎区、角色切换、最近会话、输入区 | 展示块耦合较高，但已开始收口 | `CoworkHeroHeader`、`AgentRoleCardStrip`、`RecentSessionBanner` |
| Cowork 详情页 | [CoworkSessionDetail.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/cowork/CoworkSessionDetail.tsx) | 大型消息流页面、顶部 header、局部图片预览、菜单、工具轨迹 | 局部 overlay 和 action menu 仍较多 | 会话标题、消息流、工具结果、图片预览、导出等 | 仍偏胖 | `PageHeaderShell`、`ImagePreviewModal`、`SessionActionMenuShell` |
| 会话历史页 | [SessionHistoryView.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/cowork/SessionHistoryView.tsx) | 页面 header、筛选条、分组列表 | 无特别重的 overlay，但 header/筛选壳重复 | 搜索、来源筛选、角色分组、最近会话 | 可继续薄化 | `PageHeaderShell`、`FilterBarShell`、`RoleGroupedListSection` |
| Room | [RoomView.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/room/RoomView.tsx) | 页面 header、角色选择卡、房间列表、消息区 | 叠层不重，但展示块较多 | 开房、成员卡、消息区、最近房间 | 已开始穿对衣服，但仍可拆块 | `PageHeaderShell`、`AgentChoiceCard`、`ConversationBubbleSet` |
| EmployeeStore | [EmployeeStoreView.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/components/employeeStore/EmployeeStoreView.tsx) | 页面 header、信息卡片、覆盖层 | 有局部内容遮罩，但不算主要重灾区 | 商店说明、卡片展示 | 风险中等 | `PageHeaderShell`、卡片块后续共用 |
| 全局壳层 | [App.tsx](D:/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/src/renderer/App.tsx) | 全局顶部按钮浮层、内容避让壳 | 顶部按钮层 `absolute top-0 z-30`，已统一留白 | 设置按钮、反馈按钮、全局页面承载 | 方向正确 | `TopActionsOffsetShell` |

---

## 一眼结论

### 1. 现在最胖的不是逻辑，而是壳

最重的几个点仍然是：

- `Settings.tsx`
- `SkillsManager.tsx`

它们的问题都不是“功能没有”，而是：

- 功能太多塞在同一页
- 壳层和内容块还没完全分家

### 2. 已经开始有秩序了

公共件已经不只是概念，而是已经落地并接管了主线：

- `ModalWrapper`
- `ConfirmDialog`
- `RolePickerDialog`
- `ImportDialog`
- `OptionSheet`

这说明前端已经开始有“衣柜和收纳盒”了。

### 3. 还残留的旧味道

最明显的旧壳残留：

- `SkillsManager` 的详情弹层
- 各种桌面 popover 在桌面端仍是旧写法
- `Modal.tsx` 和 `ModalWrapper.tsx` 双轨并存

---

## 当前阶段判断

这一阶段最关键的结果不是“又多了几个组件”，而是：

- 前端已经开始形成自己的公共收纳系统
- 组件开始按场合穿对衣服
- 页面本体开始变薄
- 壳层开始统一

一句话：

> “提取”这一阶段已经差不多了；下一阶段正式进入“收纳与归位”。 

---

## 下一阶段建议

优先做：

1. 把剩余还没换衣服的页面列出来
2. 把已经抽出的公共件继续吃进去
3. 关掉重复旧壳
4. 清理残留双轨

推荐顺序：

1. `Settings` 继续薄化
2. `SkillsManager` 详情弹层和添加菜单继续收纳
3. `PopoverOrSheet` 继续扩到其它选择器
4. 最后再清 `Modal.tsx` 这条旧轨

---

## 提醒

继续执行时仍遵守：

- 不动根
- 不乱碰主逻辑
- 只换装造
- 只做收纳
- 一次一个组件或一层壳
- 改完立即构建验证
