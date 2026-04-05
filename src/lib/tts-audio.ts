// #接口_音频代理
// 远程 OSS 音频不直接给浏览器裸吃，先走本地代理接口更稳。
export function getSafeRemoteAudioUrl(source: string): string | null {
  try {
    const url = new URL(source);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function buildTtsAudioProxyUrl(source: string): string {
  return `/api/tts-audio?source=${encodeURIComponent(source)}`;
}
