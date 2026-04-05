# TTS 时间轴最小试验台已独立成页

记录时间：2026-04-05 00:18:00

标签：

- `baiban`
- `最小试验台`
- `独立路由`
- `audio_url`
- `word_timeline`

## 本轮目的

把第一小步从“大白板页面里的一个区块”收成：

```text
文本框输入 -> 生成音频 -> 输出 audioUrl + 时序点
```

不再被大白板、录制、板书、Canvas 绑住。

## 本轮新增

### 1. 独立路由页

新增页面：

- `C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`

当前访问地址：

- `http://localhost:3000/tts-timeline`

页面内容只保留最小闭环：

- 文本输入框
- 语音角色
- 输出格式（当前先用 `wav/mp3` 输入控制）
- 生成按钮
- 播放 / 暂停 / 重置
- 音频 URL
- 逐字高亮
- 时序点 JSON

### 2. 时序工具收口

新增工具文件：

- `C:\Users\Administrator\Desktop\baiban\src\lib\tts-timeline.ts`

已收口：

- `TtsTimelineResult` 类型
- 时间轴归一化
- 扁平化字词列表
- 当前高亮字词索引计算

这样后面不管接白板、手写块还是别的预览壳，
都可以复用这条内部主线，不用再散写。

## 当前验证

### 页面可访问

已确认：

- `http://127.0.0.1:3000/tts-timeline`
- 返回 `200`

### 构建通过

仍通过这台机子的 Git Bash 路径执行：

- `F:\Git\git-bash.exe`

`bun run build` 已可通过。

## 现在的内部主线

当前已经可以明确成这一条：

```text
用户文本输入
-> generate-tts-timeline
-> audio.url + sentences[].words[]
-> 前端播放
-> currentTime 对 beginTime / endTime
-> 逐字高亮
```

## 下一步

1. 手点验证新页面真实交互
2. 如果顺，再把“当前高亮字”映射为后续板书块
3. 仍然先不碰 MP4

## 一句话结论

第一小步已经从“大系统的一部分”变成了“单独可跑的最小试验台”，
后面继续迭代会轻很多。
