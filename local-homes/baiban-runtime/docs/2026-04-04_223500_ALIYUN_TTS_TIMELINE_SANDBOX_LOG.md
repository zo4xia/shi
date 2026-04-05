# 阿里云 TTS 时间轴沙箱记录

记录时间：2026-04-04 22:35:00

标签：

- `白板沙箱`
- `阿里云 TTS`
- `时间轴`
- `最小验证`

## 当前确认

阿里云 `SpeechSynthesizer`：

- 非流式：能返回 `audio.url`
- 流式 SSE：能返回 `sentence.words[].begin_time/end_time`

因此当前技术路线确定为：

```text
text -> 阿里云流式 TTS -> audio.url + word timeline
```

## 本轮已做

在：

- `mini-services/handwriting-service/index.ts`

新增了一个并行沙箱接口：

- `generate-tts-timeline`

它不会替换原来的：

- `generate-script`

所以当前属于：

- **加新探针**
- **不破旧链**

## 当前新接口做什么

输入：

- `text`
- 可选 `apiKey`
- 可选 `voice`
- 可选 `format`
- 可选 `sampleRate`

输出：

- `requestId`
- `audio.url`
- `audio.id`
- `audio.expiresAt`
- `usage.characters`
- `sentences[].words[]`

## 当前限制

- 还没接前端展示
- 还没做统一类型抽取
- 还没和白板板书调度联动

## 下一步

1. 对这个新接口做最小连通性检查
2. 给前端做一个最小时间轴预览 UI
3. 再考虑把时间轴映射为板书块
