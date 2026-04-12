# HandwriteCraft 参数大全

记录时间：2026-04-05 02:15:00

标签：

- `HandwriteCraft`
- `参数大全`
- `手写引擎`
- `控制面板`
- `小agent`

## 这份文档是干什么的

这不是 README 摘抄。

这是给我们自己接手写引擎时用的：

- 哪些参数现成能调
- 哪些参数适合开放给小 agent
- 哪些参数先别放给小 agent 乱动

目标是：

- 先把手写层变成一个**可控的生成器**
- 不是一头撞进“真逐笔引擎”

---

## 1. 现成命令行可调参数

来源：

- `F:\code\HandwriteCraft-main\HandwriteCraft-main\backend\src\handwrite_generator.py`
- `F:\code\HandwriteCraft-main\HandwriteCraft-main\backend\src\handwrite_generator_fast.py`
- `F:\code\HandwriteCraft-main\HandwriteCraft-main\backend\src\handwrite_generator_ultra.py`

### 文字输入

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `--text` | 直接输入要写的文字 | 无 |
| `--text-file` | 从文件读取文字 | 无 |

### 排版尺寸

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `--font-size` | 字体大小 | `36` |
| `--line-spacing` | 行距 | `55` |
| `--word-spacing` | 字间距 | `3` |
| `--margin-left` | 左边距 | `50` |
| `--margin-top` | 上边距 | `60` |
| `--margin-right` | 右边距 | `50` |
| `--margin-bottom` | 下边距 | `60` |

### 输出尺寸与文件

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `--output` | 输出文件路径 | `output_handwrite.png` |
| `--width` | 输出宽度 | `1200` |
| `--height` | 输出高度 | `1600` |

### 视觉样式

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `--font` | 字体文件路径 | 默认内置字体 |
| `--ink-color` | 墨水颜色 | `#282830` |
| `--transparent` | 透明背景 | 关闭 |
| `--background-image` | 背景图片或 PDF | 无 |

### 清晰度与扰动

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `--quality` | 超采样倍率 / 清晰度 | `3` |
| `--font-size-sigma` | 字体大小波动 | `1.2` |
| `--line-spacing-sigma` | 行距波动 | `1.5` |
| `--word-spacing-sigma` | 字间距波动 | `1.0` |
| `--perturb-theta-sigma` | 旋转角度波动 | `0.015` |
| `--elastic-alpha` | 弹性变形强度 | `80` |
| `--elastic-sigma` | 弹性变形平滑度 | `12` |

### 布局控制

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `--regions` | 区域渲染 JSON | 无 |
| `--auto-indent` | 自动首行缩进 | 开 |
| `--no-indent` | 关闭自动缩进 | 关 |
| `--fast` | 启用极速模式 | 关 |

### 快速版 / 极速版额外可调

| 参数 | 文件 | 作用 |
|------|------|------|
| `--benchmark` | `fast` / `ultra` | 跑基准测试 |
| `--quality` | `fast` / `ultra` | 手动固定超采样 |

---

## 2. 代码层风格开关

这些参数没有全部暴露到命令行，
但我们可以在后面包装成自己的可配接口。

### 字重变化

| 参数 | 作用 |
|------|------|
| `ENABLE_WEIGHT_VARIATION` | 开关：启用字重变化 |
| `WEIGHT_VARIATION_RANGE` | 膨胀 / 腐蚀范围 |
| `WEIGHT_VARIATION_PROB` | 应用概率 |

### 基线波动

| 参数 | 作用 |
|------|------|
| `ENABLE_BASELINE_WAVY` | 开关：启用基线波动 |
| `BASELINE_AMPLITUDE` | 波动幅度 |
| `BASELINE_FREQUENCY` | 波动频率 |

### 飞白 / 干笔

| 参数 | 作用 |
|------|------|
| `ENABLE_DRY_BRUSH` | 开关：启用飞白 |
| `DRY_BRUSH_PROB` | 飞白概率 |
| `DRY_BRUSH_DIRECTION` | 飞白方向 |

### 墨点

| 参数 | 作用 |
|------|------|
| `ENABLE_INK_BLOTS` | 开关：启用随机墨点 |
| `INK_BLOT_COUNT` | 墨点数量 |
| `INK_BLOT_SIZE_RANGE` | 墨点大小范围 |
| `INK_BLOT_OPACITY_RANGE` | 墨点透明度范围 |

### 连笔

