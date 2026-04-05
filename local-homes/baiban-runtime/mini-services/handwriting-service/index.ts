import { createServer } from 'http'
import { Server } from 'socket.io'
import ZAI from 'z-ai-web-dev-sdk'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ==========================================
// 类型定义
// ==========================================

interface BoardItem {
  type: 'text' | 'graph'  // 文字 或 图形
  content: string
  position: { x: number; y: number }
  graphType?: 'coordinate' | 'function' | 'geometry' | 'point' | 'line'
  graphData?: {
    function?: string      // 函数表达式，如 "2x+1"
    points?: { x: number; y: number; label?: string }[]
    shapes?: { type: string; data: any }[]
    range?: { xMin: number; xMax: number; yMin: number; yMax: number }
  }
}

interface Cue {
  id: string
  time: number
  type: 'write' | 'draw' | 'pause'
  boardItem: BoardItem
  note?: string
}

interface Script {
  problemId: string
  problem: string
  problemType: 'text' | 'graph'  // 纯文本型 或 画图型
  audio: {
    data: string
    duration: number
    text: string
  }
  cues: Cue[]
  layout: {
    textArea: { x: number; y: number; width: number; height: number }
    graphArea?: { x: number; y: number; width: number; height: number }
  }
}

interface Session {
  id: string
  script: Script
  isPlaying: boolean
  currentTime: number
}

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
  clientRequestId?: string
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

// ==========================================
// 全局状态
// ==========================================

const sessions = new Map<string, Session>()

// API配置存储（每个socket可以有自己的配置）
const apiConfigs = new Map<string, { apiKey: string; baseUrl?: string }>()

// 默认API配置（从环境变量）
const defaultApiKey = process.env.ZAI_API_KEY || ''
const defaultBaseUrl = process.env.ZAI_BASE_URL || ''

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null
let currentApiKey: string = defaultApiKey
let currentBaseUrl: string = defaultBaseUrl

async function getZAI(socketId?: string): Promise<Awaited<ReturnType<typeof ZAI.create>>> {
  // 如果有socket特定的配置，使用它
  const socketConfig = socketId ? apiConfigs.get(socketId) : null
  const apiKey = socketConfig?.apiKey || currentApiKey || defaultApiKey
  const baseUrl = socketConfig?.baseUrl || currentBaseUrl || defaultBaseUrl
  
  // 如果配置变化或实例不存在，创建新实例
  if (!zaiInstance || (apiKey && apiKey !== currentApiKey) || (baseUrl && baseUrl !== currentBaseUrl)) {
    console.log('Creating new ZAI instance with config:', { hasApiKey: !!apiKey, baseUrl: baseUrl || 'default' })
    
    const config: { apiKey?: string; baseUrl?: string } = {}
    if (apiKey) config.apiKey = apiKey
    if (baseUrl) config.baseUrl = baseUrl
    
    zaiInstance = await (ZAI as any).create(config)
    currentApiKey = apiKey
    currentBaseUrl = baseUrl
  }
  
  return zaiInstance
}

const generateId = () => Math.random().toString(36).substr(2, 9)

// ==========================================
// 阿里云 TTS 时间轴沙箱
// ==========================================

