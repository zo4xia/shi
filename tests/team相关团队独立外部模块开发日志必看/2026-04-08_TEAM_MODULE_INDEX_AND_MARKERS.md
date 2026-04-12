# Team 模块索引与批注地图（2026-04-08）

记录时间：2026-04-08

标签：

- `Team`
- `模块索引`
- `批注`
- `埋点`
- `测试演示版`

## 这份文档做什么

`team` 现在不是成品模块，
也不是普通页面。

它是：

- 开发中的测试演示版
- 客户第一份委托的外挂工作台
- 细节很多、媒体逻辑很多、时间轴逻辑很多的一块复杂面

所以这份文档先不谈“完美抽象”，
先把它当前最值得抓住的模块和批注口径钉住。

---

## 1. 当前 `team` 的模块分层

### 入口层

- `team.html`
- `src/renderer/team-main.tsx`

职责：

- 独立入口
- 挂载 `team-root`
- 单独渲染 Team 页面

### 配置层

- `src/renderer/components/team/teamRuntimeConfig.ts`
- `src/renderer/components/team/teamDemoRuntime.ts`
- `src/renderer/components/team/team.css`
- `src/renderer/types/teamRuntime.ts`

职责：

- 默认任务定义
- 运行时默认值
- 画布参数
- `team` 自己的类型和参数结构
- 演示版 runtime 辅助函数
- `team` 自己的样式层

### 运行时转换层

- `src/renderer/lib/handwriteAdapter.ts`

职责：

- 时间轴组装
- A/B/C/D 运行态转换
- board reveal 进度计算

### 页面层

- `src/renderer/components/team/SingleTaskRunnerPage.tsx`

职责：

- 当前展示壳
- 控件交互
- demo 流程
- 画布 / 时间轴 / A/B/C/D 面板展示

### 资源层

- `public/team-assets/*`

职责：

- 当前 demo 资源
- 白板图 / 手写图 / 预置图片轨

---

## 2. 当前最该加批注的地方

### `team-main.tsx`

要把它明确标成：

- `Team 独立入口壳`
- 不是主家园入口
- 不是总壳

### `teamRuntimeConfig.ts`

要明确标成：

- `team` 自己的默认配置层
- 后续继续解耦时优先往这里收
- 不要再把新常量塞回页面组件

### `teamRuntime.ts`

要明确标成：

- `team` 的 feature-local 类型层
- 这里定义的是外挂自己的参数与媒体结构

### `handwriteAdapter.ts`

要明确标成：

- `team` 的 runtime 转换层
- 时间轴 / 板书块 / reveal 的核心转换在这里
- 后续不能把页面临时逻辑反向塞回来

### `SingleTaskRunnerPage.tsx`

要明确标成：

- 当前是测试演示版工作台
- 这里可以先承载 demo 行为
- 但不该继续成为默认配置仓和运行时算法仓

---

## 3. 当前不要乱动的区域

这几块后续要谨慎，先标记、后拆：

- 时间轴交互
- 画布定位逻辑
- reveal 进度逻辑
- 媒体块尺寸 / 裁剪 / imageUrl 旧轨兼容
- 直接拼 `/api/tts-audio` 的演示链

原因：

- 这些都是细节复杂区
- 现在又正处在开发中的测试演示版阶段
- 先整理结构可以，先不要把演示行为打碎

---

## 4. 下一步最适合继续做的轻整理

1. 给关键文件补“这里是什么层”的注释
2. 给 `team` 做自己的 feature-local service/config 层
3. 列一份 `team` 依赖主服务端哪些接口的最小清单

## 4.1 本轮已完成的小收纳

- 已新增：
  - `src/renderer/components/team/teamDemoRuntime.ts`
  - `src/renderer/components/team/team.css`
- 已把 `SingleTaskRunnerPage.tsx` 中这两个函数抽出：
  - `splitLectureTextToSegments`
  - `buildDemoAudioTimeline`
- 已把 `team-*` 画布 / 板书样式从全局 `index.css` 收束到 `team.css`
- `team-main.tsx` 现在单独引入 `team.css`

这代表：

- 页面层继续变轻
- 演示版 runtime 辅助开始有自己的落点
- 样式层开始 feature-local 化
- 还没动时间轴 / 画布 / 媒体行为核心

---

## 5. 一句话提醒

`team` 要继续长，
但要按“轻小、能拆、能拼、未来能承重”的方式长。

不是小垃圾，
也不是一口气硬做成大怪物。
