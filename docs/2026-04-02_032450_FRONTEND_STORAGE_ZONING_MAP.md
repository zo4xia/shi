# 前端分页收纳分区图

时间：2026-04-02 03:24:50

## 目的

这份图纸不是为了立刻重写页面。

它的作用是：

- 把每一页现在有哪些“零件位”画清楚
- 说清哪些块已经有公共收纳盒，哪些还散落在外面
- 让后续 agent 可以按页、按区接手
- 保持“不动根、只换装造、一次一层”的修法

---

## 绿色边界

这些可以继续做：

- 统一页面头部壳
- 统一弹窗壳
- 移动端把 popover 降级成 sheet / page-shell
- 把页面内部的列表区、详情区、工具条区、筛选区分开
- 给胖页面补“收纳分区图”和 `{提取}` 标记

## 红色边界

这一轮先不要碰：

- 对话发送主链
- 会话切换与历史读取主链
- 定时任务执行链
- 技能导入、技能绑定、角色配置保存主链
- 广播板、每日记忆、渠道桥接等运行逻辑

---

## 已有公共收纳盒

当前已经可以复用的公共件：

- `ModalWrapper`
- `ConfirmDialog`
- `RolePickerDialog`
- `ImportDialog`
- `OptionSheet`
- `PageHeaderShell`

这意味着后续很多页面不需要再自己手写：

- `fixed inset-0`
- 局部确认框
- 移动端临时全屏层
- 重复的页面头部按钮区

---

## 分页收纳分区总表

| 页面 | 文件 | 主路径 | 建议收纳分区 | 当前散落点 | 风险 | 最小安全下一刀 |
|---|---|---|---|---|---|---|
| 设置总面板 | `src/renderer/components/Settings.tsx` | 打开设置、切换栏目、保存配置 | `SettingsPageShell` / `SettingsNavStrip` / `SettingsPanelBody` / `SettingsSubModal` | 页面仍然自带超大壳；栏目切换、子面板、局部控件还在同一文件里 | 高 | 继续只拆“面板块”和“栏目导航壳”，不碰保存逻辑 |
| 技能中心 | `src/renderer/components/skills/SkillsManager.tsx` | 搜索技能、导入、查看详情、绑定角色 | `CatalogToolbar` / `InstalledListRegion` / `MarketplaceRegion` / `SkillDetailOverlay` / `LocalAddMenu` | 技能详情还是 portal 叠层；本地添加菜单还是局部 dropdown | 高 | 先把详情层收进统一 detail shell，再看添加菜单的移动端降级 |
| 技能页容器 | `src/renderer/components/skills/SkillsView.tsx` | 打开技能中心 | `PageHeaderShell` / `PageBodyShell` | 已经开始统一 | 低 | 保持不动，只作为别页头部统一样板 |
| 外接能力 | `src/renderer/components/mcp/McpManager.tsx` | 搜索、安装、删除、绑定角色 | `CatalogToolbar` / `InstalledRegion` / `MarketplaceRegion` / `InstallRoleDialog` / `ServerFormShell` | `createPortal` 还在；列表区和市场区仍在同页堆叠 | 中 | 先薄化列表区块，不碰安装/删除逻辑 |
| 外接能力页容器 | `src/renderer/components/mcp/McpView.tsx` | 打开外挂能力页 | `PageHeaderShell` / `PageBodyShell` | 已开始统一 | 低 | 保持不动，作为 header 复用样板 |
| 定时任务 | `src/renderer/components/scheduledTasks/ScheduledTasksView.tsx` | 查看列表、查看详情、返回列表 | `PageHeaderShell` / `TaskTabsBar` / `TaskListRegion` / `TaskDetailRegion` / `RunsHistoryRegion` | 结构比前几页清晰，但列表、详情、历史仍在一页切换 | 中 | 只补区块命名和外壳，不碰定时数据流 |
| Agent 商店 | `src/renderer/components/employeeStore/EmployeeStoreView.tsx` | 打开商店、浏览卡片 | `PageHeaderShell` / `StoreHero` / `StoreGridRegion` | 重灾不大，主要是内容区还可再薄化 | 低 | 暂不动，后续跟随统一卡片壳 |
| 协作首页 | `src/renderer/components/cowork/CoworkView.tsx` | 进首页、选角色、看最近会话、开始对话 | `CoworkHeroHeader` / `RoleStrip` / `RecentSessionBanner` / `EntryComposer` | 首页展示块较多；仍是大页承载多块内容 | 中 | 只拆展示块，不碰进入会话逻辑 |
| 协作详情 | `src/renderer/components/cowork/CoworkSessionDetail.tsx` | 看消息、继续会话、看工具结果、看图片 | `SessionPageHeader` / `MessageStreamRegion` / `ToolTraceRegion` / `ImagePreviewModal` / `SessionActionMenuShell` | 图片预览和操作菜单还在自己写 `fixed`/`absolute`；页面特别胖 | 高 | 先只收图片预览和操作菜单，不动消息流与广播板逻辑 |
| 会话历史 | `src/renderer/components/cowork/SessionHistoryView.tsx` | 搜索历史、按来源筛选、进入会话 | `PageHeaderShell` / `HistoryFilterBar` / `PinnedSection` / `SessionListSection` | header / filter 壳重复；列表分区还没正式命名 | 中 | 先统一 header 与 filter 壳，不碰 session 跳转逻辑 |
| 房间页 | `src/renderer/components/room/RoomView.tsx` | 选角色、开房、看消息 | `RoomPageHeader` / `RolePickerRegion` / `RoomListRegion` / `ConversationRegion` | 展示块多，但叠层不算重 | 中 | 先拆角色选择区和房间列表区，不碰消息链 |
| 模型选择器 | `src/renderer/components/ModelSelector.tsx` | 切模型 | `DesktopPopover` / `MobileOptionSheet` | 方向已正确 | 低 | 作为 popover/sheet 双轨样板继续复用 |
| 文件夹选择器 | `src/renderer/components/cowork/FolderSelectorPopover.tsx` | 选最近目录、浏览目录 | `RecentFolderPopover` / `DirectoryBrowserModal` | 最近目录仍是桌面 popover 旧轨 | 中 | 继续给移动端降级，不碰目录读取逻辑 |
| 技能快速选择器 | `src/renderer/components/skills/SkillsPopover.tsx` | 快速选技能、去管理页 | `DesktopPopover` / `MobilePickerSheet` | 桌面旧轨还在，但方向正确 | 中 | 延续 `PopoverOrSheet` 思路收口 |