| 参数 | 作用 |
|------|------|
| `ENABLE_LIGATURES` | 开关：启用连笔效果 |
| `LIGATURE_PAIRS` | 常见连笔字对 |
| `LIGATURE_SPACING_FACTOR` | 连笔时字间距缩减比例 |

### 墨水浓度

| 参数 | 作用 |
|------|------|
| `ENABLE_INK_GRADIENT` | 开关：启用墨水浓淡变化 |
| `INK_GRADIENT_RANGE` | 墨水浓度变化范围 |

---

## 3. 快速版 / 极速版额外能力

### fast 版偏重

- 自适应质量
- OpenCL / OpenCV 加速
- 快速插值
- 并行处理
- 缓存字体

对应参数：

| 参数 | 作用 |
|------|------|
| `USE_ADAPTIVE_QUALITY` | 按字体大小自动选质量 |
| `MIN_QUALITY` / `MAX_QUALITY` | 自适应质量上下界 |
| `QUALITY_THRESHOLD_SMALL` / `QUALITY_THRESHOLD_LARGE` | 阈值 |
| `USE_OPENCL` | 是否启用 OpenCL |
| `USE_FAST_INTERPOLATION` | 是否用快速插值 |
| `USE_SEPARABLE_BLUR` | 是否使用可分离模糊 |
| `USE_PARALLEL` | 是否并行 |
| `MAX_WORKERS` | 最大线程数 |

### ultra 版偏重

- 极简基线波动
- 低成本飞白
- 极简弹性
- 更快的输出

对应参数：

| 参数 | 作用 |
|------|------|
| `BASELINE_AMP` | 基线波动幅度 |
| `DRY_BRUSH_PROB` | 飞白概率 |
| `ENABLE_ELASTIC` | 弹性变形开关 |
| `ELASTIC_ALPHA` | 弹性强度 |
| `ELASTIC_SIGMA` | 弹性平滑度 |
| `QUALITY` | 可手动固定质量，否则按字体大小自动 |

---

## 4. 给小 agent 开放的第一批参数

这一批最值得先开放，
因为能直接影响结果，又不容易把东西搞炸。

### 建议开放

| 参数 | 为什么 |
|------|--------|
| `text` | 核心输入 |
| `width` / `height` | 决定画布块尺寸 |
| `font-size` | 影响可读性 |
| `line-spacing` | 影响竖式/多行观感 |
| `word-spacing` | 影响数字与符号间距 |
| `ink-color` | 影响视觉风格 |
| `quality` | 影响清晰度与成本 |
| `regions` | 决定写在哪块区域 |
| `background-image` | 如果要贴到白板背景上 |
| `voice` / `format` | 仅在我们自己的 A 工位里配合 TTS 使用 |

### 建议先锁住

| 参数 | 原因 |
|------|------|
| `WEIGHT_VARIATION_RANGE` | 太细，第一版容易乱 |
| `BASELINE_FREQUENCY` | 不直观，容易把字搞怪 |
| `INK_BLOT_*` | 容易一不小心过头 |
| `LIGATURE_PAIRS` | 汉字连笔规则复杂，先别放开 |
| `USE_OPENCL / 并行` | 先由我们自己控，不让 agent 乱改性能策略 |

---

## 5. 第一版最小控制面板建议

如果我们要做“手写控制员”小 agent，
第一版控制面板只放这几个就够：

```json
{
  "text": "418-118=300",
  "width": 900,
  "height": 220,
  "fontSize": 64,
  "lineSpacing": 78,
  "wordSpacing": 10,
  "inkColor": "#282830",
  "quality": 2,
  "backgroundImage": "",
  "regions": []
}
```

这已经足够让：

- 单条算式
- 多行竖式
- 一块局部板书

长出“像人在写”的感觉。

---

## 6. 对我们现在最重要的结论

### HandwriteCraft 适合当什么

它适合当：

- **手写块生成器**

它不适合当：

- 时间轴引擎
- 工位调度器
- 真逐笔系统

### 对我们最重要的 3 组参数

1. **布局组**
   - `width`
   - `height`
   - `regions`

2. **字形组**
   - `font-size`
   - `line-spacing`
   - `word-spacing`

3. **质感组**
   - `ink-color`
   - `quality`
   - `fast`

---

## 一句话收束

HandwriteCraft 不是一个“不能碰的黑箱”。  
它其实是一个可参数化程度很高的手写块生成器。  
我们完全可以让一个小 agent 先控制它最核心的参数，再慢慢放开更细的风格开关。
