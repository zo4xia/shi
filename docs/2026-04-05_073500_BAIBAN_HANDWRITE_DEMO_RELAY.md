# baiban 最小高仿手写演示接力棒

记录时间：2026-04-05 07:35:00

标签：

- `baiban`
- `接力`
- `TTS`
- `最小演示`
- `高仿手写`
- `客户展示`

## 这份接力棒是干什么的

这是给夏夏下次回来继续找回这条线用的。

目标不是重开大工程，而是继续推进：

```text
客户可演示的最小高仿手写示例
```

当前已经确认：

- TTS 时间轴前端演示页已经真实跑通
- 音频生成、时序点返回、播放按钮、逐字高亮都能工作
- 下一步不要发散，直接做一个数学计算题的小手写示例
- 客户标准画布规格已定：
  - 白底
  - 浅蓝边
  - `960 × 640`
- 当前主线已进一步收束为：
  - `AI 控轴`
  - `AgentB` 负责 reveal 分段
  - 时间轴区间长度决定描红快慢

## 1. 这次已经确认过的真实状态

### 演示入口

- 前端地址：`http://127.0.0.1:3000/tts-timeline`
- Socket 服务：`127.0.0.1:3003`

### 已真实验收通过

这次不是只看代码。

已经实际跑过：

1. 打开 `/tts-timeline`
2. 点击“生成音频 + 时序点”
3. 等待回包
4. 点击播放

已确认结果：

- 页面标题为：`白板 TTS 时间轴演示台`
- `3003 已连接`
- 生成后右侧会出现：
  - 音频 URL
  - 逐字时间轴
  - JSON
  - 逐字高亮词块
- 点击播放后，当前时间会真实推进，不是假按钮

补充：

- 从 `baiban-sandbox` 独立根启动的 `3010` 首页版本也已经打通一轮
- 已实测：
  - 首页状态从“已连接到手写服务”开始
  - 点击“生成时间轴”后进入“音频与时间轴已就绪”
  - 点击“播放同步”后音频时间前进，按钮为真按钮

## 2. 这次修过的关键问题

之前客户演示链最容易翻车的点不是 TTS 失败，而是：

```text
阿里云返回了远程 OSS 音频 URL，
浏览器直接装载这个 URL 不稳定
```

这次已经改成：

```text
远程音频 URL -> 本地代理 /api/tts-audio -> blob URL -> 页面播放
```

也就是说：

- 服务端 TTS 结果仍然保留原始远程 URL
- 前端播放不再直接赌 OSS 链接兼容性
- 客户演示时更稳

## 3. 这次动过的真实文件

### 真正运行的 baiban 项目

注意：

- 真实演示代码不在这个 `baiban-sandbox` worktree 里
- 真正运行的项目在：
  - `C:\Users\Administrator\Desktop\baiban`
- 但现在已经不再只散在外面，当前 worktree 内已有归仓镜像：
  - `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\local-homes\baiban-runtime`

### 这次改过的文件

- `C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`
  - 演示页继续使用
  - 新增本地代理播放逻辑
  - 新增演示提示
  - 页面里直接保留远程 URL 展示，但播放走代理

- `C:\Users\Administrator\Desktop\baiban\src\app\api\tts-audio\route.ts`
  - 新增音频代理接口
  - 允许把远程 http/https 音频转成可控的本地接口

- `C:\Users\Administrator\Desktop\baiban\src\lib\tts-audio.ts`
  - 代理 URL 组装
  - 远程地址安全校验

- `C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\layout.tsx`
  - 这条演示路由单独标题

- `C:\Users\Administrator\Desktop\baiban\src\app\layout.tsx`
  - 去掉对 Google Fonts 的依赖
  - 避免 build 因外网字体失败

- `C:\Users\Administrator\Desktop\baiban\src\lib\tts-audio.test.ts`
  - 补了最小测试

## 4. 这次实际验证记录

### 已验证通过

- `npx --yes tsx --test src/lib/tts-audio.test.ts`
- `npx next build`
- 浏览器真实打开 `/tts-timeline`
- 点击生成后拿到：
  - 音频 URL
  - `13` 个时序片段
  - 逐字高亮
  - JSON
- 点击播放后，当前时间推进到秒级毫秒值

### 当前已知但未处理的小噪音