---

## 按页拆包建议

为了让多个 agent 能并行而不撞车，后续建议按下面拆包：

### 包 A：页面头部统一包

责任范围：

- `SkillsView`
- `McpView`
- `EmployeeStoreView`
- `ScheduledTasksView`
- 后续可扩到 `SessionHistoryView`
- 后续可扩到 `RoomView`

目标：

- 统一 `PageHeaderShell`
- 让页面自己不再重复写侧边栏按钮、新建按钮、标题栏

### 包 B：目录管理页收纳包

责任范围：

- `SkillsManager`
- `McpManager`

目标：

- 把工具条、列表区、市场区、详情区正式分区
- 清理残留 portal/detail overlay 的旧味道

### 包 C：协作大页减负包

责任范围：

- `CoworkView`
- `CoworkSessionDetail`
- `SessionHistoryView`
- `RoomView`

目标：

- 先拆页面块，不动运行逻辑
- 把 hero、filter、message rail、action menu、preview modal 分出壳

### 包 D：移动端降级包

责任范围：

- `SkillsPopover`
- `FolderSelectorPopover`
- 其它仍保留桌面 popover 的选择器

目标：

- 继续把“桌面 popover / 移动端 sheet”这条线收直

---

## 当前最适合下刀的顺序

1. `SkillsManager` 的 `SkillDetailOverlay`
2. `CoworkSessionDetail` 的 `ImagePreviewModal`
3. `SessionHistoryView` 的 `PageHeaderShell + FilterBar`
4. `RoomView` 的页面头部和角色区分层
5. 最后再回头继续薄化 `Settings`

这样排的原因：

- 能继续推进“收纳与归位”
- 不会一下子碰到最深的数据主链
- 每一刀都比较容易独立验证

---

## 当前阶段一句话

前端现在已经不缺“零件”，缺的是：

> 把零件按页面、按分区、按场合，放回正确的位置。

所以接下来不是继续发明新盒子，而是按图纸做收纳。
