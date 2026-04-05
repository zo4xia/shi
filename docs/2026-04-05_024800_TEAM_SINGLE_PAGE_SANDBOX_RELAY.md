# Team 单页沙箱接力记录

记录时间：2026-04-05 02:48:00

最近续跑更新：2026-04-05

标签：

- `Team`
- `单页沙箱`
- `接力`
- `不混旧壳`
- `一页闭环`

## 当前最重要的判断

这条线已经从旧 `App.tsx` 主程序壳里撤出来，
改走真正独立的单页入口：

- `team.html`
- `src/renderer/team-main.tsx`
- `src/renderer/components/team/SingleTaskRunnerPage.tsx`

不再依赖：

- 旧主程序初始化链
- `app_config / im_config / gateway` 那套首屏加载
- 旧侧边栏 / 旧浮层 / 旧多页面主壳

## 续跑后新增事实

- `418-170-118` 最小标准例子已经从“页面硬编码展示”推进到“独立 runtime 数据驱动”
- 下列文件现在已经真实存在并接上页面：
  - `src/renderer/types/teamRuntime.ts`
  - `src/renderer/mock/teamTask.example.json`
  - `src/renderer/lib/handwriteAdapter.ts`
  - `tests/web/teamRuntime.test.ts`
- `SingleTaskRunnerPage.tsx` 已改成读取上述 runtime 数据，不再把 A/B/C 最小例子全写死在页面里
- 播放按钮现在会真实推进 `currentMs`，因此 C 画布区会随着时间轴跑出对应板书块

## 当前入口

预览地址：

- `http://127.0.0.1:5178/team.html`

已确认返回：

- `200`

## 当前页面结构

### 单页布局

- 左侧：A / B / C / D 实时状态卡 + API 配置
- 右侧：单任务运行区

### 右侧运行区

#### 画板上方三列纵向排

1. 左列
   - `task_id`
   - 当前题目
   - 保存路径

2. 中列
   - 时间轴条
   - 红点 / 蓝点
   - 当前游标
   - 点详情编辑

3. 右列
   - 录制完毕
   - 是否合格
   - 合格存档
   - 播放 / 暂停 / 重置
   - 自动录屏
   - 音频同步笔迹

#### 画布区

- 尺寸：`960 × 640`
- 横屏
- 蓝色边框：`3px`

## 当前已经有的真实能力

### 1. 时间轴点

- 红点 / 蓝点已能显示
- 点中后可编辑：
  - label
  - startTime
  - endTime
  - speed

### 2. 应用按钮

已不是摆设，
现在会真实改回当前页面里的时间轴数据。

### 3. 画布激活块

当前会按：

- `currentMs`
- `boardTimeline`

筛出激活块并显示在画布上。

### 4. 最小标准例子 A -> C 已有数据闭环

- A：语音轴来自 `teamTask.example.json`
- B：板书步骤来自 `teamTask.example.json`
- C：`handwriteAdapter.ts` 会把 A/B 组装成页面 runtime，并按 `currentMs` 驱动画布显示
- 页面里的播放按钮会自动推进游标，不再只是切换按钮文案

### 5. 已有最小验证

- `node --import tsx --test tests/web/teamRuntime.test.ts`
- 当前断言已覆盖：
  - runtime 是否生成出 `speech + 3 个 board`
  - A/B/C/D 状态是否按最小标准例子落位
  - `currentMs` 在不同时间点时，C 画布能否拿到正确激活块

## 当前程序抓手

### 类型

- `src/renderer/types/teamRuntime.ts`

### 示例数据

- `src/renderer/mock/teamTask.example.json`

### 适配器

- `src/renderer/lib/handwriteAdapter.ts`

### 最小验证

- `tests/web/teamRuntime.test.ts`

## 当前最关键的下一步

最小标准例子 `418-170-118` 的 A -> C 前端数据闭环已经打通。

下一步别回头重做壳，而是只往更真实的链路推进：

1. 把 C 从“文本块显示”推进到“真板书轨迹/逐笔数据”
2. 视情况再决定是否把 A 或 B 接到真实后端输出
3. 继续保持单页入口，不并回旧 `App.tsx`

## 先不做

- 多任务列表页
- 旧 TeamView 再修
- 主程序壳并回
- 真逐笔轨迹
- 完整客户后台

## 一句话入口

下次回来先记住：

> 继续 `team-single-page-sandbox`，不要回旧壳。  
> 入口是 `http://127.0.0.1:5178/team.html`。  
> 目标是把 `418-170-118` 这个最小标准例子从 A 跑到 C。
