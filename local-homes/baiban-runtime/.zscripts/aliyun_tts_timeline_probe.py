import json
import os
import sys
import urllib.error
import urllib.request


API_URL = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"


def build_payload(text: str) -> dict:
    return {
        "model": "cosyvoice-v3-flash",
        "input": {
            "text": text,
            "voice": "longanyang",
            "format": "wav",
            "sample_rate": 24000,
            "word_timestamp_enabled": True,
        },
    }


def normalize_response(raw: dict) -> dict:
    output = raw.get("output", {}) or {}
    audio = output.get("audio", {}) or {}
    usage = raw.get("usage", {}) or {}

    sentences = []
    sentence = output.get("sentence")
    if isinstance(sentence, dict):
      sentences.append(sentence)
    elif isinstance(output.get("sentences"), list):
      sentences = output["sentences"]

    return {
        "requestId": raw.get("request_id"),
        "audioUrl": audio.get("url"),
        "audioId": audio.get("id"),
        "expiresAt": audio.get("expires_at"),
        "characters": usage.get("characters"),
        "sentences": [
            {
                "index": item.get("index"),
                "words": [
                    {
                        "text": word.get("text"),
                        "beginIndex": word.get("begin_index"),
                        "endIndex": word.get("end_index"),
                        "beginTime": word.get("begin_time"),
                        "endTime": word.get("end_time"),
                    }
                    for word in item.get("words", []) or []
                ],
            }
            for item in sentences
        ],
        "raw": raw,
    }


def call_tts(text: str, api_key: str) -> dict:
    payload = json.dumps(build_payload(text)).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def main() -> int:
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        print("Missing DASHSCOPE_API_KEY environment variable.", file=sys.stderr)
        return 1

    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:]).strip()
    else:
        text = (
            "同学们大家好，很高兴为大家解说简算的小技巧，下面看几道题。"
            "第一题，四百一十八减一百七十减一百一十八。"
            "简算，减法性质，四百一十八减一百一十八减一百七十，等于三百减一百七十，等于一百三十。"
            "第二题，二百八十八减四十四减一百五十六。"
            "简算，减法性质，二百八十八减括号四十四加一百五十六括号，等于二百八十八减二百，等于八十八。"
        )

    try:
        raw = call_tts(text, api_key)
        normalized = normalize_response(raw)
        print(json.dumps(normalized, ensure_ascii=False, indent=2))
        return 0
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        print(f"HTTP {error.code}", file=sys.stderr)
        if body:
            print(body, file=sys.stderr)
        return 2
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
