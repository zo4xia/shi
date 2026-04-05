'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, Play, Pause, Square, Link2, AudioLines, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  TtsTimelineResult,
  normalizeTtsTimelineResult,
  flattenTimelineWords,
  findActiveTimelineWordIndex,
} from '@/lib/tts-timeline';
import { buildTtsAudioProxyUrl } from '@/lib/tts-audio';

type TimelineStatus = 'idle' | 'loading' | 'ready' | 'error';

function getSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3003';
  }

  const hostname = window.location.hostname || '127.0.0.1';
  return `http://${hostname}:3003`;
}

export default function TtsTimelinePage() {
  const [text, setText] = useState('我家的后面有一个很大的园。');
  const [voice, setVoice] = useState('longanyang');
  const [format, setFormat] = useState<'wav' | 'mp3'>('wav');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<TimelineStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('等待生成音频与时序点');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<TtsTimelineResult | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'audioUrl' | 'json'>('idle');

  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);
  const playbackObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // #路由_TTS试验台
    // 这是当前最干净的最小验证页：文本 -> 阿里云时间轴 -> 播放/高亮。
    const audio = new Audio();
    audio.preload = 'auto';
    audio.ontimeupdate = () => {
      setCurrentMs((audio.currentTime || 0) * 1000);
    };
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentMs((audio.duration || 0) * 1000);
    };
    audio.oncanplay = () => {
      setStatus('ready');
      setStatusMessage('音频已就绪，可以试听和对时序点。');
    };
    audio.onerror = () => {
      setStatus('error');
      setStatusMessage('音频装载失败');
      setErrorMessage('音频 URL 已返回，但浏览器没有成功装载它。');
    };
    audioRef.current = audio;

    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      if (pendingRequestIdRef.current) {
        pendingRequestIdRef.current = null;
        setStatus('error');
        setStatusMessage('连接断开，当前请求已中止');
        setErrorMessage('Socket 已断开，请重试。');
      }
    });

    socket.on('status', (data: { stage?: string; message?: string }) => {
      if (data.stage === 'tts-timeline') {
        setStatus('loading');
        setStatusMessage(data.message || '正在生成音频与时序点...');
      }
    });

    socket.on('tts-timeline-ready', (incoming: TtsTimelineResult) => {
      // #接口_语音_tts_timeline
      // 此处接阿里云时间轴回包：audio.url + sentences.words。
      if (incoming.clientRequestId && incoming.clientRequestId !== pendingRequestIdRef.current) {
        return;
      }

      const normalized = normalizeTtsTimelineResult(incoming);
      setResult(normalized);
      setCurrentMs(0);
      setErrorMessage('');
      setStatus('loading');
      setStatusMessage('时序点已收到，正在装载音频...');
      pendingRequestIdRef.current = null;

      void loadPlaybackAudio(normalized.audio.url).catch((error) => {
        setStatus('error');
        setStatusMessage('音频装载失败');
        setErrorMessage(error instanceof Error ? error.message : '音频代理装载失败');
      });
    });

    socket.on('tts-timeline-error', (payload: { message?: string; clientRequestId?: string }) => {
      if (payload.clientRequestId && payload.clientRequestId !== pendingRequestIdRef.current) {
        return;
      }

      pendingRequestIdRef.current = null;
      setStatus('error');
      setStatusMessage(payload.message || '生成失败');
      setErrorMessage(payload.message || '生成失败');
    });

    return () => {
      socket.disconnect();
      audio.pause();
      audio.src = '';
      if (playbackObjectUrlRef.current) {
        URL.revokeObjectURL(playbackObjectUrlRef.current);
        playbackObjectUrlRef.current = null;
      }
    };
  }, []);

  const flatWords = useMemo(() => flattenTimelineWords(result), [result]);
  const activeWordIndex = useMemo(() => findActiveTimelineWordIndex(flatWords, currentMs), [flatWords, currentMs]);

  const proxyAudioUrl = useMemo(
    () => (result?.audio.url ? buildTtsAudioProxyUrl(result.audio.url) : ''),
    [result],
  );

  const loadPlaybackAudio = async (remoteAudioUrl: string) => {
    // #控制_播放暂停重置
    // 播放走本地音频代理，避免客户演示时直接加载远程 URL 翻车。
    const playbackUrl = buildTtsAudioProxyUrl(remoteAudioUrl);
    const response = await fetch(playbackUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`音频代理失败: HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (playbackObjectUrlRef.current) {
      URL.revokeObjectURL(playbackObjectUrlRef.current);
    }
    playbackObjectUrlRef.current = objectUrl;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = objectUrl;
      audioRef.current.load();
    }
  };

  const handleGenerate = () => {
    if (!text.trim() || !socketRef.current || !isConnected) {
      return;
    }

    // #业务流_TTS时间轴
    // 这条最小主线只负责：文本输入 -> 生成音频+时间轴 -> 页面观察。
    const clientRequestId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingRequestIdRef.current = clientRequestId;
    setStatus('loading');
    setStatusMessage('正在请求音频与时序点...');
    setErrorMessage('');
    setResult(null);
    setCurrentMs(0);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }
    if (playbackObjectUrlRef.current) {
      URL.revokeObjectURL(playbackObjectUrlRef.current);
      playbackObjectUrlRef.current = null;
    }

    socketRef.current.emit('generate-tts-timeline', {
      clientRequestId,
      text: text.trim(),
      voice: voice.trim() || 'longanyang',
      format,
      sampleRate: 24000,
    });
  };

  const handleTogglePlay = async () => {
    if (!audioRef.current || !result?.audio.url) {
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      return;
    }

    try {
      await audioRef.current.play();
    } catch (error) {
      setStatus('error');
      setStatusMessage('播放失败');
      setErrorMessage(error instanceof Error ? error.message : '播放失败');
    }
  };

  const handleReset = () => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setCurrentMs(0);
  };

  const jsonPayload = useMemo(
    () =>
      JSON.stringify(
        result
          ? {
              requestId: result.requestId,
              audioUrl: result.audio.url,
              sentences: result.sentences,
            }
          : {
              audioUrl: null,
              sentences: [],
            },
        null,
        2,
      ),
    [result],
  );

  const handleCopy = async (type: 'audioUrl' | 'json', value: string) => {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState(type);
      window.setTimeout(() => {
        setCopyState((current) => (current === type ? 'idle' : current));
      }, 1600);
    } catch (error) {
      setStatus('error');
      setStatusMessage('复制失败');
      setErrorMessage(error instanceof Error ? error.message : '复制失败');
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-4 sm:py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">TTS 时间轴最小试验台</h1>
            <p className="mt-1 text-sm text-slate-500">
              第一小步只做：文本输入，生成音频，输出时序点。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? '3003 已连接' : '3003 未连接'}
            </Badge>
            <Badge variant="outline">{format.toUpperCase()}</Badge>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>输入与生成</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ttsText">文本输入</Label>
                <Textarea
                  id="ttsText"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-40 bg-white"
                  placeholder="输入一段要合成的文本"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voice">语音角色</Label>
                  <Input
                    id="voice"
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="bg-white"
                    placeholder="longanyang"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="format">输出格式</Label>
                  <Input
                    id="format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value === 'mp3' ? 'mp3' : 'wav')}
                    className="bg-white"
                    placeholder="wav / mp3"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Button onClick={handleGenerate} disabled={!text.trim() || !isConnected || status === 'loading'} className="w-full">
                  <Mic className="mr-2 h-4 w-4" />
                  生成音频 + 时序点
                </Button>
                <Button onClick={handleTogglePlay} variant="outline" disabled={!result?.audio.url} className="w-full">
                  {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                  {isPlaying ? '暂停' : '播放'}
                </Button>
                <Button onClick={handleReset} variant="outline" disabled={!result?.audio.url} className="w-full">
                  <Square className="mr-2 h-4 w-4" />
                  重置
                </Button>
              </div>

              <div className="rounded-lg border border-dashed bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                演示顺序：输入文本，点击“生成音频 + 时序点”，等待右侧出现可复制 URL、逐字高亮和 JSON。
              </div>

              <div className="rounded-lg border bg-white px-4 py-3 text-sm text-slate-600">
                <div>{statusMessage}</div>
                {errorMessage ? <div className="mt-2 text-red-500">{errorMessage}</div> : null}
              </div>
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>音频与摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-white px-3 py-3">
                    <div className="text-xs text-slate-400">当前时间</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{currentMs.toFixed(0)} ms</div>
                  </div>
                  <div className="rounded-lg border bg-white px-3 py-3">
                    <div className="text-xs text-slate-400">时序片段</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{flatWords.length}</div>
                  </div>
                </div>

                <div className="rounded-lg border bg-white px-4 py-3 text-sm text-slate-700">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Link2 className="h-4 w-4" />
                      音频 URL
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full sm:w-auto"
                        disabled={!result?.audio.url}
                        onClick={() => handleCopy('audioUrl', result?.audio.url || '')}
                      >
                        {copyState === 'audioUrl' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {copyState === 'audioUrl' ? '已复制' : '复制 URL'}
                      </Button>
                      <Button asChild type="button" size="sm" variant="outline" className="h-8 w-full sm:w-auto" disabled={!proxyAudioUrl}>
                        <a href={proxyAudioUrl || '#'} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          打开代理音频
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 break-all text-xs text-slate-500">
                    {result?.audio.url || '生成后显示'}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    页面播放会优先走本地代理，避免客户演示时直接吃远程 OSS 链接失败。
                  </div>
                </div>

                <div className="rounded-lg border bg-white px-4 py-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <AudioLines className="h-4 w-4" />
                    逐字高亮预览
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {flatWords.length > 0 ? (
                      flatWords.map((word, index) => {
                        const isActive = index === activeWordIndex;
                        return (
                          <span
                            key={`${word.sentenceIndex}-${index}-${word.beginTime}`}
                            className={`rounded-full border px-3 py-1 text-sm transition ${
                              isActive
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            {word.text}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-sm text-slate-400">生成后显示逐字高亮。</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>时序点 JSON</CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-full sm:w-auto"
                  onClick={() => handleCopy('json', jsonPayload)}
                >
                  {copyState === 'json' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copyState === 'json' ? '已复制' : '复制 JSON'}
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-72 rounded-lg border bg-slate-950 px-3 py-3 sm:h-80 sm:px-4 sm:py-4">
                  <pre className="text-xs leading-6 text-emerald-300">
{jsonPayload}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <style jsx global>{`
        button[aria-label='Open Next.js Dev Tools'],
        button[aria-label='Close Next.js Dev Tools'],
        [aria-label='Next.js Dev Tools Items'] {
          display: none !important;
        }
      `}</style>
    </main>
  );
}
