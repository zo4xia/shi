# Frontend Storage Work Split Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` when executing this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不碰主链逻辑的前提下，把前端“收纳与归位”阶段拆成可并行、低冲突、可验收的工作包。

**Architecture:** 继续沿用“剥洋葱”修法，优先处理壳层、弹层、分区与移动端降级，不直接碰运行逻辑。每个工作包只负责一类页面或一类公共壳，先做换衣服和归位，再考虑更深的拆分。

**Tech Stack:** React, TypeScript, Tailwind-style utility classes, 现有公共件（`ModalWrapper` / `ConfirmDialog` / `RolePickerDialog` / `ImportDialog` / `OptionSheet` / `PageHeaderShell`）

---

## 前置边界

### 绿色边界

- 允许统一页面头部壳
- 允许统一弹窗壳
- 允许把桌面 `popover` 在移动端降级成 `sheet` / `page-shell`
- 允许把胖页面按“工具条 / 列表区 / 详情区 / 筛选区 / 预览区”重新分区
- 允许补 `{提取}` 标记和页面分区注释

### 红色边界

- 不动对话发送主链
- 不动会话切换和历史读取主链
- 不动定时任务执行链
- 不动技能导入、角色绑定、配置保存的核心逻辑
- 不动广播板、每日记忆、渠道桥接运行逻辑

### 停手线

出现下面任一情况，当前工作包必须停手，不继续扩刀：

- 需要修改服务端接口或 store 数据结构
- 需要改动消息流渲染逻辑
- 需要修改技能绑定、定时任务、角色配置的真实保存路径
- 一个任务开始同时涉及“结构调整 + 样式重写 + 逻辑重排”

---

## 文件地图

### 公共壳与公共件

- `src/renderer/components/ui/ModalWrapper.tsx`
- `src/renderer/components/ui/ConfirmDialog.tsx`
- `src/renderer/components/ui/RolePickerDialog.tsx`
- `src/renderer/components/ui/ImportDialog.tsx`
- `src/renderer/components/ui/OptionSheet.tsx`
- `src/renderer/components/ui/PageHeaderShell.tsx`

### 页面头部统一线

- `src/renderer/components/skills/SkillsView.tsx`
- `src/renderer/components/mcp/McpView.tsx`
- `src/renderer/components/employeeStore/EmployeeStoreView.tsx`
- `src/renderer/components/scheduledTasks/ScheduledTasksView.tsx`
- `src/renderer/components/cowork/SessionHistoryView.tsx`
- `src/renderer/components/room/RoomView.tsx`

### 目录管理页收纳线

- `src/renderer/components/skills/SkillsManager.tsx`
- `src/renderer/components/mcp/McpManager.tsx`

### 协作大页减负线

- `src/renderer/components/cowork/CoworkView.tsx`
- `src/renderer/components/cowork/CoworkSessionDetail.tsx`
- `src/renderer/components/cowork/SessionHistoryView.tsx`
- `src/renderer/components/room/RoomView.tsx`

### 移动端降级线

- `src/renderer/components/skills/SkillsPopover.tsx`
- `src/renderer/components/cowork/FolderSelectorPopover.tsx`
- `src/renderer/components/ModelSelector.tsx`

### 高风险暂缓线

- `src/renderer/components/Settings.tsx`

---

## 分工总表

| 工作包 | 建议负责人 | 责任范围 | 不可碰 | 完成标志 |
|---|---|---|---|---|
| 包 A：页面头部统一包 | 主 rollout 或一个 worker | 各页 header 换成 `PageHeaderShell`，补 `PageBodyShell` 边界 | 页面真实业务逻辑 | 页头统一，不新增行为回归 |
| 包 B：目录管理页收纳包 | worker 1 | `SkillsManager`、`McpManager` 的工具条 / 列表区 / 市场区 / 详情区分层 | 导入、安装、绑定、删除的逻辑路径 | 页面结构更清晰，详情层 / 局部菜单更收口 |
| 包 C：协作大页减负包 | worker 2 | `CoworkView`、`CoworkSessionDetail`、`SessionHistoryView`、`RoomView` 的壳层与块层归位 | 消息流、广播板、会话状态逻辑 | 大页变薄，局部 overlay 收口，不影响对话 |
| 包 D：移动端降级包 | worker 3 | `Popover` 在移动端降级成 `sheet/page-shell` | 目录读取、模型切换、技能绑定逻辑 | 移动端交互不再“半屏卡住” |
| 包 E：Settings 暂缓包 | 主 rollout 最后处理 | 只在前四包稳定后再继续薄化 | 配置保存、测试连接、模型提交逻辑 | 页面继续变薄，但主链完全不变 |

