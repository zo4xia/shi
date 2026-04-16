/**
 * Feishu WSClient Gateway
 * 使用 @larksuiteoapi/node-sdk 的 WebSocket 长连接模式
 * 无需公网URL，客户端主动连接飞书服务器
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import type { CoworkStore } from '../../src/main/coworkStore';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import {
  getFeishuSchedulerBindingKey,
  resolveFeishuSchedulerBindingCommand,
  type FeishuSchedulerBinding,
} from '../../src/shared/feishuSchedulerBinding';
import type { SqliteStore } from '../sqliteStore.web';
import { getOrCreateWebSessionExecutor } from './httpSessionExecutor';
import {
  getOrCreateFeishuSession as cleanRoomGetOrCreateFeishuSession,
} from '../../clean-room/spine/modules/feishuSessionSpine';
import { parseFile } from './fileParser';
import {
  collectFeishuArtifacts,
} from './feishuArtifacts';

// Constants
const FEISHU_MESSAGE_MAX_CHARS = 3500;
const MESSAGE_DEDUP_TTL = 5 * 60_000;
const MESSAGE_STALE_TTL = 2 * 60_000; // {标记} 超过2分钟的积压消息视为过期，丢弃不处理
const FEISHU_EMPTY_RESULT_MESSAGE = '已收到消息，但这一轮没有生成可发送的文本结果。';
const FEISHU_STATUS_PROCESSING_MESSAGE = '[状态] 正在回复';
const FEISHU_STATUS_SENT_MESSAGE = '[状态] 已发送';
const FEISHU_STATUS_MESSAGE_DELAY_MS = 1200;
const FEISHU_TOOL_STATUS_POLL_INTERVAL_MS = 700;
const DEFAULT_AGENT_ROLE_KEY = 'organizer';

const ROLE_LABELS: Record<string, string> = {
  organizer: '浏览器助手',
  writer: '文字撰写员',
  designer: '美术编辑师',
  analyst: '数据分析师',
};

function extractMentionOpenIds(mentions: any[] | undefined): string[] {
  if (!Array.isArray(mentions)) {
    return [];
  }
  return mentions
    .map((mention) => (typeof mention?.id?.open_id === 'string' ? mention.id.open_id.trim() : ''))
    .filter(Boolean);
}

function resolveMentionFallbackOpenId(mentions: any[] | undefined, sender: any): string | null {
  const senderOpenId = typeof sender?.sender_id?.open_id === 'string'
    ? sender.sender_id.open_id.trim()
    : '';
  const mentionOpenIds = extractMentionOpenIds(mentions);
  const candidate = mentionOpenIds.find((openId) => openId && openId !== senderOpenId);
  return candidate ?? mentionOpenIds[0] ?? null;
}

function buildFeishuSchedulerBindingReply(params: {
  store: SqliteStore | null;
  agentRoleKey: string;
  appId: string;
  appName: string;
  chatId: string;
  senderId: string;
  chatType?: 'p2p' | 'group';
  text: string;
}): string | null {
  const command = resolveFeishuSchedulerBindingCommand(params.text);
  if (!command || !params.store) {
    return null;
  }
  if (params.chatType !== 'p2p') {
    return '当前只支持飞书私聊开启定时通知，不支持群聊。';
  }

  const key = getFeishuSchedulerBindingKey(params.agentRoleKey);
  if (command === 'disable') {
    params.store.delete(key);
    return `已关闭 ${ROLE_LABELS[params.agentRoleKey] || params.agentRoleKey} 的飞书定时通知绑定。`;
  }

  const binding: FeishuSchedulerBinding = {
    agentRoleKey: params.agentRoleKey,
    appId: params.appId,
    appName: params.appName,
    chatId: params.chatId,
    senderId: params.senderId,
    chatType: 'p2p',
    updatedAt: new Date().toISOString(),
  };
  params.store.set(key, binding);
  return `已开启 ${ROLE_LABELS[params.agentRoleKey] || params.agentRoleKey} 的飞书定时通知绑定。后续在定时任务里启用飞书通知并选择该角色即可生效。`;
}

// Types
export interface FeishuGatewayConfig {
  appId: string;
  appSecret: string;
  agentRoleKey?: string;
  botOpenId?: string | null;
  domain?: 'feishu' | 'lark';
  debug?: boolean;
}

export interface FeishuGatewayStatus {
  connected: boolean;
  startedAt: string | null;
  appId: string | null;
  botOpenId: string | null;
  botName: string | null;
  error: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

// Dedup cache
const processedMessages = new Map<string, number>();
const processingMessages = new Set<string>();

function cleanupProcessedMessages(): void {
  const now = Date.now();
  for (const [id, ts] of processedMessages) {
    if (now - ts > MESSAGE_DEDUP_TTL) processedMessages.delete(id);
  }
}

function splitMessageChunks(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [FEISHU_EMPTY_RESULT_MESSAGE];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > FEISHU_MESSAGE_MAX_CHARS) {
    let cut = remaining.lastIndexOf('\n', FEISHU_MESSAGE_MAX_CHARS);
    if (cut < FEISHU_MESSAGE_MAX_CHARS * 0.5) cut = FEISHU_MESSAGE_MAX_CHARS;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

function extractNewAssistantReplies(
  session: { messages?: Array<{ id?: string; type?: string; content?: string; metadata?: Record<string, unknown> }> } | null,
  knownIds: Set<string>
): string[] {
  if (!session?.messages?.length) {
    return [];
  }

  return session.messages
    .filter((message) => (
      message.type === 'assistant'
      && typeof message.id === 'string'
      && !knownIds.has(message.id)
      && !message.metadata?.isThinking
      && (() => {
        const stage = typeof message.metadata?.stage === 'string'
          ? message.metadata.stage.trim()
          : '';
        return !stage || stage === 'final_result';
      })()
    ))
    .map((message) => message.content?.trim())
    .filter((content): content is string => Boolean(content));
}

function createDelayedStatusController(task: () => Promise<unknown>, delayMs: number): {
  wait: () => Promise<boolean>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let resolved = false;
  let resolvePromise: ((value: boolean) => void) | null = null;

  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = (value: boolean) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(value);
    };
    timer = setTimeout(() => {
      timer = null;
      if (cancelled) {
        resolvePromise?.(false);
        return;
      }

      void task()
        .then(() => {
          resolvePromise?.(true);
        })
        .catch((error) => {
          console.error('[Feishu WS] Delayed status send failed:', error);
          resolvePromise?.(false);
        });
    }, delayMs);
  });

  return {
    wait: () => promise,
    cancel: () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
        resolvePromise?.(false);
      }
    },
  };
}

function formatFeishuToolStatus(toolName: string): string {
  const normalized = String(toolName || '').trim();
  if (!normalized) {
    return '[状态] 正在调用工具';
  }

  const labelMap: Record<string, string> = {
    browser_observe_page: '小眼睛观察页面',
    ima_search_notes: 'IMA 搜索笔记',
    ima_get_note: 'IMA 读取笔记',
    ima_create_note: 'IMA 保存笔记',
    conversation_search: '搜索历史对话',
    recent_chats: '读取最近对话',
    memory_user_edits: '编辑记忆',
    AskUserQuestion: '请求人工确认',
  };

  return `[状态] 正在调用工具：${labelMap[normalized] ?? normalized}`;
}

function createFeishuToolStatusMonitor(params: {
  getSession: () => { messages?: Array<{ id?: string; type?: string; metadata?: Record<string, unknown> }> } | null;
  knownToolUseIds?: Set<string>;
  sendStatus: (text: string) => Promise<unknown>;
  intervalMs?: number;
}): { stop: () => void } {
  const seenToolUseIds = new Set<string>(params.knownToolUseIds ?? []);
  let polling = false;

  const tick = async () => {
    if (polling) {
      return;
    }
    polling = true;
    try {
      const session = params.getSession();
      const toolUseMessages = session?.messages?.filter((message) => message.type === 'tool_use') ?? [];
      for (const message of toolUseMessages) {
        const toolUseId = typeof message.metadata?.toolUseId === 'string'
          ? message.metadata.toolUseId
          : message.id;
        if (!toolUseId || seenToolUseIds.has(toolUseId)) {
          continue;
        }
        seenToolUseIds.add(toolUseId);
        const toolName = typeof message.metadata?.toolName === 'string'
          ? message.metadata.toolName
          : '';
        await params.sendStatus(formatFeishuToolStatus(toolName));
      }
    } catch (error) {
      console.error('[Feishu WS] Tool status monitor failed:', error);
    } finally {
      polling = false;
    }
  };

  const intervalId = setInterval(() => {
    void tick();
  }, params.intervalMs ?? FEISHU_TOOL_STATUS_POLL_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(intervalId);
    },
  };
}

export class FeishuGateway extends EventEmitter {
  private wsClient: any = null;
  private restClient: any = null;
  private config: FeishuGatewayConfig | null = null;
  private status: FeishuGatewayStatus = {
    connected: false, startedAt: null, appId: null, botOpenId: null, botName: null,
    error: null, lastInboundAt: null, lastOutboundAt: null,
  };
  private botOpenId: string | null = null;
  private log: (...args: any[]) => void = () => {};

  // Dependencies injected after construction
  private coworkStore: CoworkStore | null = null;
  private store: SqliteStore | null = null;
  private buildSelectedSkillsPrompt: ((skillIds: string[]) => string | null) | null = null;
  private readonly chatTurnQueues = new Map<string, Promise<void>>();
  private lifecycleToken = 0;

  constructor() {
    super();
  }

  setDependencies(deps: {
    coworkStore: CoworkStore;
    store: SqliteStore;
    buildSelectedSkillsPrompt?: ((skillIds: string[]) => string | null) | null;
  }): void {
    this.coworkStore = deps.coworkStore;
    this.store = deps.store;
    this.buildSelectedSkillsPrompt = deps.buildSelectedSkillsPrompt ?? null;
  }

  private persistBotOpenId(botOpenId: string): void {
    const normalized = String(botOpenId || '').trim();
    if (!normalized || !this.store || !this.config?.appId) {
      return;
    }

    const currentConfig = this.store.get('im_config') as Record<string, any> | null;
    const safeConfig = currentConfig && typeof currentConfig === 'object' ? currentConfig : {};
    const currentFeishu = safeConfig.feishu && typeof safeConfig.feishu === 'object'
      ? safeConfig.feishu
      : { enabled: true, apps: [] };
    const currentApps = Array.isArray(currentFeishu.apps) ? currentFeishu.apps : [];

    let changed = false;
    let matched = false;
    const nextApps = currentApps.map((app: Record<string, any>) => {
      if (!app || typeof app !== 'object' || String(app.appId || '').trim() !== this.config?.appId) {
        return app;
      }
      matched = true;

      if (String(app.botOpenId || '').trim() === normalized) {
        return app;
      }

      changed = true;
      return {
        ...app,
        botOpenId: normalized,
      };
    });

    if (!matched) {
      changed = true;
      nextApps.push({
        id: `persisted-feishu-${this.config.appId}`,
        name: this.config.appId,
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        agentRoleKey: this.config.agentRoleKey || DEFAULT_AGENT_ROLE_KEY,
        botOpenId: normalized,
        enabled: true,
        createdAt: Date.now(),
      });
    }

    if (!changed) {
      return;
    }

    this.store.set('im_config', {
      ...safeConfig,
      feishu: {
        ...currentFeishu,
        enabled: true,
        apps: nextApps,
      },
    });
    this.log(`[Feishu WS] Persisted botOpenId for ${this.config.appId}: ${normalized}`);
  }

  private rememberBotOpenId(botOpenId: string | null | undefined, source: 'config' | 'probe' | 'mention'): void {
    const normalized = String(botOpenId || '').trim();
    if (!normalized || this.botOpenId === normalized) {
      return;
    }

    this.botOpenId = normalized;
    this.status = {
      ...this.status,
      botOpenId: normalized,
    };
    this.log(`[Feishu WS] Bound botOpenId from ${source}: ${normalized}`);
    this.persistBotOpenId(normalized);
  }

  // {埋点} 🔄 Gateway状态 (ID: feishu-gw-003) getStatus() → {connected, startedAt, botOpenId, error}
  getStatus(): FeishuGatewayStatus { return { ...this.status }; }
  isConnected(): boolean { return this.status.connected; }

  // {埋点} ⚡ Gateway启动 (ID: feishu-gw-002) WSClient长连接 → status.connected=true
  async start(config: FeishuGatewayConfig): Promise<void> {
    if (this.wsClient) {
      throw new Error('Feishu gateway already running');
    }
    if (!config.appId || !config.appSecret) {
      throw new Error('Feishu appId and appSecret are required');
    }

    this.config = config;
    this.lifecycleToken += 1;
    const currentLifecycleToken = this.lifecycleToken;
    this.log = config.debug ? console.log.bind(console) : () => {};
    this.log('[Feishu WS] Starting WebSocket gateway...');
    this.botOpenId = String(config.botOpenId || '').trim() || null;

    try {
      const Lark = await import('@larksuiteoapi/node-sdk');
      const domain = config.domain === 'lark' ? Lark.Domain.Lark : Lark.Domain.Feishu;

      // REST client for sending messages
      this.restClient = new Lark.Client({
        appId: config.appId,
        appSecret: config.appSecret,
        appType: Lark.AppType.SelfBuild,
        domain,
      });

      // Probe bot info
      const probe = await this.probeBot();
      const probeError = probe.ok ? null : `Bot probe failed: ${probe.error}`;
      if (probeError) {
        console.warn(`[Feishu WS] ${config.appId} probe warning: ${probeError}`);
      }
      this.rememberBotOpenId(this.botOpenId, 'config');
      if (probe.ok) {
        this.rememberBotOpenId(probe.botOpenId || null, 'probe');
      }
      this.log(`[Feishu WS] Bot: ${probe.botName} (${this.botOpenId})`);

      // WSClient + EventDispatcher
      this.wsClient = new Lark.WSClient({
        appId: config.appId,
        appSecret: config.appSecret,
        domain,
        loggerLevel: config.debug ? Lark.LoggerLevel.debug : Lark.LoggerLevel.info,
      });

      const eventDispatcher = new Lark.EventDispatcher({});

      eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          if (currentLifecycleToken !== this.lifecycleToken || !this.config || !this.restClient) {
            return;
          }
          try {
            this.handleMessageEvent(data).catch(err => {
              console.error('[Feishu WS] Message handling error:', err.message);
            });
          } catch (err: any) {
            console.error('[Feishu WS] Event parse error:', err.message);
          }
        },
        'im.message.message_read_v1': async () => {},
        'im.chat.member.bot.added_v1': async (data: any) => {
          this.log('[Feishu WS] Bot added to chat:', data?.chat_id);
        },
        'im.chat.member.bot.deleted_v1': async (data: any) => {
          this.log('[Feishu WS] Bot removed from chat:', data?.chat_id);
        },
      });

      this.wsClient.start({ eventDispatcher });

      this.status = {
        connected: true,
        startedAt: new Date().toISOString(),
        appId: config.appId,
        botOpenId: this.botOpenId,
        botName: probe.botName || null,
        error: probeError,
        lastInboundAt: null,
        lastOutboundAt: null,
      };

      this.log('[Feishu WS] Gateway started successfully');
      this.emit('connected');
    } catch (error: any) {
      this.wsClient = null;
      this.restClient = null;
      this.status = {
        connected: false, startedAt: null, appId: config.appId, botOpenId: null, botName: null,
        error: error.message, lastInboundAt: null, lastOutboundAt: null,
      };
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const currentWsClient = this.wsClient;
    this.lifecycleToken += 1;
    if (!currentWsClient) {
      this.restClient = null;
      this.config = null;
      this.status = { ...this.status, connected: false, startedAt: null, appId: null, error: null };
      this.emit('disconnected');
      return;
    }
    this.log('[Feishu WS] Stopping...');
    try {
      currentWsClient.close({ force: true });
    } catch (error) {
      console.error('[Feishu WS] Failed to close ws client cleanly:', error);
    }
    this.wsClient = null;
    this.restClient = null;
    this.config = null;
    this.status = { ...this.status, connected: false, startedAt: null, appId: null, error: null };
    this.emit('disconnected');
  }

  // --- Bot probe ---
  private async probeBot(): Promise<{ ok: boolean; error?: string; botName?: string; botOpenId?: string }> {
    try {
      const res: any = await this.restClient.request({ method: 'GET', url: '/open-apis/bot/v3/info' });
      if (res.code !== 0) return { ok: false, error: res.msg };
      return {
        ok: true,
        botName: res.data?.app_name ?? res.data?.bot?.app_name,
        botOpenId: res.data?.open_id ?? res.data?.bot?.open_id,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  // --- Message handling ---
  private async handleMessageEvent(data: any): Promise<void> {
    // 【1.0链路】FEISHU-WS-INBOUND: 飞书长连接消息入口，做去重、过期丢弃、消息解析，再进入会话执行。
    const payload = data?.event && typeof data.event === 'object' ? data.event : data;
    const msg = payload?.message;
    const sender = payload?.sender;
    if (!msg?.message_id || !msg?.chat_id) return;

    // Dedup
    cleanupProcessedMessages();
    if (processedMessages.has(msg.message_id) || processingMessages.has(msg.message_id)) return;
    processingMessages.add(msg.message_id);

    // {标记} P0: 积压消息过期丢弃 — 重连后飞书会一次性推送离线期间所有消息
    // 超过2分钟的旧消息直接丢弃，避免并发爆炸
    const createTime = parseInt(msg.create_time, 10);
    if (createTime && !isNaN(createTime)) {
      const ageMs = Date.now() - createTime;
      if (ageMs > MESSAGE_STALE_TTL) {
        this.log(`[Feishu WS] 丢弃过期消息: age=${Math.round(ageMs / 1000)}s, msgId=${msg.message_id}`);
        return;
      }
    }

    // Ignore bot messages
    if (sender?.sender_type === 'app' || sender?.sender_type === 'bot') return;

    const msgType = msg.message_type || 'text';
    const supportedTypes = ['text', 'image', 'file', 'post'];
    if (!supportedTypes.includes(msgType)) return;

    // Group chat: require @bot, but degrade gracefully if probe did not return botOpenId.
    if (msg.chat_type === 'group') {
      const mentionOpenIds = extractMentionOpenIds(msg.mentions);
      const hasAnyMention = Array.isArray(msg.mentions) && msg.mentions.length > 0;
      if (!this.botOpenId) {
        const learnedBotOpenId = resolveMentionFallbackOpenId(msg.mentions, sender);
        if (learnedBotOpenId) {
          this.rememberBotOpenId(learnedBotOpenId, 'mention');
        }
      }

      const preciseMentioned = Boolean(this.botOpenId && mentionOpenIds.includes(this.botOpenId));
      const fallbackMentioned = !this.botOpenId && hasAnyMention;
      const mentioned = preciseMentioned || fallbackMentioned || hasAnyMention;
      if (!mentioned) {
        this.log('[Feishu WS] Ignore group message without bot mention');
        return;
      }
    }

    // Parse content based on message type
    let text = '';
    const imageAttachments: Array<{ name: string; mimeType: string; base64Data: string }> = [];

    try {
      const content = JSON.parse(msg.content);

      if (msgType === 'text') {
        text = this.stripMentions(content.text || '', msg.mentions);
      } else if (msgType === 'post') {
        text = this.extractPostText(content, msg.mentions);
      } else if (msgType === 'image') {
        const imageKey = content.image_key;
        if (imageKey) {
          const imgData = await this.downloadMessageResource(msg.message_id, imageKey, 'image');
          if (imgData) {
            imageAttachments.push({
              name: `feishu_image_${imageKey}.png`,
              mimeType: imgData.mimeType || 'image/png',
              base64Data: imgData.base64,
            });
            text = '[用户发送了一张图片，请描述或分析图片内容]';
          }
        }
      } else if (msgType === 'file') {
        const fileKey = content.file_key;
        const fileName = content.file_name || 'unknown_file';
        if (fileKey) {
          const fileData = await this.downloadMessageResource(msg.message_id, fileKey, 'file');
          if (fileData) {
            if (fileData.mimeType?.startsWith('image/')) {
              imageAttachments.push({ name: fileName, mimeType: fileData.mimeType, base64Data: fileData.base64 });
              text = `[用户发送了文件: ${fileName}，这是一张图片，请描述或分析]`;
            } else {
              const result = await parseFile(fileName, Buffer.from(fileData.base64, 'base64'));
              if (result.success) {
                text = `[用户发送了文件: ${fileName}]\n\n文件内容:\n${result.text}\n\n请分析或处理以上文件内容。`;
              } else {
                const sizeKB = Math.round(Buffer.from(fileData.base64, 'base64').length / 1024);
                text = `[用户发送了文件: ${fileName}，类型: ${fileData.mimeType}，大小: ${sizeKB}KB]\n\n${result.error || '该文件格式暂不支持直接读取内容'}，请告知用户。`;
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[Feishu WS] Content parse error (${msgType}):`, err.message);
      return;
    }

    if (!text.trim() && imageAttachments.length === 0) return;

    this.status.lastInboundAt = Date.now();
    const chatId = msg.chat_id;
    const messageId = msg.message_id;
    const senderId = String(sender?.sender_id?.open_id || sender?.sender_id?.user_id || '').trim();

    console.log(`[Feishu WS] Message: type=${msgType}, chatId=${chatId}, text=${(text || '').substring(0, 50)}, images=${imageAttachments.length}`);

    try {
      const currentConfig = this.config;
      if (!currentConfig) {
        return;
      }
      const schedulerBindingReply = buildFeishuSchedulerBindingReply({
        store: this.store,
        agentRoleKey: currentConfig.agentRoleKey || DEFAULT_AGENT_ROLE_KEY,
        appId: currentConfig.appId,
        appName: ROLE_LABELS[currentConfig.agentRoleKey || DEFAULT_AGENT_ROLE_KEY] || currentConfig.appId,
        chatId,
        senderId,
        chatType: msg.chat_type,
        text,
      });
      if (schedulerBindingReply) {
        await this.sendTextReply(chatId, schedulerBindingReply, messageId);
        processedMessages.set(msg.message_id, Date.now());
        return;
      }

      await this.processConversation(chatId, messageId, text || '[图片]', imageAttachments.length > 0 ? imageAttachments : undefined);
      processedMessages.set(msg.message_id, Date.now());
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Feishu WS] Process conversation failed:', errorMessage);
      await this.sendTextReply(chatId, `处理失败：${errorMessage}`, messageId);
    } finally {
      processingMessages.delete(msg.message_id);
    }
  }

  private extractPostText(content: any, mentions?: any[]): string {
    // Feishu post format: { title, content: [[{tag, text}, ...], ...] }
    const parts: string[] = [];
    if (content.title) parts.push(content.title);
    const lines = content.content || content.zh_cn?.content || content.en_us?.content || [];
    for (const line of lines) {
      if (!Array.isArray(line)) continue;
      for (const seg of line) {
        if (seg.tag === 'text' && seg.text) parts.push(seg.text);
        if (seg.tag === 'a' && seg.text) parts.push(seg.text);
      }
    }
    const result = parts.join(' ');
    return this.stripMentions(result, mentions);
  }

  private async downloadMessageResource(messageId: string, fileKey: string, resourceType: 'image' | 'file'): Promise<{ base64: string; mimeType: string } | null> {
    if (!this.config?.appId || !this.config?.appSecret) return null;
    try {
      // Step 1: Get tenant_access_token
      const tokenResp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
      });
      const tokenData = await tokenResp.json() as any;
      if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
        console.error('[Feishu WS] Failed to get access token:', tokenData.msg);
        return null;
      }

      // Step 2: Download resource via REST API
      const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${resourceType}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${tokenData.tenant_access_token}` },
      });

      if (!resp.ok) {
        console.error(`[Feishu WS] Download failed: status=${resp.status}`);
        return null;
      }

      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length === 0) return null;

      console.log(`[Feishu WS] Downloaded ${resourceType}: ${buf.length} bytes`);

      // Detect mime type from magic bytes
      let mimeType = 'application/octet-stream';
      if (buf[0] === 0x89 && buf[1] === 0x50) mimeType = 'image/png';
      else if (buf[0] === 0xFF && buf[1] === 0xD8) mimeType = 'image/jpeg';
      else if (buf[0] === 0x47 && buf[1] === 0x49) mimeType = 'image/gif';
      else if (buf[0] === 0x52 && buf[1] === 0x49) mimeType = 'image/webp';
      else if (buf[0] === 0x25 && buf[1] === 0x50) mimeType = 'application/pdf';

      return { base64: buf.toString('base64'), mimeType };
    } catch (err: any) {
      console.error(`[Feishu WS] Download resource failed (${resourceType}/${fileKey}):`, err.message);
      return null;
    }
  }

  private async processConversation(chatId: string, replyToMessageId: string, text: string, imageAttachments?: Array<{ name: string; mimeType: string; base64Data: string }>): Promise<void> {
    // 【1.0链路】FEISHU-WS-EXEC: 飞书 WS 当前稳定主链 = 绑定会话 -> HttpSessionExecutor -> 回帖/回传文件。
    // {标记} P0-FEISHU-QUEUE-COMPAT: 同一 chat 改为顺序串行，不再 busy 硬拦后续消息，避免把 agent 当成一次一句的 RPA。
    await this.enqueueChatTurn(chatId, async () => {
      if (!this.coworkStore || !this.store) {
        console.error('[Feishu WS] Dependencies not set');
        return;
      }

      const agentRoleKey = this.config?.agentRoleKey || DEFAULT_AGENT_ROLE_KEY;
      const binding = this.resolveAgentBinding(agentRoleKey);
      const sessionExecutor = this.createFeishuSessionExecutor(binding.agentRoleKey);

      const session = this.getOrCreateSession(binding, chatId);
      const delayedStatus = createDelayedStatusController(
        () => this.sendTextReply(chatId, FEISHU_STATUS_PROCESSING_MESSAGE),
        FEISHU_STATUS_MESSAGE_DELAY_MS
      );
      let processingStatusSent = false;

      const baseSession = this.coworkStore.getSession(session.id) as any;
      const knownIds = new Set<string>(
        (baseSession?.messages ?? [])
          .map((m: any) => (typeof m?.id === 'string' ? m.id : ''))
          .filter(Boolean)
      );
      const knownToolUseIds = new Set<string>(
        (baseSession?.messages ?? [])
          .filter((message: any) => message?.type === 'tool_use')
          .map((message: any) => (
            typeof message?.metadata?.toolUseId === 'string' ? message.metadata.toolUseId : message?.id
          ))
          .filter(Boolean)
      );
      const runStartedAt = Date.now();
      const turnSystemPrompt = undefined;
      const toolStatusMonitor = createFeishuToolStatusMonitor({
        getSession: () => this.coworkStore?.getSession(session.id) as any,
        knownToolUseIds,
        sendStatus: (statusText) => this.sendTextReply(chatId, statusText),
      });

      try {
        await sessionExecutor.runChannelFastTurn(session.id, text, {
          imageAttachments,
          confirmationMode: 'text',
          autoApprove: true,
          workspaceRoot: getProjectRoot(),
          systemPrompt: turnSystemPrompt,
        });
      } catch (err: any) {
        console.error('[Feishu WS] Session executor error:', err.message);
      } finally {
        toolStatusMonitor.stop();
        delayedStatus.cancel();
        processingStatusSent = await delayedStatus.wait();
      }

      const completed = this.coworkStore.getSession(session.id) as any;
      const rawReplies = extractNewAssistantReplies(completed, knownIds);
      const artifactResult = collectFeishuArtifacts({
        sessionMessages: completed?.messages ?? [],
        knownMessageIds: knownIds,
        workspaceRoot: getProjectRoot(),
        runStartedAt,
      });
      const replies = (() => {
        if (artifactResult.cleanText) {
          if (rawReplies.length === 0) {
            return [artifactResult.cleanText];
          }
          return [...rawReplies.slice(0, -1), artifactResult.cleanText];
        }
        return rawReplies;
      })();

      if (replies.length > 0) {
        let currentReplyToMessageId = replyToMessageId;
        for (const reply of replies) {
          const replySent = await this.sendTextReply(chatId, reply, currentReplyToMessageId);
          if (!replySent) {
            throw new Error('Feishu outbound reply send failed');
          }
          currentReplyToMessageId = '';
        }
        await this.sendArtifactsReply(chatId, artifactResult.artifacts, replyToMessageId);
        if (processingStatusSent) {
          await this.sendTextReply(chatId, FEISHU_STATUS_SENT_MESSAGE);
        }
        return;
      }

      const errMsg = (completed?.messages ?? [])
        .slice().reverse()
        .find((m: any) => m.type === 'system' && m.content?.trim());
      if (errMsg) {
        const errSent = await this.sendTextReply(chatId, `处理失败：${errMsg.content}`, replyToMessageId);
        if (!errSent) {
          throw new Error('Feishu outbound error message send failed');
        }
        if (processingStatusSent) {
          await this.sendTextReply(chatId, FEISHU_STATUS_SENT_MESSAGE);
        }
        return;
      }

      if (artifactResult.artifacts.length > 0) {
        const artifactNoticeSent = await this.sendTextReply(chatId, '已附上处理结果文件。', replyToMessageId);
        if (!artifactNoticeSent) {
          throw new Error('Feishu outbound artifact notice send failed');
        }
        await this.sendArtifactsReply(chatId, artifactResult.artifacts, replyToMessageId);
        if (processingStatusSent) {
          await this.sendTextReply(chatId, FEISHU_STATUS_SENT_MESSAGE);
        }
        return;
      }

      const emptySent = await this.sendTextReply(chatId, FEISHU_EMPTY_RESULT_MESSAGE, replyToMessageId);
      if (!emptySent) {
        throw new Error('Feishu outbound empty-result send failed');
      }
      if (processingStatusSent) {
        await this.sendTextReply(chatId, FEISHU_STATUS_SENT_MESSAGE);
      }
    });
  }

  private enqueueChatTurn(chatId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.chatTurnQueues.get(chatId) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(task);
    const tracked = queued.finally(() => {
      if (this.chatTurnQueues.get(chatId) === tracked) {
        this.chatTurnQueues.delete(chatId);
      }
    });
    this.chatTurnQueues.set(chatId, tracked);
    return tracked;
  }

  private createFeishuSessionExecutor(_agentRoleKey: string) {
    // 【1.0链路】FEISHU-WS-EXECUTOR: 当前稳定版飞书不直挂复杂工具链，统一走 web 直连执行器。
    return getOrCreateWebSessionExecutor({
      store: this.coworkStore!,
      configStore: this.store!,
      buildSelectedSkillsPrompt: (skillIds: string[]) => (
        this.buildSelectedSkillsPrompt?.(skillIds)
        ?? null
      ),
    });
  }

  private resolveRuntimeRoleKey(agentRoleKey: string): string {
    return agentRoleKey === 'writer' || agentRoleKey === 'designer' || agentRoleKey === 'analyst'
      ? agentRoleKey
      : DEFAULT_AGENT_ROLE_KEY;
  }

  private resolveAgentBinding(agentRoleKey: string): { agentRoleKey: string; modelId: string; roleLabel: string } {
    if (!this.coworkStore) throw new Error('coworkStore not set');
    if (!this.store) throw new Error('store not set');
    const identityRoleKey = (agentRoleKey || DEFAULT_AGENT_ROLE_KEY).trim() || DEFAULT_AGENT_ROLE_KEY;
    const runtimeRoleKey = this.resolveRuntimeRoleKey(identityRoleKey);
    const configData = this.store.get('app_config');
    const config = (configData && typeof configData === 'object') ? configData as Record<string, any> : {};
    const roleConfig = config.agentRoles?.[runtimeRoleKey];
    if (!roleConfig?.enabled || !roleConfig.modelId) {
      throw new Error(`Runtime role "${runtimeRoleKey}" not configured for Feishu binding "${identityRoleKey}"`);
    }
    return {
      agentRoleKey: identityRoleKey,
      modelId: roleConfig.modelId,
      roleLabel: ROLE_LABELS[runtimeRoleKey] ?? identityRoleKey,
    };
  }

  private getOrCreateSession(binding: { agentRoleKey: string; modelId: string; roleLabel: string }, chatId: string): any {
    if (!this.coworkStore) throw new Error('coworkStore not set');
    if (!this.store) throw new Error('store not set');
    return cleanRoomGetOrCreateFeishuSession(
      this.coworkStore,
      this.store as any,
      {
        appId: this.config?.appId || 'unknown',
        name: binding.roleLabel,
      },
      binding,
      chatId,
      getProjectRoot()
    );
  }

  private stripMentions(text: string, mentions?: any[]): string {
    if (!text || !Array.isArray(mentions) || !mentions.length) return text.trim();
    let result = text;
    for (const m of mentions) {
      if (m.name) result = result.replace(new RegExp(`@${m.name}\\s*`, 'g'), ' ');
      if (m.key) result = result.replace(new RegExp(m.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    }
    return result.replace(/\s+/g, ' ').trim();
  }

  private async sendTextReply(chatId: string, text: string, replyToMessageId?: string): Promise<boolean> {
    if (!this.restClient) {
      console.error('[Feishu WS] Send skipped: REST client not ready');
      return false;
    }
    const chunks = splitMessageChunks(text);
    let sent = false;
    for (const chunk of chunks) {
      try {
        if (replyToMessageId) {
          await this.restClient.im.message.reply({
            path: { message_id: replyToMessageId },
            data: { content: JSON.stringify({ text: chunk }), msg_type: 'text' },
          });
        } else {
          await this.restClient.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: { receive_id: chatId, content: JSON.stringify({ text: chunk }), msg_type: 'text' },
          });
        }
        this.status.lastOutboundAt = Date.now();
        sent = true;
      } catch (err: any) {
        console.error('[Feishu WS] Send failed:', err.message);
        return false;
      }
      // Only reply to first chunk, rest are new messages
      replyToMessageId = undefined;
    }
    return sent;
  }

  private async uploadImage(buffer: Buffer): Promise<string | null> {
    if (!this.restClient) return null;
    try {
      const response = await this.restClient.im.image.create({
        data: {
          image_type: 'message',
          image: buffer,
        },
      });
      return typeof response?.image_key === 'string' ? response.image_key : null;
    } catch (error: any) {
      console.error('[Feishu WS] Image upload failed:', error?.message || error);
      return null;
    }
  }

  private async uploadFile(filePath: string, buffer: Buffer): Promise<string | null> {
    if (!this.restClient) return null;
    try {
      const extension = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'bin';
      const response = await this.restClient.im.file.create({
        data: {
          file_type: extension,
          file_name: path.basename(filePath),
          file: buffer,
        },
      });
      return typeof response?.file_key === 'string' ? response.file_key : null;
    } catch (error: any) {
      console.error('[Feishu WS] File upload failed:', error?.message || error);
      return null;
    }
  }

  private async sendImageReply(chatId: string, imageKey: string, replyToMessageId?: string): Promise<void> {
    if (!this.restClient) return;
    try {
      if (replyToMessageId) {
        await this.restClient.im.message.reply({
          path: { message_id: replyToMessageId },
          data: { content: JSON.stringify({ image_key: imageKey }), msg_type: 'image' },
        });
      } else {
        await this.restClient.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: { receive_id: chatId, content: JSON.stringify({ image_key: imageKey }), msg_type: 'image' },
        });
      }
      this.status.lastOutboundAt = Date.now();
    } catch (error: any) {
      console.error('[Feishu WS] Send image failed:', error?.message || error);
    }
  }

  private async sendFileReply(chatId: string, fileKey: string, replyToMessageId?: string): Promise<void> {
    if (!this.restClient) return;
    try {
      if (replyToMessageId) {
        await this.restClient.im.message.reply({
          path: { message_id: replyToMessageId },
          data: { content: JSON.stringify({ file_key: fileKey }), msg_type: 'file' },
        });
      } else {
        await this.restClient.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: { receive_id: chatId, content: JSON.stringify({ file_key: fileKey }), msg_type: 'file' },
        });
      }
      this.status.lastOutboundAt = Date.now();
    } catch (error: any) {
      console.error('[Feishu WS] Send file failed:', error?.message || error);
    }
  }

  private async sendArtifactsReply(
    chatId: string,
    artifacts: Array<{ kind: 'image' | 'file'; path: string }>,
    replyToMessageId?: string
  ): Promise<void> {
    for (const artifact of artifacts) {
      try {
        const buffer = fs.readFileSync(artifact.path);
        if (artifact.kind === 'image') {
          const imageKey = await this.uploadImage(buffer);
          if (imageKey) {
            await this.sendImageReply(chatId, imageKey, replyToMessageId);
            replyToMessageId = undefined;
          }
          continue;
        }

        const fileKey = await this.uploadFile(artifact.path, buffer);
        if (fileKey) {
          await this.sendFileReply(chatId, fileKey, replyToMessageId);
          replyToMessageId = undefined;
        }
      } catch (error: any) {
        console.error(`[Feishu WS] Failed to send artifact ${artifact.path}:`, error?.message || error);
      }
    }
  }

  /** Send a notification to a specific chat (for testing) */
  async sendNotification(chatId: string, text: string): Promise<void> {
    await this.sendTextReply(chatId, text);
  }
}
