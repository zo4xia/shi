# 板书块插入点数据结构 v1

记录时间：2026-04-05 02:25:00

标签：

- `板书轨`
- `插入点`
- `小agent`
- `HandwriteCraft`
- `时间轴`

## 这份文档是干什么的

这份不是抽象讨论。

它是为了正式回答这个问题：

```text
怎么让小 agent 驱动 HandwriteCraft？
```

答案不是让小 agent 直接碰引擎内部，
而是：

- 小 agent 往时间轴线上插板书块
- 再由我们的适配层把板书块翻译成 HandwriteCraft 入参

也就是：

```text
小 agent -> 板书块插入点 -> 适配器 -> HandwriteCraft
```

---

## 1. 总体思路

### A 工位

负责：

- 生成 `audioUrl`
- 生成 `speechTimeline`

### B 工位

负责：

- 在时间轴上决定“哪里该写”
- 输出板书块插入点

### C 工位

负责：

- 接收板书块插入点
- 调 HandwriteCraft 生成对应手写图块
- 在画布里按时间插入显示

---

## 2. 板书块插入点定义

### TypeScript 版本

```ts
type BoardInsertPoint = {
  id: string;
  seat: 'B';
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'write' | 'formula' | 'note';
  sourceRange?: {
    sentenceIndex: number;
    wordStart: number;
    wordEnd: number;
  };
  style: {
    fontSize: number;
    lineSpacing: number;
    wordSpacing: number;
    quality: number;
    inkColor: string;
    backgroundImage?: string;
  };
};
```

### 字段解释

| 字段 | 含义 |
|------|------|
| `id` | 板书块唯一 ID |
| `seat` | 当前由哪个工位产出，第一版固定为 `B` |
| `text` | 要写出来的板书内容 |
| `startTime` | 在总时间轴上何时开始出现 |
| `endTime` | 在总时间轴上何时完成 / 稳定 |
| `x / y` | 板书块左上角位置 |
| `width / height` | 这个块占据的画布区域 |
| `mode` | 板书类型 |
| `sourceRange` | 对应的语音范围（可选） |
| `style` | 交给 HandwriteCraft 的核心样式参数 |

---

## 3. 给 HandwriteCraft 的最小映射

### 适配层不直接吃整个业务对象

而是把 `BoardInsertPoint` 压成最小参数：

```json
{
  "text": "418-118=300",
  "width": 900,
  "height": 220,
  "fontSize": 64,
  "lineSpacing": 78,
  "wordSpacing": 10,
  "inkColor": "#282830",
  "quality": 2
}
```

### 映射规则

| BoardInsertPoint | HandwriteCraft |
|------------------|----------------|
| `text` | `text` |
| `width` | `width` |
| `height` | `height` |
| `style.fontSize` | `font-size` |
| `style.lineSpacing` | `line-spacing` |
| `style.wordSpacing` | `word-spacing` |
| `style.inkColor` | `ink-color` |
| `style.quality` | `quality` |
| `style.backgroundImage` | `background-image` |

也就是说：

- 小 agent 不用懂 HandwriteCraft 全部细节
- 适配器替它完成字段翻译

---

## 4. 时间轴线怎么挂

夏夏现在把时间轴画成一条线，这个方向是对的。

第一版就按这一条线来：

```text
0s ------------------------------------------------------> end
```

在这条线上有两类点：

### 红点

- 语音关键点
- 来自 `speechTimeline`

### 蓝点

- 板书插入点
- 来自 `BoardInsertPoint`

所以：

- `speechTimeline` = 耳朵轨
- `BoardInsertPoint[]` = 手写轨

这两条轨都先挂在**同一根时间线**上，
最容易看清，也最容易调。

---

## 5. 第一版输出示例

### 示例：简算讲解

```json
[
  {
    "id": "board-001",
    "seat": "B",
    "text": "418-170-118",
    "startTime": 360,
    "endTime": 3680,
    "x": 80,
    "y": 120,
    "width": 540,
    "height": 120,
    "mode": "formula",
    "style": {
      "fontSize": 64,
      "lineSpacing": 76,
      "wordSpacing": 12,
      "quality": 2,
      "inkColor": "#282830"
    }
  },
  {
    "id": "board-002",
    "seat": "B",
    "text": "418-118=300",
    "startTime": 14490,
    "endTime": 17090,
    "x": 80,
    "y": 220,
    "width": 520,
    "height": 120,
    "mode": "formula",
    "style": {
      "fontSize": 64,
      "lineSpacing": 76,
      "wordSpacing": 12,
      "quality": 2,
      "inkColor": "#282830"
    }
  },
  {
    "id": "board-003",
    "seat": "B",
    "text": "300-170=130",
    "startTime": 18130,
    "endTime": 20690,
    "x": 80,
    "y": 320,
    "width": 520,
    "height": 120,
    "mode": "formula",
    "style": {
      "fontSize": 64,
      "lineSpacing": 76,
      "wordSpacing": 12,
      "quality": 2,
      "inkColor": "#282830"
    }
  }
]
```

---

## 6. 第一版先不做什么

为了让这条链先跑通，
第一版明确先不做：

- 真逐笔轨迹
- 每一笔单独时间轴
- 超复杂笔锋控制
- 多层分镜

第一版只做：

- 板书块插入点
- 板书块样式参数
- 板书块按时间出现

---

## 6.5 夏夏的小秘密路线

还有一条很适合客户演示的路线：

不是让系统现场生成“真逐笔路径”，
而是：

1. 先准备一张已经很像人工手写的图
2. 小 agent 只负责把这张图放到正确位置
3. 前端再按照时间做“描红式显现”

也就是：

```text
高仿手写图素材 -> 插入点定位 -> 按时间 reveal
```

这条路线的优点：

- 更稳
- 更省时间
- 客户更容易直接感受到“像真人写”

### 这时插入点可以扩一层

如果板书块不只是文字参数，而是直接引用素材图，
那可以扩成：

```ts
type BoardInsertPoint = {
  id: string;
  seat: 'B';
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'write' | 'formula' | 'note';
  imageUrl?: string;
  revealMode?: 'wipe-left-to-right' | 'stroke-fade-segments';
  revealDurationMs?: number;
  pausePoints?: number[];
  sourceRange?: {
    sentenceIndex: number;
    wordStart: number;
    wordEnd: number;
  };
  style: {
    fontSize: number;
    lineSpacing: number;
    wordSpacing: number;
    quality: number;
    inkColor: string;
    backgroundImage?: string;
  };
};
```

### 什么时候走这条路线

如果目标是：

- 先给客户看一个像样的“高仿手写”
- 而不是先做真正完整的笔迹引擎

那就优先走这条路线。

---

## 7. 一句话收束

让小 agent 驱动 HandwriteCraft，
关键不是让它直接操作引擎，
而是让它先学会在时间轴线上插入：

**板书块插入点。**

这就是我们现在最小、最稳、最可控的中间结构。