---

## 推荐实际分工

### 主 rollout

负责：

- 总协调
- 文档维护
- 包 A：页面头部统一包
- 最终集成与验收
- 包 E：`Settings` 暂缓包

原因：

- 页头统一改动分散但风险低，适合主线统筹
- `Settings` 风险最高，必须留在主 rollout 手里

### Subagent / Worker 1

负责：

- 包 B：目录管理页收纳包

具体目标：

- `SkillsManager` 的 `SkillDetailOverlay`
- `SkillsManager` 的 `LocalAddMenu`
- `McpManager` 的列表区 / 市场区外壳分层

### Subagent / Worker 2

负责：

- 包 C：协作大页减负包

具体目标：

- `CoworkSessionDetail` 的 `ImagePreviewModal`
- `CoworkSessionDetail` 的 `SessionActionMenuShell`
- `SessionHistoryView` 的头部与筛选条
- `RoomView` 的头部和角色区分层

### Subagent / Worker 3

负责：

- 包 D：移动端降级包

具体目标：

- `SkillsPopover`
- `FolderSelectorPopover`
- 复核 `ModelSelector`

---

## Chunk 1: 页面头部统一包

### Task 1: 统一页面 header 壳

**Files:**
- Modify: `src/renderer/components/skills/SkillsView.tsx`
- Modify: `src/renderer/components/mcp/McpView.tsx`
- Modify: `src/renderer/components/employeeStore/EmployeeStoreView.tsx`
- Modify: `src/renderer/components/scheduledTasks/ScheduledTasksView.tsx`
- Modify: `src/renderer/components/cowork/SessionHistoryView.tsx`
- Modify: `src/renderer/components/room/RoomView.tsx`
- Reuse: `src/renderer/components/ui/PageHeaderShell.tsx`

- [ ] Step 1: 逐页确认是否仍有重复 header 写法
- [ ] Step 2: 将可安全替换的页头统一接入 `PageHeaderShell`
- [ ] Step 3: 给仍不适合直接接入的页面补注释，标记原因
- [ ] Step 4: 运行 `npm run build:web`
- [ ] Step 5: 提交一个只包含页头统一的 commit

**验收标准：**

- 页头按钮、标题、标题栏位置一致
- 无新增顶部重叠
- 不影响页面正文区滚动

---

## Chunk 2: 目录管理页收纳包

### Task 2: SkillsManager 分区收纳

**Files:**
- Modify: `src/renderer/components/skills/SkillsManager.tsx`
- Reuse: `src/renderer/components/ui/ConfirmDialog.tsx`
- Reuse: `src/renderer/components/ui/ImportDialog.tsx`
- Optional Create: `src/renderer/components/skills/SkillDetailOverlay.tsx`

- [ ] Step 1: 给 `SkillsManager` 标出 `CatalogToolbar` / `InstalledListRegion` / `MarketplaceRegion`
- [ ] Step 2: 把技能详情层从主文件里抽成独立壳，保持原有 props 与行为
- [ ] Step 3: 评估本地添加菜单是否只做“移动端降级”，不改业务逻辑
- [ ] Step 4: 运行 `npm run build:web`
- [ ] Step 5: 提交一个只包含 Skills 收纳的 commit

**验收标准：**

- 技能详情仍可打开、关闭、查看
- 删除、清理、导入逻辑不回归
- 主文件阅读负担下降

### Task 3: McpManager 分区收纳

**Files:**
- Modify: `src/renderer/components/mcp/McpManager.tsx`
- Reuse: `src/renderer/components/ui/ConfirmDialog.tsx`
- Reuse: `src/renderer/components/ui/RolePickerDialog.tsx`
- Reuse: `src/renderer/components/mcp/McpServerFormModal.tsx`

- [ ] Step 1: 标出 `CatalogToolbar` / `InstalledRegion` / `MarketplaceRegion`
- [ ] Step 2: 只做外壳分层，不动安装、删除、绑定实际逻辑
- [ ] Step 3: 确认 portal 数量没有继续增加
- [ ] Step 4: 运行 `npm run build:web`
- [ ] Step 5: 提交一个只包含 MCP 收纳的 commit

**验收标准：**

- 安装、删除、绑定角色行为保持原样
- 页面块层更清楚