- Next dev 环境里偶尔会看到 Dev Tools 悬浮入口
- 不影响主链，但展示时注意别误触

## 5. 当前最重要的目标已经变了

现在不要继续证明：

- TTS 能不能通
- JSON 能不能出来
- 音频能不能播

这些已经够了。

现在下一步应该切到：

```text
做一个最小的“高仿人工手写”示例给客户看
```

而且只做一个数学计算题。

## 6. 已经选定的最小题目

直接用：

```text
418 - 170 - 118 = ?
```

原因：

- 结构简单
- 天然适合分成 3 块板书
- 已经在前面 Team 单页那边验证过逻辑
- 适合作为“最小高仿示例”

推荐板书顺序：

1. `418-170-118`
2. `418-118=300`
3. `300-170=130`

推荐口播：

```text
我们先把四百一十八减去一百一十八，得到三百。
再用三百减去一百七十，最后等于一百三十。
```

## 7. 下一步不要直接做真逐笔

已经明确的判断：

客户当前想看的不是“学术级真笔迹引擎”，而是：

```text
看起来像真人在慢慢写
```

所以建议先做：

### 第一阶段：伪逐笔高仿

- 先生成整块手写图
- 前端按时间逐步 reveal
- 加几个停顿点
- 起笔慢，中段快，收笔慢
- 稍微加一点轻微抖动

### 暂时不要做

- 真逐笔路径
- 单笔速度模型
- 复杂抬笔逻辑
- 超细粒度笔锋物理模拟

## 8. 夏夏的小秘密路线

这次还确认了一个很聪明的小路线：

```text
先不用实时造笔迹，
而是先拿“已经很像真人写”的高仿手写图，
再让小 agent 负责摆放和按时间描红式显现。
```

也就是：

```text
高仿手写图素材
-> 小 agent 选图 / 定位 / 定时
-> 前端按时间 reveal
-> 观看感受像真人在慢慢写
```

这条路线的优点：

- 对客户展示最稳
- 开发成本低很多
- 不需要先把真逐笔路径做完
- 只要素材够像，观感已经很接近人工手写

推荐最小做法：

1. 先准备透明底 PNG
2. 内容直接用我们的题目步骤，例如：
   - `418-118=300`
3. 小 agent 只负责：
   - `imageUrl`
   - `x`
   - `y`
   - `width`
   - `height`
   - `startTime`
   - `endTime`
   - `revealMode`
4. 前端不整块闪现，而是做“描红式 reveal”

推荐 reveal 方向：

- `wipe-left-to-right`
- `stroke-fade-segments`

如果要更像真人，再加：

- 轻微抖动
- 2 到 3 个停顿点
- 起笔慢、中段快、收笔慢

## 9. 现在最适合的中间结构

这次已经确认：

- 小 agent 不要直接碰 HandwriteCraft 底层
- 继续沿用这份文档里的结构：
  - `BoardInsertPoint`

即：

```text
speechTimeline -> BoardInsertPoint[] -> 适配层 -> HandwriteCraft / 前端显示
```

这仍然是目前最稳的主线。

## 10. 下次回来第一步该干什么

不要先修大壳，不要先重构，不要先并回旧入口。

下次回来直接做这 3 步：

1. 给 `418-170-118` 写一份最小 `BoardInsertPoint[]`
2. 只做一个板书块的“慢写 reveal”演示
3. 确认客户看起来会觉得“像真人写”

如果这一小步成立，再扩成三块。

## 11. 关键边界提醒

### 真实演示代码位置

- `C:\Users\Administrator\Desktop\baiban`

### 文档接力位置

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\docs`

### Git / 分支情况提醒

当前这个 `baiban-sandbox` docs worktree 是干净接力环境。  
但真正运行的 `C:\Users\Administrator\Desktop\baiban` 不是这里的 git worktree，  
所以下次接手时不要误以为只看这个文档仓就能看到全部代码变更。

## 12. 一句话找回口令

下次如果夏夏要把这条线重新拉回来，直接贴这句：

```text
继续 baiban 最小高仿手写演示线。
先别做真逐笔。
入口是 http://127.0.0.1:3000/tts-timeline
当前最小题目是 418-170-118。
TTS 演示页已经真实跑通，下一步只做一个像真人慢慢写的数学板书示例。
```