async function generateAliyunTtsTimeline(
  text: string,
  options?: {
    apiKey?: string
    voice?: string
    format?: 'wav' | 'mp3' | 'pcm' | 'opus'
    sampleRate?: number
  }
): Promise<TtsTimelineResult> {
  const apiKey = options?.apiKey?.trim() || process.env.DASHSCOPE_API_KEY || ''
  if (!apiKey) {
    throw new Error('缺少 DASHSCOPE_API_KEY，无法调用阿里云 TTS')
  }

  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable',
    },
    body: JSON.stringify({
      model: 'cosyvoice-v3-flash',
      input: {
        text,
        voice: options?.voice || 'longanyang',
        format: options?.format || 'wav',
        sample_rate: options?.sampleRate || 24000,
        word_timestamp_enabled: true,
      },
    }),
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '')
    throw new Error(`阿里云 TTS 请求失败: HTTP ${response.status} ${body}`.trim())
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let requestId = ''
  let finalAudioUrl = ''
  let finalAudioId = ''
  let finalExpiresAt: number | undefined
  let characters: number | undefined
  const sentenceMap = new Map<number, TimelineSentence>()

  const consumeEventData = (line: string) => {
    if (!line.startsWith('data:')) {
      return
    }

    const payloadText = line.slice(5).trim()
    if (!payloadText) {
      return
    }

    let payload: any
    try {
      payload = JSON.parse(payloadText)
    } catch {
      return
    }

    requestId = payload.request_id || requestId
    characters = payload.usage?.characters ?? characters

    const output = payload.output || {}
    const sentence = output.sentence
    const originalText = output.original_text
    const audio = output.audio || {}

    if (audio.url) {
      finalAudioUrl = audio.url
    }
    if (audio.id) {
      finalAudioId = audio.id
    }
    if (typeof audio.expires_at === 'number') {
      finalExpiresAt = audio.expires_at
    }

    if (sentence && typeof sentence.index === 'number') {
      const existing = sentenceMap.get(sentence.index) || {
        index: sentence.index,
        originalText,
        words: [],
      }

      if (originalText && !existing.originalText) {
        existing.originalText = originalText
      }

      const incomingWords = Array.isArray(sentence.words) ? sentence.words : []
      if (incomingWords.length > 0) {
        existing.words = incomingWords.map((word: any) => ({
          text: String(word.text || ''),
          beginIndex: Number(word.begin_index || 0),
          endIndex: Number(word.end_index || 0),
          beginTime: Number(word.begin_time || 0),
          endTime: Number(word.end_time || 0),
        }))
      }

      sentenceMap.set(sentence.index, existing)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      consumeEventData(line)
    }
  }

  if (buffer.trim()) {
    consumeEventData(buffer.trim())
  }

  if (!finalAudioUrl) {
    throw new Error('阿里云 TTS 未返回音频 URL')
  }

  return {
    requestId,
    audio: {
      url: finalAudioUrl,
      id: finalAudioId || undefined,
      expiresAt: finalExpiresAt,
    },
    usage: {
      characters,
    },
    sentences: Array.from(sentenceMap.values()).sort((a, b) => a.index - b.index),
  }
}

// ==========================================
// 剧本生成器（支持分题型）
// ==========================================

async function generateScript(problem: string, socketId?: string): Promise<Script | null> {
  const zai = await getZAI(socketId)
  
  // Step 1: LLM分析题目类型并生成讲解剧本
  const systemPrompt = `你是一位资深数学老师，正在给学生讲解题目。

首先判断题目类型：
- text型：纯文本计算题（方程、代数、计算等），不需要画图
- graph型：需要画图的题目（函数、几何、坐标、图像等）

请生成讲解剧本，格式如下（JSON）：
{
  "problemType": "text" 或 "graph",
  "segments": [
    {
      "type": "intro",
      "speak": "导入讲解（简短）",
      "boardItems": []
    },
    {
      "type": "main", 
      "speak": "详细讲解内容",
      "boardItems": [
        {
          "type": "text",
          "content": "板书内容",
          "position": {"x": 60, "y": 60}
        },
        {
          "type": "graph",
          "graphType": "coordinate",
          "content": "坐标系",
          "position": {"x": 400, "y": 100},
          "graphData": {
            "range": {"xMin": -5, "xMax": 5, "yMin": -3, "yMax": 5}
          }
        },
        {
          "type": "graph",
          "graphType": "function",
          "content": "y=2x+1",
          "position": {"x": 400, "y": 100},
          "graphData": {
            "function": "2*x+1"
          }
        },
        {
          "type": "graph",
          "graphType": "point",
          "content": "交点",
          "graphData": {
            "points": [{"x": 0, "y": 1, "label": "A"}]
          }
        }
      ]
    },
    {
      "type": "summary",
      "speak": "总结回顾",
      "boardItems": []
    }
  ]
}

要求：
1. 讲解要口语化，像老师讲课
2. 纯文本题：boardItems只有type为text的项
3. 画图题：需要先画坐标系(graphType: coordinate)，再画函数或图形
4. 每个boardItem会按顺序触发，时间自动分配
5. position的y值要递增，避免重叠（每行约70像素）`

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: `题目：${problem}\n\n请分析题目类型并生成讲解剧本。` }
    ],
    thinking: { type: 'disabled' }
  })

  const responseText = completion.choices[0]?.message?.content || ''
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  const data = JSON.parse(jsonMatch[0])
  
  // Step 2: 拼接完整讲解文本
  const fullText = data.segments.map((s: any) => s.speak).join(' ')
  
  // Step 3: TTS生成语音
  const audioResponse = await zai.audio.tts.create({
    input: fullText,
    voice: 'tongtong',
    speed: 0.9,
    response_format: 'wav',
    stream: false
  })
  
  const audioBuffer = Buffer.from(new Uint8Array(await audioResponse.arrayBuffer()))
  
  // Step 4: 生成打点
  const cues: Cue[] = []
  let currentTime = 0
  let cueId = 1
  
  // 计算布局
  const isGraphType = data.problemType === 'graph'
  const layout = {
    textArea: { x: 60, y: 60, width: isGraphType ? 320 : 800, height: 500 },
    graphArea: isGraphType ? { x: 400, y: 60, width: 480, height: 400 } : undefined
  }

  for (const segment of data.segments) {
    const segmentDuration = segment.speak.length / 4
    
    if (segment.boardItems && segment.boardItems.length > 0) {
      const timePerItem = segmentDuration / segment.boardItems.length
      
      for (const item of segment.boardItems) {
        cues.push({
          id: String(cueId++),
          time: Math.round(currentTime * 10) / 10,
          type: item.type === 'graph' ? 'draw' : 'write',
          boardItem: item,
          note: segment.note
        })
        currentTime += timePerItem
      }
    } else {
      currentTime += segmentDuration
    }
  }

  return {
    problemId: generateId(),
    problem,
    problemType: data.problemType,
    audio: {
      data: audioBuffer.toString('base64'),
      duration: fullText.length / 4,
      text: fullText
    },
    cues,
    layout
  }
}