---

## Chunk 3: 协作大页减负包

### Task 4: CoworkSessionDetail 局部 overlay 收口

**Files:**
- Modify: `src/renderer/components/cowork/CoworkSessionDetail.tsx`
- Optional Create: `src/renderer/components/cowork/ImagePreviewModal.tsx`
- Optional Create: `src/renderer/components/cowork/SessionActionMenuShell.tsx`

- [ ] Step 1: 只圈定图片预览层和操作菜单层
- [ ] Step 2: 抽离为独立展示壳，保持原有 state 与事件入口
- [ ] Step 3: 不动消息流、不动工具轨迹、不动广播板
- [ ] Step 4: 运行 `npm run build:web`
- [ ] Step 5: 手动验证详情页打开、图片预览、操作菜单

**验收标准：**

- 对话流和滚动行为不变
- 图片预览和菜单显示更稳定

### Task 5: SessionHistory 与 Room 基础分区

**Files:**
- Modify: `src/renderer/components/cowork/SessionHistoryView.tsx`
- Modify: `src/renderer/components/room/RoomView.tsx`
- Reuse: `src/renderer/components/ui/PageHeaderShell.tsx`

- [ ] Step 1: 给 `SessionHistoryView` 接 `PageHeaderShell`
- [ ] Step 2: 把筛选条明确为 `HistoryFilterBar`
- [ ] Step 3: 给 `RoomView` 拆出 `RolePickerRegion` 与 `RoomListRegion`
- [ ] Step 4: 运行 `npm run build:web`
- [ ] Step 5: 手动验证历史跳转、房间切换

**验收标准：**

- 页面层级清楚
- 历史进入会话、房间切换仍正常

### Task 6: CoworkView 展示块薄化

**Files:**
- Modify: `src/renderer/components/cowork/CoworkView.tsx`

- [ ] Step 1: 只拆 hero / role strip / recent banner 这类展示块
- [ ] Step 2: 不动入口逻辑与会话创建逻辑
- [ ] Step 3: 运行 `npm run build:web`

**验收标准：**

- 首页布局更清楚
- 不影响开始对话入口

---

## Chunk 4: 移动端降级包

### Task 7: PopoverOrSheet 收口

**Files:**
- Modify: `src/renderer/components/skills/SkillsPopover.tsx`
- Modify: `src/renderer/components/cowork/FolderSelectorPopover.tsx`
- Modify: `src/renderer/components/ModelSelector.tsx`
- Reuse: `src/renderer/components/ui/OptionSheet.tsx`
- Reuse: `src/renderer/components/ui/ModalWrapper.tsx`

- [ ] Step 1: 确认移动端仍残留的桌面 popover
- [ ] Step 2: 把移动端统一降级到 sheet / page-shell
- [ ] Step 3: 桌面端保持原有行为
- [ ] Step 4: 运行 `npm run build:web`
- [ ] Step 5: 手动验证移动端触达路径

**验收标准：**

- 移动端不再出现“半屏卡住”“遮挡点击”
- 桌面端行为不倒退

---

## Chunk 5: Settings 暂缓包

### Task 8: Settings 继续薄化，但只动壳

**Files:**
- Modify: `src/renderer/components/Settings.tsx`
- Reuse: `src/renderer/components/ui/ModalWrapper.tsx`

- [ ] Step 1: 只选择一个面板块继续收纳
- [ ] Step 2: 只拆“导航壳”或“面板块”，不拆保存逻辑
- [ ] Step 3: 运行 `npm run build:web`
- [ ] Step 4: 手动验证配置打开、切换、保存

**验收标准：**

- 配置保存路径完全不变
- 页面文件继续变薄

---

## 推荐开工顺序

1. 包 A：页面头部统一包
2. 包 B：目录管理页收纳包
3. 包 D：移动端降级包
4. 包 C：协作大页减负包
5. 包 E：Settings 暂缓包

原因：

- 先做低风险公共壳，能快速稳定地扩大“收纳盒”覆盖面
- 再处理目录管理页和移动端弹层，收益大、风险适中
- 协作详情页最容易碰到深逻辑，放后面更稳
- `Settings` 永远最后

---

## 执行口令

每个 worker 开工前统一复述一句：

> 我只换装造，不碰根。我只负责我这一箱，越线就停。

---

## 当前阶段一句话

这一轮前端不是继续“造新盒子”，而是：

> 把已经有的盒子，按页、按区、按风险，分配给合适的人去装。
