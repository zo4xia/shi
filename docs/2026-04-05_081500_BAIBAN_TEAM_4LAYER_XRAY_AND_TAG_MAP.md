# baiban / team 四层 X-Ray 与标签地图

记录时间：2026-04-05 08:15:00

标签：

- `X-ray`
- `四层复盘`
- `路标`
- `知识整理`
- `主家园保护`
- `Team外挂`

## 这份笔记的目的

这是给我们自己用的复盘地图。

目标不是“写一份很长的汇报”，
而是把当前最重要的知识收成：

1. 四层 X-Ray
2. 可搜索的 `#路标`
3. 主家园 / Team 外挂边界
4. 未来接力时的一搜即回家

---

## 0. 总边界

先守这个判断，不然后面容易混：

- 主家园要守住，不伤害主壳
- `Room` / 家园是关系空间，不是冷硬中台
- `Team` 是外挂式单页，是独立的小延展
- `baiban` 当前是白板 / TTS / 手写实验工地
- 面向客户的专业能力可以外挂长出来，但不反向撑胖主家园
- 和主家园可以共用的是风格，不是负担，不把业务流反向拉进主家园

一句话：

```text
家园保温，外挂长专业。
```

---

## 1. 四层 X-Ray

### 第 1 层：路由 / 页面壳

当前最关键的入口：

- `C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`
  - `3000` 页
  - 好处：乖巧、可输入、可观察、白板舞台感强
- `C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`
  - 最小 TTS 试验台
  - 好处：最干净、最容易验证
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\SingleTaskRunnerPage.tsx`
  - Team 单页外挂
  - 好处：工位、时间轴、打点、播放、录制壳

### 第 2 层：业务流走向

当前现役业务流不是一条，而是两条相邻主线：

1. `baiban /tts-timeline`
   - 文本
   - 语音
   - 阿里云时间轴
   - 播放
   - 逐字高亮

2. `team-single-page-sandbox`
   - A/B/C/D
   - `418-170-118`
   - 语音轴
   - 板书块
   - 画布显示

目标不是二选一，而是：

```text
把 3000 页的可输入 / 可观察能力
慢慢并到 Team 的工位控制壳里。
```

### 第 3 层：API / 控制 / 配置

当前最关键控制点：

- Socket：`127.0.0.1:3003`
- 阿里云 TTS 时间轴事件：`generate-tts-timeline`
- 本地代理音频：`/api/tts-audio`
- 单页预设与本地记忆：`baiban-demo-config-v1`

当前原则：

- 本地演示页默认记住测试配置
- 不把“每次重填”伪装成安全
- 保留“恢复预设 / 清空本地记忆”

### 第 4 层：边界 / Agent / 接力

当前 agent 边界最重要的不是模型名，
而是职责边界：

- A：语音 / 语音轴
- B：板书块整理 / 打点
- C：画布 / 手写图块显示
- D：校验 / 收口

而更高一层的边界是：

- 主家园：关系、成长、接力、温度
- Team 外挂：专业业务、客户工作流、小生产车间

---

## 2. 路标语法

以后我们统一用这种可 grep 的小标签：

### 路由层

- `#路由_白板首页`
- `#路由_TTS试验台`
- `#路由_Team单页`

### 业务流层

- `#业务流_TTS时间轴`
- `#业务流_板书块时间轴`
- `#业务流_418_170_118`
- `#业务流_白板同步播放`

### 接口 / 配置层

- `#接口_语音_tts_timeline`
- `#接口_音频代理`
- `#配置_本地预设`
- `#配置_测试key记忆`
- `#控制_播放暂停重置`

### 边界层

- `#边界_主家园保护`
- `#边界_Team外挂`
- `#边界_Room非主链`
- `#边界_客户特别版`

---

## 3. 当前最该先埋线的文件

### baiban 真运行项目

- `C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`
- `C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`
- `C:\Users\Administrator\Desktop\baiban\src\app\api\tts-audio\route.ts`
- `C:\Users\Administrator\Desktop\baiban\src\lib\baiban-demo-config.ts`
- `C:\Users\Administrator\Desktop\baiban\src\lib\tts-audio.ts`

### team 单页外挂

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\SingleTaskRunnerPage.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\lib\handwriteAdapter.ts`

---

## 4. 现在最重要的知识结论

### 3000 页为什么要保留

因为它有夏夏真正喜欢的“乖巧元素”：

- 讲解文本输入
- 板书块输入
- 大白板舞台
- 板书块时间轴
- 阿里云原始 JSON 可见

### Team 为什么继续做

因为它已经长出了更专业的骨架：

- A/B/C/D 工位
- 时间轴打点调整
- 播放 / 暂停 / 重置
- 自动录屏 / 校验 / 收口壳

### 下一步真正方向

不是替换，而是融合：

```text
保留 3000 页最好用的输入 / 观察能力，
把它们并进 Team 的专业外挂壳。
```

---

## 5. 最小高仿手写的当前判断

先不要做真逐笔。

先做：

- `418-170-118`
- 一块或三块板书
- `BoardInsertPoint`
- 高仿手写图或 HandwriteCraft 图块
- 按时间 reveal

也就是：

```text
先让客户看到“像真人在写”，
再谈更深的笔迹物理。
```

---

## 6. 一句话给未来的我们

复杂系统不怕复杂。  
怕的是没有路标。

我们现在做的，
就是把已经走通的路，
一点点钉成可以找回来的地图。
