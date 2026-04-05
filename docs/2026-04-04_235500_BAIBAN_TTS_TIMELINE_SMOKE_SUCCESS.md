# baiban TTS 时间轴沙箱冒烟成功

记录时间：2026-04-04 23:55:00

标签：

- `baiban`
- `白板沙箱`
- `TTS 时间轴`
- `环境补齐`
- `冒烟成功`

## 本轮确认

`baiban` 的最小沙箱链路已经跑通：

```text
text -> generate-tts-timeline -> audio_url + word_timeline
```

这次不是停留在“代码已加”，而是已经完成本地冒烟验证。

## 本轮实际做了什么

### 1. 微服务依赖已补齐

目录：

- `C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service`

已安装：

- `socket.io`
- `z-ai-web-dev-sdk`
- `socket.io-client`（用于本地联调验证）

### 2. 本地环境已补

已在手写微服务本地 `.env` 中配置：

- `DASHSCOPE_API_KEY`

当前仍未配置：

- `ZAI_API_KEY`
- `ZAI_BASE_URL`

说明：

- 这不影响本轮 `generate-tts-timeline` 验证
- 但如果要继续验证旧 `generate-script`，仍需补 `ZAI_*`

### 3. 服务已成功启动

监听端口：

- `3003`

启动日志确认：

- `Director Service running on port 3003`

### 4. 新事件已实测成功

测试方式：

- 启动本地 `handwriting-service`
- 用临时 Socket.IO 客户端连接 `127.0.0.1:3003`
- 发送事件：`generate-tts-timeline`

测试文本：

- `我家的后面有一个很大的园。`

实测结果：

- 成功返回 `requestId`
- 成功返回 `audio.url`
- 成功返回 `sentences[0].words[]`
- 首句共拿到 `13` 个字/标点时间片

时间轴示例结论：

- `我`：`320 -> 560`
- `家`：`560 -> 720`
- `园`：`2240 -> 2440`
- `。`：`2560 -> 2920`

这说明：

- 阿里云 CosyVoice 流式 SSE 这条链在本地真实可用
- 可以稳定作为后续“逐字高亮 / 手写调度”的时间基准

## 本轮新增的辅助文件

为做本地联调，在工作树中新增：

- `scripts/test-baiban-tts-socket.cjs`

用途：

- 临时连本地 `3003`
- 触发 `generate-tts-timeline`
- 打印返回摘要

## 下一步建议

1. 不进 1.0 主链，继续留在沙箱
2. 在 `baiban` 做最小预览壳：
   - 文本输入
   - 音频播放器
   - 逐字高亮
   - 原始 timeline JSON
3. 之后再考虑时间轴驱动手写块，而不是直接跳 MP4

## 一句话结论

这条路已经从“设想”进入“可运行的小闭环”，
接下来不是重想方案，
而是把最小预览壳搭出来。
