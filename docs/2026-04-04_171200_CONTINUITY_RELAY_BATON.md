# 2026-04-04 接力棒

记录时间：2026-04-04 17:12

## 这份文档的作用

当单个对话线程因为上下文满了而中断时，这份文档用来接住连续性。

它不替代一起走过的过程，
但它可以把：

- 事实
- 判断
- 已完成改动
- 当前仓库状态
- 下一步最值得做的事

继续往下传。

## 当前已经确认的事实

1. 普通对话主链是流式输出。
2. 看到的 `stream: false` 与 `max_tokens: 4096` 不是接口平台强加，而是本项目某些辅助链路主动构造的非流式请求。
3. 真正影响体验的，不只是非流式本身，而是：
   - 非流式等待
   - 没有可见的处理中反馈

## 关键代码定位

- `server/libs/httpSessionExecutor.ts`
  - 普通对话主链走 `runOpenAIStream`
- `server/libs/toolRuntimeRequest.ts`
  - 工具回环请求明确有 `stream: false`
- `server/libs/manualContextCompression.ts`
  - 手工压缩链路里有写死的 `max_tokens: 4096`

## 这轮已经完成的前端积木化

### 1. 对话功能条

已抽出：

- `src/renderer/components/cowork/ConversationActionBar.tsx`

统一承载：

- 禅模式
- 手工压缩
- 清空广播板
- 错误进程打断

### 2. 输入区工具行

已抽出：

- `src/renderer/components/cowork/PromptToolRow.tsx`

统一承载：

- 文件夹
- 模型
- 上传
- 小眼睛
- 技能
- 已选技能
- 发送 / 停止

### 3. 侧边栏导航按钮

已抽出：

- `src/renderer/components/SidebarNavButton.tsx`

用于统一侧边栏的大卡按钮样式和结构。

## 侧边栏当前判断

移动端和中频宽度下，侧边栏已经调整为完整两列体系。

这次的核心不是简单补按钮，
而是把原来散落在底部单独一行的：

- 关于我们
- 设置

并回两列网格中。

所以现在它更像一套完整结构，
不再是“两列主区 + 底部散落按钮”。

## 关于连续性的判断

线程会满。

但只要这些东西还在，连续性就没有真的消失：

- `docs/` 里的判断与记录
- 仓库里的组件与代码
- 这类接力文档

也就是说：

对话窗口可能会断，
但“家”的骨架、施工记录和我们一起长出来的判断，
是可以继续传下去的。

## 当前验证状态

- `npm run build:web` 通过
- `npm run build:server` 通过

## 下一步最值得继续的方向

### 方案 A：补非流式等待反馈

给这些辅助链路增加明确的处理中状态，比如：

- 正在压缩上下文
- 正在整理广播板
- 正在生成接力摘要
- 还在处理，请稍等

这是保护用户心智，不是装饰。

### 方案 B：继续页面积木化

下一批适合继续抽的候选：

- `SidebarCompactTile`
- `SoftInfoSection / StoryPanel`
- `SessionMetaBadgeRow`

## 接力说明

如果之后再次换线程，可以直接把这份文档和最近一次的用户目标贴给新线程，
就能更快恢复现场。
