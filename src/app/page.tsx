'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, Loader2, Pause, Play, RotateCcw, Wand2, Volume2 } from 'lucide-react'
import {
  BAIBAN_DEMO_CONFIG_STORAGE_KEY,
  DEFAULT_BAIBAN_DEMO_CONFIG,
  parseStoredBaibanDemoConfig,
  serializeBaibanDemoConfig,
} from '@/lib/baiban-demo-config'

interface TimelineWord {
  text: string
  beginIndex: number
  endIndex: number
  beginTime: number
  endTime: number
}

interface TimelineSentence {
  index: number
  originalText?: string
  words: TimelineWord[]
}

interface TtsTimelineResult {
  requestId: string
  audio: {
    url: string
    id?: string
    expiresAt?: number
  }
  usage: {
    characters?: number
  }
  sentences: TimelineSentence[]
}

interface BoardCue {
  id: string
  text: string
  startMs: number
  endMs: number
}

class WhiteboardWriter {
  private ctx: CanvasRenderingContext2D
  private width: number
  private height: number
  private nextY = 76
  private readonly lineHeight = 52

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context unavailable')
    this.ctx = ctx
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    this.ctx.scale(ratio, ratio)
    this.width = rect.width
    this.height = rect.height
    this.reset()
  }

  reset() {
    this.nextY = 76
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.ctx.fillStyle = '#fdfcf8'
    this.ctx.fillRect(0, 0, this.width, this.height)

    this.ctx.strokeStyle = 'rgba(180, 170, 160, 0.16)'
    this.ctx.lineWidth = 1
    for (let y = 28; y < this.height; y += 28) {
      this.ctx.beginPath()
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(this.width, y)
      this.ctx.stroke()
    }
  }

  writeChunk(text: string) {
    const safeText = text.trim()
    if (!safeText) return

    const lines = safeText.split('\n').filter(Boolean)
    this.ctx.fillStyle = '#1f2a37'
    this.ctx.font = '600 28px "KaiTi", "STKaiti", "DFKai-SB", serif'
    this.ctx.textBaseline = 'middle'

    for (const line of lines) {
      const jitterX = 42 + (Math.random() - 0.5) * 6
      const jitterY = this.nextY + (Math.random() - 0.5) * 4
      this.ctx.save()
      this.ctx.translate(jitterX, jitterY)
      this.ctx.rotate((Math.random() - 0.5) * 0.025)
      this.ctx.fillText(line, 0, 0)
      this.ctx.restore()
      this.nextY += this.lineHeight
    }
  }
}

function flattenWords(sentences: TimelineSentence[]): TimelineWord[] {
  return sentences
    .flatMap((sentence) => sentence.words)
    .sort((a, b) => a.beginTime - b.beginTime)
}

function buildBoardCues(linesText: string, words: TimelineWord[]): BoardCue[] {
  const lines = linesText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const usableWords = words.length > 0 ? words : lines.map((line, index) => ({
    text: line,
    beginIndex: index,
    endIndex: index + 1,
    beginTime: index * 1000,
    endTime: (index + 1) * 1000,
  }))

  const chunkSize = Math.max(1, Math.floor(usableWords.length / lines.length))

  return lines.map((line, index) => {
    const startWord = usableWords[Math.min(index * chunkSize, usableWords.length - 1)]
    const endWord = usableWords[Math.min(((index + 1) * chunkSize) - 1, usableWords.length - 1)]
    return {
      id: `cue-${index + 1}`,
      text: line,
      startMs: startWord?.beginTime ?? index * 1000,
      endMs: endWord?.endTime ?? (index + 1) * 1000,
    }
  })
}

