# 阿里云 TTS 时间轴探针

用途：

- 验证 `SpeechSynthesizer` 是否稳定返回：
  - `audio.url`
  - `sentence.words[].begin_time/end_time`

运行前：

- 设置环境变量 `DASHSCOPE_API_KEY`

运行：

```powershell
cd C:\Users\Administrator\Desktop\baiban
python .zscripts\aliyun_tts_timeline_probe.py
```

自定义文本：

```powershell
python .zscripts\aliyun_tts_timeline_probe.py "我家的后面有一个很大的园。"
```

当前默认模型：

- `cosyvoice-v3-flash`

当前默认参数：

- `voice=longanyang`
- `format=wav`
- `sample_rate=24000`
- `word_timestamp_enabled=true`