// ==========================================
// WebSocket 事件处理
// ==========================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  
  // 配置API
  socket.on('configure-api', (data: { apiKey: string; baseUrl?: string }) => {
    console.log(`API configured for socket ${socket.id}`)
    apiConfigs.set(socket.id, {
      apiKey: data.apiKey,
      baseUrl: data.baseUrl
    })
    socket.emit('api-configured', { success: true })
  })
  
  socket.on('generate-script', async (data: { problem: string }) => {
    console.log('Generating script for:', data.problem)
    
    // 检查是否有API配置
    const hasConfig = apiConfigs.has(socket.id) || (defaultApiKey || currentApiKey)
    if (!hasConfig) {
      socket.emit('error', { message: '请先配置 API Key' })
      return
    }
    
    socket.emit('status', { stage: 'generating', message: '正在分析题目...' })
    
    const script = await generateScript(data.problem, socket.id)
    
    if (!script) {
      socket.emit('error', { message: '生成失败，请重试' })
      return
    }
    
    const session: Session = {
      id: generateId(),
      script,
      isPlaying: false,
      currentTime: 0
    }
    sessions.set(session.id, session)
    
    socket.emit('script-ready', {
      sessionId: session.id,
      script
    })
  })

  socket.on('generate-tts-timeline', async (data: {
    clientRequestId?: string
    text: string
    apiKey?: string
    voice?: string
    format?: 'wav' | 'mp3' | 'pcm' | 'opus'
    sampleRate?: number
  }) => {
    try {
      const text = String(data.text || '').trim()
      if (!text) {
        socket.emit('error', { message: '请输入要合成的文本' })
        return
      }

      socket.emit('status', { stage: 'tts-timeline', message: '正在生成音频和字级时间轴...' })

      const result = await generateAliyunTtsTimeline(text, {
        apiKey: data.apiKey,
        voice: data.voice,
        format: data.format,
        sampleRate: data.sampleRate,
      })

      socket.emit('tts-timeline-ready', {
        ...result,
        clientRequestId: data.clientRequestId,
      })
    } catch (error) {
      socket.emit('tts-timeline-error', {
        message: error instanceof Error ? error.message : 'TTS 时间轴生成失败',
        clientRequestId: data.clientRequestId,
      })
    }
  })
  
  socket.on('play', (data: { sessionId: string }) => {
    const session = sessions.get(data.sessionId)
    if (session) {
      session.isPlaying = true
      socket.emit('playing', { sessionId: data.sessionId })
    }
  })
  
  socket.on('pause', (data: { sessionId: string }) => {
    const session = sessions.get(data.sessionId)
    if (session) {
      session.isPlaying = false
      socket.emit('paused', { sessionId: data.sessionId })
    }
  })
  
  socket.on('stop', (data: { sessionId: string }) => {
    const session = sessions.get(data.sessionId)
    if (session) {
      session.isPlaying = false
      session.currentTime = 0
      socket.emit('stopped', { sessionId: data.sessionId })
    }
  })
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    apiConfigs.delete(socket.id)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`🎬 Director Service running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