export default function Page() {
  const [serviceUrl, setServiceUrl] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.serviceUrl)
  const [aliyunApiKey, setAliyunApiKey] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.aliyunApiKey)
  const [voice, setVoice] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.voice)
  const [adjustAgentBaseUrl, setAdjustAgentBaseUrl] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentBaseUrl)
  const [adjustAgentApiKey, setAdjustAgentApiKey] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentApiKey)
  const [adjustAgentModel, setAdjustAgentModel] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentModel)
  const [controlAgentBaseUrl, setControlAgentBaseUrl] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentBaseUrl)
  const [controlAgentApiKey, setControlAgentApiKey] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentApiKey)
  const [controlAgentModel, setControlAgentModel] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentModel)
  const [text, setText] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.text)
  const [boardLines, setBoardLines] = useState(DEFAULT_BAIBAN_DEMO_CONFIG.boardLines)
  const [status, setStatus] = useState('等待生成')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [timelineResult, setTimelineResult] = useState<TtsTimelineResult | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [activeCueId, setActiveCueId] = useState<string | null>(null)
  const [hasLoadedStoredConfig, setHasLoadedStoredConfig] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const writerRef = useRef<WhiteboardWriter | null>(null)
  const writtenCueIdsRef = useRef<Set<string>>(new Set())

  const boardCues = useMemo(() => {
    // #业务流_板书块时间轴
    // 3000 页把“板书块（每行一个）”压成 cue 时间轴，给白板验证台使用。
    const words = timelineResult ? flattenWords(timelineResult.sentences) : []
    return buildBoardCues(boardLines, words)
  }, [boardLines, timelineResult])

  const connectSocket = useCallback(() => {
    // #接口_白板服务_socket3003
    // 3000 首页主链不是 REST，而是直连 3003 Socket 微服务。
    socketRef.current?.disconnect()
    const socket = io(serviceUrl, {
      transports: ['websocket'],
      path: '/',
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setStatus('已连接到手写服务')
    })

    socket.on('status', (payload: { message?: string }) => {
      if (payload?.message) setStatus(payload.message)
    })

    socket.on('tts-timeline-ready', (payload: TtsTimelineResult) => {
      setTimelineResult(payload)
      setStatus('音频与时间轴已就绪')
      setIsGenerating(false)
      setError('')
      setProgress(0)
      setActiveCueId(null)
      writtenCueIdsRef.current = new Set()
      writerRef.current?.reset()
    })

    socket.on('error', (payload: { message?: string }) => {
      setError(payload?.message || '未知错误')
      setStatus('生成失败')
      setIsGenerating(false)
    })
  }, [serviceUrl])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // #配置_本地预设
    // 白板首页启动时优先读本机记忆，避免演示现场每次重填。
    const stored = window.localStorage.getItem(BAIBAN_DEMO_CONFIG_STORAGE_KEY)
    const config = parseStoredBaibanDemoConfig(stored)
    setServiceUrl(config.serviceUrl)
    setAliyunApiKey(config.aliyunApiKey)
    setVoice(config.voice)
    setAdjustAgentBaseUrl(config.adjustAgentBaseUrl)
    setAdjustAgentApiKey(config.adjustAgentApiKey)
    setAdjustAgentModel(config.adjustAgentModel)
    setControlAgentBaseUrl(config.controlAgentBaseUrl)
    setControlAgentApiKey(config.controlAgentApiKey)
    setControlAgentModel(config.controlAgentModel)
    setText(config.text)
    setBoardLines(config.boardLines)
    setHasLoadedStoredConfig(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedStoredConfig || typeof window === 'undefined') return

    // #配置_测试key记忆
    // 语音 / 调整 agent / 控制 agent / 文本 / 板书块统一写回本机 localStorage。
    window.localStorage.setItem(
      BAIBAN_DEMO_CONFIG_STORAGE_KEY,
      serializeBaibanDemoConfig({
        serviceUrl,
        aliyunApiKey,
        voice,
        adjustAgentBaseUrl,
        adjustAgentApiKey,
        adjustAgentModel,
        controlAgentBaseUrl,
        controlAgentApiKey,
        controlAgentModel,
        text,
        boardLines,
      }),
    )
  }, [
    adjustAgentApiKey,
    adjustAgentBaseUrl,
    adjustAgentModel,
    aliyunApiKey,
    boardLines,
    controlAgentApiKey,
    controlAgentBaseUrl,
    controlAgentModel,
    hasLoadedStoredConfig,
    serviceUrl,
    text,
    voice,
  ])

  useEffect(() => {
    connectSocket()
    return () => {
      socketRef.current?.disconnect()
    }
  }, [connectSocket])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    writerRef.current = new WhiteboardWriter(canvas)
  }, [])

  const handleGenerate = useCallback(() => {
    if (!socketRef.current) {
      setError('手写服务未连接')
      return
    }

    // #接口_语音_tts_timeline
    // 当前 3000 首页真正触发的语音链是 generate-tts-timeline，不是旧 REST 接口。
    setIsGenerating(true)
    setError('')
    setTimelineResult(null)
    setStatus('正在请求 AI 与 TTS...')

    socketRef.current.emit('generate-tts-timeline', {
      text,
      apiKey: aliyunApiKey.trim() || undefined,
      voice,
      format: 'wav',
      sampleRate: 24000,
    })
  }, [aliyunApiKey, text, voice])

  const handleResetBoard = useCallback(() => {
    writerRef.current?.reset()
    writtenCueIdsRef.current = new Set()
    setProgress(0)
    setActiveCueId(null)
  }, [])

  const handleWriteNext = useCallback(() => {
    // #控制_试写下一块
    // 这是 3000 页最有“乖巧感”的控制点：一块一块验证白板，不直接成片。
    const nextCue = boardCues.find((cue) => !writtenCueIdsRef.current.has(cue.id))
    if (!nextCue) return
    writerRef.current?.writeChunk(nextCue.text)
    writtenCueIdsRef.current.add(nextCue.id)
    setActiveCueId(nextCue.id)
    setProgress((writtenCueIdsRef.current.size / Math.max(boardCues.length, 1)) * 100)
  }, [boardCues])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !timelineResult) return

    const onTimeUpdate = () => {
      // #业务流_白板同步播放
      // 播放时用 currentTime 对 cue.startMs，把板书块同步推到白板上。
      const currentMs = audio.currentTime * 1000
      const durationMs = Math.max(audio.duration * 1000 || 1, 1)
      setProgress((currentMs / durationMs) * 100)

      for (const cue of boardCues) {
        if (!writtenCueIdsRef.current.has(cue.id) && currentMs >= cue.startMs) {
          writerRef.current?.writeChunk(cue.text)
          writtenCueIdsRef.current.add(cue.id)
          setActiveCueId(cue.id)
        }
      }
    }

    const onEnded = () => {
      setIsPlaying(false)
      setActiveCueId(null)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [boardCues, timelineResult])

  const handlePlay = useCallback(async () => {
    if (!audioRef.current || !timelineResult) return
    try {
      setIsPlaying(true)
      await audioRef.current.play()
    } catch (err) {
      setIsPlaying(false)
      setError(err instanceof Error ? err.message : '音频播放失败')
    }
  }, [timelineResult])

  const handlePause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const handleRestorePreset = useCallback(() => {
    // #配置_恢复预设
    // 演示前一键回到我们认定的默认家庭业务配置。
    setServiceUrl(DEFAULT_BAIBAN_DEMO_CONFIG.serviceUrl)
    setAliyunApiKey(DEFAULT_BAIBAN_DEMO_CONFIG.aliyunApiKey)
    setVoice(DEFAULT_BAIBAN_DEMO_CONFIG.voice)
    setAdjustAgentBaseUrl(DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentBaseUrl)
    setAdjustAgentApiKey(DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentApiKey)
    setAdjustAgentModel(DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentModel)
    setControlAgentBaseUrl(DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentBaseUrl)
    setControlAgentApiKey(DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentApiKey)
    setControlAgentModel(DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentModel)
    setText(DEFAULT_BAIBAN_DEMO_CONFIG.text)
    setBoardLines(DEFAULT_BAIBAN_DEMO_CONFIG.boardLines)
    setStatus('已恢复演示预设')
    setError('')
  }, [])

  const handleClearStoredConfig = useCallback(() => {
    // #配置_清空本地记忆
    // 清除的是浏览器本机记忆，不影响服务端环境变量。
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(BAIBAN_DEMO_CONFIG_STORAGE_KEY)
    }
    setStatus('已清空本地配置记忆')
    setError('')
  }, [])

  return (
    // #路由_白板首页
    // 3000 首页保留为“乖巧但能用”的白板验证台：可输入、可观察、可试写。
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#f2ece5_100%)] px-6 py-6 text-slate-900">
      <div className="mx-auto grid max-w-[1480px] grid-cols-[320px_minmax(0,1fr)] gap-6">
        <Card className="border-white/70 bg-white/88 shadow-[0_16px_36px_rgba(180,160,138,0.16)]">
          <CardHeader>
            <CardTitle className="text-base">TTS 时间轴实验台</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>手写服务地址</Label>
              <Input value={serviceUrl} onChange={(e) => setServiceUrl(e.target.value)} />
              <Button variant="outline" className="w-full" onClick={connectSocket}>重连服务</Button>
            </div>

            <div className="space-y-2">
              <Label>语音阿里云 API Key（本机记忆）</Label>
              <Input type="password" value={aliyunApiKey} onChange={(e) => setAliyunApiKey(e.target.value)} placeholder="留空则读服务环境变量" />
            </div>

            <div className="space-y-2">
              <Label>音色</Label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger>
                  <SelectValue placeholder="选择音色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="longanyang">longanyang</SelectItem>
                  <SelectItem value="longwan">longwan</SelectItem>
                  <SelectItem value="longxiaochun">longxiaochun</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>调整 Agent 接口</Label>
              <Input value={adjustAgentBaseUrl} onChange={(e) => setAdjustAgentBaseUrl(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>调整 Agent Key（本机记忆）</Label>
              <Input type="password" value={adjustAgentApiKey} onChange={(e) => setAdjustAgentApiKey(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>调整 Agent 模型</Label>
              <Input value={adjustAgentModel} onChange={(e) => setAdjustAgentModel(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>控制 Agent 接口</Label>
              <Input value={controlAgentBaseUrl} onChange={(e) => setControlAgentBaseUrl(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>控制 Agent Key（本机记忆）</Label>
              <Input type="password" value={controlAgentApiKey} onChange={(e) => setControlAgentApiKey(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>控制 Agent 模型</Label>
              <Input value={controlAgentModel} onChange={(e) => setControlAgentModel(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>讲解文本</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} />
            </div>

            <div className="space-y-2">
              <Label>板书块（每行一个）</Label>
              <Textarea value={boardLines} onChange={(e) => setBoardLines(e.target.value)} rows={8} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                生成时间轴
              </Button>
              <Button variant="outline" onClick={handleWriteNext}>
                试写下一块
              </Button>
              <Button variant="outline" onClick={handleResetBoard}>
                <RotateCcw className="mr-2 h-4 w-4" />
                清空板书
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleRestorePreset}>
                恢复预设
              </Button>
              <Button variant="outline" onClick={handleClearStoredConfig}>
                清空本地记忆
              </Button>
            </div>

            <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-3 text-sm text-amber-900">
              <div className="font-medium">当前状态</div>
              <div className="mt-1">{status}</div>
              <div className="mt-2 text-xs text-amber-800/80">
                这页会自动记住：语音、调整 agent、控制 agent、讲解文本、板书块。
              </div>
              {error ? (
                <div className="mt-2 flex items-start gap-2 text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/70 bg-white/90 shadow-[0_16px_36px_rgba(180,160,138,0.16)]">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">时间轴与白板验证</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">只验证控制，不做成片</Badge>
                {activeCueId ? <Badge>{activeCueId}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handlePlay} disabled={!timelineResult || isPlaying}>
                  <Play className="mr-2 h-4 w-4" />
                  播放同步
                </Button>
                <Button variant="outline" onClick={handlePause} disabled={!isPlaying}>
                  <Pause className="mr-2 h-4 w-4" />
                  暂停
                </Button>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm">
                  <Volume2 className="h-4 w-4" />
                  <span>音频 + 板书块时间控制</span>
                </div>
              </div>

              <Progress value={progress} />

              <audio
                ref={audioRef}
                controls
                src={timelineResult?.audio.url}
                className="w-full"
              />

              <div className="rounded-[24px] border border-slate-200 bg-[#fdfcf8] p-4 shadow-inner">
                <canvas
                  ref={canvasRef}
                  className="h-[560px] w-full rounded-[20px] border border-slate-200 bg-[#fefcf8]"
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-6">
            <Card className="border-white/70 bg-white/90 shadow-[0_16px_36px_rgba(180,160,138,0.16)]">
              <CardHeader>
                <CardTitle className="text-base">板书块时间轴</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[320px] pr-3">
                  <div className="space-y-2">
                    {boardCues.map((cue) => (
                      <div
                        key={cue.id}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          activeCueId === cue.id
                            ? 'border-violet-300 bg-violet-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="font-medium">{cue.text}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {cue.startMs}ms - {cue.endMs}ms
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/90 shadow-[0_16px_36px_rgba(180,160,138,0.16)]">
              <CardHeader>
                <CardTitle className="text-base">阿里云时间轴原始结果</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[320px] rounded-xl border border-slate-200 bg-slate-950 p-3">
                  <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-100">
                    {timelineResult ? JSON.stringify(timelineResult, null, 2) : '还没有结果'}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
