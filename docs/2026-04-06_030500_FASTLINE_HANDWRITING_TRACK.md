# 快线手写图策略

记录时间：2026-04-06 03:05:00

标签：

- `快线`
- `手写图`
- `text-to-handwriting`
- `HandwriteCraft`
- `描红reveal`

## 这份文档是干什么的

把我们刚刚确认的小窍门正式收成方法论：

```text
阿里云给时间，
手写引擎给图，
小 agent 负责排版与节奏，
前端负责描红 reveal。
```

## 1. 双轨

### 快线

- 仓位：
  - `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\text-to-handwriting-master`
- 优点：
  - 出图快
  - 可换字体
  - 适合先做客户演示小样

### 深线

- 仓位：
  - `F:\code\HandwriteCraft-main`
- 优点：
  - 可控度更高
  - 更适合后续精修质感

## 2. 当前判断

先走快线，不等深线成熟。

也就是说：

- 夏夏继续试字体和静态图效果
- 我们这边先把：
  - `imageUrl`
  - `x / y / width / height`
  - `startTime / endTime`
  - `revealMode`
  接进 Team / 白板链

## 3. 现役素材能力

`text-to-handwriting-master` 里已经有字体和网页入口：

- `fonts/YShiWrittenSC-Regular.ttf`
- `fonts/ChenYuluoyan-Thin-Monospaced.ttf`
- `index.html`
- `js/app.mjs`
- `js/generate-images.mjs`

这足够作为：

```text
快线图源研究仓
```

## 4. 当前技术落点

Team 数据结构已经开始接受：

- `imageUrl`
- `revealMode`
- `revealDurationMs`
- `pausePoints`

没有手写图时仍走文本 fallback，
有手写图时就按图片做 reveal。

## 5. 一个很实用的小技巧

当口播里有停顿，
但我们又希望甲方更容易观察到“板书控制是不是对齐”时，
可以把多步算式先并成一行长图。

例如：

```text
288-(44+156)=288-200=88
```

这样做的好处：

- 视觉上更集中
- reveal 时更容易观察整段推进
- 口播虽然有间隔，但画面不会被切得太碎
- 很适合做“控制验证版”

当前这类素材也已经开始收进 Team 资产：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\public\team-assets\board-288-combined.png`

## 6. 一句话收束

快线先出效果，深线慢慢打磨。  
两条线并行，不互相拖。
