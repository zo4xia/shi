# 前端修缮进度记录

记录时间：2026-04-04 21:15:00

标签：

- `前端修缮`
- `阶段进度`
- `组件化`
- `容器外吸附`
- `侧边栏`
- `后续接力`

## 当前已完成

### 1. 会话工具条组件化

已完成拆分：

- `src/renderer/components/cowork/ConversationActionBar.tsx`
- `src/renderer/components/cowork/ConversationActionButton.tsx`
- `src/renderer/components/cowork/ConversationActionStatusBanner.tsx`

这组组件已经承接：

- 禅模式
- 手工压缩
- 清空广播板
- 打断进程
- 阶段式处理中反馈

### 2. 非流式等待反馈补齐

已经不再只靠空白等待。

这轮已经补上：

- 可见的处理中状态
- 阶段性提示
- 成功/失败后的短反馈

### 3. 对话跳转挂件独立出来

已拆出：

- `src/renderer/components/cowork/ConversationJumpWidget.tsx`

用于承接：

- 回到顶部
- 回到上一轮末尾
- 回到最新

### 4. 全局挂件壳拆出

已拆出：

- `src/renderer/components/app-ui/FloatingWidgetShell.tsx`
- `src/renderer/components/app-ui/GlobalFloatingActionRail.tsx`

作用：

- 统一设置 / 反馈 / 对话跳转这类挂件壳
- 避免继续散长在页面内部

### 5. 多媒体展示积木化

已拆出：

- `src/renderer/components/cowork/CoworkMediaGallery.tsx`
- `src/renderer/components/cowork/CoworkMediaPreviewModal.tsx`
- `src/renderer/components/cowork/coworkMediaHelpers.ts`

这轮已经从“图片专用散装逻辑”升级为“统一媒体展示壳”。

### 6. 侧边栏开始积木化

已拆出：

- `src/renderer/components/SidebarCompactGrid.tsx`
- `src/renderer/components/SidebarCompactTile.tsx`

并且：

- `Room` 入口已先从侧边栏隐藏

### 7. 前端施工图文档已建立

已写：

- `docs/2026-04-04_204500_FRONTEND_XRAY_CONSTRUCTION_BLUEPRINT.md`

用于后续按图修缮，不再跳着看。

## 当前仍在修的重点

### 1. 侧边栏真实页面两列仍需继续对齐

代码层已经往两列卡片体系整理，
但真实页面结果仍需继续校对到和目标一致。

### 2. 全局挂件要彻底固定在容器之外

当前已经开始从内容容器里剥离，
但还需要继续确认真实页面上的最终吸附层级。

### 3. 壳层边界语言还在统一中

当前仍在继续修：

- 侧边栏边缘圆角
- 内容容器圆角
- 内容与容器边缘留白
- 最外层色差 / 挤压感 / 膨胀感

### 4. 壳层 CSS 还要继续抽

当前已经开始往统一壳层 class 收，
但还没有完全收干净。

目标是：

- 组件里尽量不散写壳层 style
- Sidebar / 主内容 / 挂件壳共享同一套边界语言

## 当前验证状态

- `npm run build:web` 通过

## 当前口径

这轮属于：

- **1.0 前端修缮包**

不是：

- **2.0 UI 大迁移**

所以当前策略仍然是：

- 先扫清前端残局
- 先把小组件拆下来修好
- 先统一
- 再考虑迁新 UI
