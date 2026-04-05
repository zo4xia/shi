# baiban TTS 预览壳已接上

记录时间：2026-04-05 00:08:00

标签：

- `baiban`
- `前端皮套`
- `TTS 时间轴`
- `预览壳`
- `构建通过`

## 本轮确认

`C:\Users\Administrator\Desktop\baiban` 不是空壳，
它本来就有现成前端：

- 入口：`src/app/page.tsx`
- 已有 Socket.IO 连接：`3003`
- 已有旧链：`generate-script`

因此这轮没有另起一个新前端，
而是直接在现有皮套里并排接入：

```text
generate-tts-timeline
```

## 本轮实际落地

### 1. 现有页面已接入最小 TTS 预览区

文件：

- `C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`

已新增能力：

- 文本输入
- 语音角色输入
- 生成 `audio + word_timeline`
- 播放 / 暂停 / 重置
- 逐字高亮
- 原始 JSON 摘要预览

口径：

- 不替换旧 `generate-script`
- 只是并排增加最小沙箱入口

### 2. 这轮补了 4 个护栏

为了不被旧抽象卡住，直接在我们自己的链路上收口：

1. 请求关联
   - 前端发 `clientRequestId`
   - 后端原样带回
   - 前端只接当前这次请求的结果
2. 专用错误事件
   - `tts-timeline-error`
   - 不再复用全局 `error`
3. 时间轴归一化
   - 收到结果后先排序
   - 必要时把秒级转成毫秒
4. 音频 ready 后再放行
   - 不是一收到 URL 就算 ready
   - 而是等 `Audio` 可播放后再进入 ready

### 3. 微服务已同步更新

文件：

- `C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\index.ts`

已更新：

- `generate-tts-timeline` 支持 `clientRequestId`
- 成功走 `tts-timeline-ready`
- 失败走 `tts-timeline-error`

## 验证结果

### A. 前端构建已通过

这台 Windows 机器直接用 PowerShell 跑 `bun run build` 会卡在脚本里的：

- `cp -r`

因此本轮验证采用：

- `F:\Git\git-bash.exe`

通过 Git Bash 执行后，
`baiban` 构建脚本已跑通。

### B. 微服务事件仍可用

用本地脚本再次实测：

- `generate-tts-timeline`

结果：

- 成功返回 `audio.url`
- 成功返回首句 `13` 个字/标点时间片
- 说明加护栏后主功能没有被拧坏

## 当前现场

当前已经不是“只有接口探针”，
而是：

- 现成前端皮套已接上
- 构建通过
- 服务事件可用

也就是说，
已经具备继续做“真实预览”的地基。

## 下一步建议

1. 起 `baiban` 前端 dev
2. 打开真实页面
3. 手点验证：
   - 生成
   - 播放
   - 逐字高亮
   - 错误态
4. 之后再决定是否接白板板书块联动

## 一句话结论

现在这条线已经从“后端闭环”进入“前端壳已接上”的阶段，
不是空想，
可以继续往真实可见的沙箱走。
