# 前端提取与收纳一期收口

时间：2026-04-02 02:45:31

## 这一阶段做成了什么

这一轮前端工作，不再是“在原页面上继续补丁”，而是正式进入：

- 抽公共壳
- 收共用组件
- 让页面本体变薄
- 让移动端和桌面端穿不同的衣服

一句话总结：

> 这一阶段已经把前端从“每页各带一套壳”推进到“开始拥有自己的公共收纳系统”。

---

## 已经抽出的公共件

### 1. `ModalWrapper`

文件：

- `src/renderer/components/ui/ModalWrapper.tsx`

当前职责：

- 统一 modal 基座
- 支持移动端 page-shell
- 支持桌面端居中 modal
- 统一 header / content / footer 壳层

当前接入：

- `Settings`
- `CoworkPermissionModal`
- `CoworkQuestionWizard`
- `CoworkSearchModal`
- `FolderSelectorPopover` 中的 `DirectoryBrowser`

### 2. `ConfirmDialog`

文件：

- `src/renderer/components/ui/ConfirmDialog.tsx`

当前职责：

- 统一删除 / 清理 / 危险确认类弹窗

当前接入：

- `ScheduledTasks/DeleteConfirmModal`
- `McpManager` 删除确认
- `Sidebar` 批量删除确认
- `SkillsManager`
  - 删除技能
  - 清理无效
  - 清理重复

### 3. `RolePickerDialog`

文件：

- `src/renderer/components/ui/RolePickerDialog.tsx`

当前职责：

- 统一角色选择类弹窗

当前接入：

- `McpManager` 安装角色选择

### 4. `ImportDialog`

文件：

- `src/renderer/components/ui/ImportDialog.tsx`

当前职责：

- 统一导入类弹窗

当前接入：

- `SkillsManager` 的 GitHub 导入

### 5. `OptionSheet`

文件：

- `src/renderer/components/ui/OptionSheet.tsx`

当前职责：

- 移动端选项列表壳
- 用于“桌面 popover / 移动端 sheet”分流

当前接入：

- `ModelSelector`（移动端）

---

## 已经开始完成“换衣服”的页面 / 组件

### Settings

文件：

- `src/renderer/components/Settings.tsx`

本轮结果：

- 移动端不再沿用桌面双栏
- 进入 page-shell 模式
- 导航改成“当前栏目卡 + 横向切换卡条”
- 内部两个局部 overlay 已迁出：
  - 连接测试结果
  - 添加/编辑模型

当前判断：

- 已从重灾区变成可继续收纳的主战场

### Skills

文件：

- `src/renderer/components/skills/SkillsManager.tsx`
- `src/renderer/components/skills/SkillsPopover.tsx`

本轮结果：

- 技能列表支持前缀分组折叠
- 重复副本可清理
- 导入前单技能边界被钉住
- GitHub 导入弹窗改吃 `ImportDialog`
- 移动端技能选择开始降级成 page-shell

当前判断：

- 已经开始有目录管理壳，但仍然偏胖

### MCP

文件：

- `src/renderer/components/mcp/McpManager.tsx`
- `src/renderer/components/mcp/McpServerFormModal.tsx`

本轮结果：

- 删除确认改吃 `ConfirmDialog`
- 角色选择改吃 `RolePickerDialog`
- MCP 表单弹窗改吃 `ModalWrapper`

当前判断：

- 这一条线已经开始摆脱手写弹窗壳

### Cowork

文件：

- `src/renderer/components/cowork/CoworkPermissionModal.tsx`
- `src/renderer/components/cowork/CoworkQuestionWizard.tsx`
- `src/renderer/components/cowork/CoworkSearchModal.tsx`
- `src/renderer/components/cowork/FolderSelectorPopover.tsx`
- `src/renderer/components/cowork/CoworkView.tsx`

本轮结果：

- 权限确认 / 问答确认 / 搜索弹窗都接入 `ModalWrapper`
- 文件夹选择开始桌面 popover / 移动端 page-shell 分流
- 首页 logo 与移动端 spacing 已收口

当前判断：

- 对话壳层已经明显轻了

### 全局壳层

文件：

- `src/renderer/App.tsx`

本轮结果：

- 顶部全局按钮层和主内容区已统一腾出避让空间

当前判断：

- 这是典型的壳层统一修法，后续适合继续抽成公共 offset 规则

---

## 已经打上的 `{提取}` 地图

已打标位置包括：

- `TopActionsOffsetShell`
- `MobilePageShellModal / DesktopCenteredModal`
- `SettingsMobileShell`
- `SettingsMobileTabStrip`
- `SettingsSubModal`
- `DuplicateSkillGrouping`
- `GroupedCatalogSection`
- `ConfirmDialog`
- `ImportDialog`
- `RolePickerDialog`
- `FolderPickerSheet / DesktopPopover`
- `OptionSheet / DesktopPopover`
- `SkillsPickerSheet / DesktopPopover`

这些标记的意义不是注释好看，而是：

- 后续回头看时，能知道哪里是“应该继续抽壳”的地方
- 不需要重新靠记忆找热点

---

## 这一阶段完成后的判断

当前前端已经从：

- 一页一个壳
- 一弹窗一套写法
- 移动端硬穿桌面衣服

推进到了：

- 开始有统一 modal 基座
- 开始有统一确认壳
- 开始有统一导入壳
- 开始有统一角色选择壳
- 开始有移动端 option / sheet 壳

这说明：

> “提取”这个阶段已经不只是想法，而是已经进入“开始收纳”的状态。

---

## 下一阶段：收纳

下一阶段不建议再盲目继续造新公共件。

优先做：

1. 继续把旧页面里的同类东西搬进现有公共壳
2. 清理还残留的手写 `fixed inset-0`
3. 让桌面 `popover` 在移动端继续降级成 `sheet/page-shell`
4. 评估 `Modal.tsx` 是否还需要继续保留双轨

推荐顺序：

1. `SkillsManager` 剩余本地弹窗继续吃公共壳
2. `McpManager` 剩余弹窗继续吃公共壳
3. `SkillsPopover / FolderSelector / ModelSelector` 继续沿 `PopoverOrSheet` 收口
4. 再回头审 `CoworkSessionDetail` 的局部 overlay

---

## 纪律提醒

后面继续时，仍然遵守：

- 不动根
- 不乱碰主逻辑
- 只换装造
- 只做收纳
- 一次一个组件或一层壳
- 改完立即构建验证

一句话：

> 这一阶段的“提取”已经跑通；下一阶段正式进入“收纳与归位”。
