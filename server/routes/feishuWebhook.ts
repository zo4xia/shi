/**
 * {标记} Feishu Webhook Handler
 * {标记} 功能：接收飞书消息，绑定身份，触发 AI 回复
 * {标记} 集成：HttpSessionExecutor + sessionTurnFinalizer + identity_thread_24h
 * {标记} 现役主链：飞书当前默认走轻执行链，不应被误判回 CoworkRunner 主链
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { RequestContext } from '../src/index';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import { ENV_ALIAS_PAIRS, readEnvAliasPair } from '../../src/shared/envAliases';
import {
  FEISHU_SCHEDULER_DISABLE_COMMAND,
  FEISHU_SCHEDULER_ENABLE_COMMAND,
  getFeishuSchedulerBindingKey,
  resolveFeishuSchedulerBindingCommand,
  type FeishuSchedulerBinding,
} from '../../src/shared/feishuSchedulerBinding';
import {
  findReusableFeishuSession as cleanRoomFindReusableFeishuSession,
  getOrCreateFeishuSession as cleanRoomGetOrCreateFeishuSession,
} from '../../clean-room/spine/modules/feishuSessionSpine';
import {
  dedupeRuntimeFeishuApps as cleanRoomDedupeRuntimeFeishuApps,
  resolveFeishuAgentBinding as cleanRoomResolveFeishuAgentBinding,
  resolveRuntimeFeishuApps as cleanRoomResolveRuntimeFeishuApps,
} from '../../clean-room/spine/modules/feishuRuntime';
import {
  buildFeishuInboundRequest,
  normalizeFeishuTextEnvelope,
  readFeishuWebhookEnvelope,
} from '../../clean-room/spine/modules/feishuInboundSpine';
import type { ImageAttachment } from '../../clean-room/spine/modules/inbound';
import { getOrCreateWebSessionExecutor } from '../libs/httpSessionExecutor';
import {
  collectFeishuArtifacts,
} from '../libs/feishuArtifacts';

const FEISHU_API_BASE_URL = 'https://open.feishu.cn';
const FEISHU_MESSAGE_MAX_CHARS = 3500;
const FEISHU_TOKEN_EXPIRY_BUFFER_MS = 60_000;
const FEISHU_MESSAGE_DEDUP_TTL_MS = 5 * 60_000;
const FEISHU_BUSY_MESSAGE = '正在回复上一条消息，这条还没开始处理。请稍后再发一次。';
const FEISHU_EMPTY_RESULT_MESSAGE = '已收到消息，但这一轮没有生成可发送的文本结果。';
const FEISHU_STATUS_PROCESSING_MESSAGE = '[状态] 正在回复';
const FEISHU_STATUS_SENT_MESSAGE = '[状态] 已发送';
const FEISHU_IMAGE_DOWNLOAD_FAILED_MESSAGE = '图片已收到，但这次系统没能成功读取图片内容，请重发一次。';
const FEISHU_STATUS_MESSAGE_DELAY_MS = 1200;
const FEISHU_TOOL_STATUS_POLL_INTERVAL_MS = 700;
const FEISHU_SESSION_SCOPE_PREFIX = 'im:feishu:chat:';
const DEFAULT_FEISHU_AGENT_ROLE_KEY = 'organizer';

// {FIX} 模块级变量存储gateway实例，跨请求共享
let _feishuGatewayInstance: any = null;

function resolveFeishuGateways(req: Request): any[] {
  const contextGateways = Array.isArray((req.context as any)?.feishuGateways)
    ? (req.context as any).feishuGateways
    : [];
  const legacyGateway = (req.context as any)?.feishuGateway ?? null;
  const candidates = [_feishuGatewayInstance, ...contextGateways, legacyGateway].filter(Boolean);
  const uniqueGateways: any[] = [];
  const seenAppIds = new Set<string>();

  for (const gateway of candidates) {
    const status = gateway?.getStatus?.();
    const isEmptyStoppedGateway = status
      && status.connected !== true
      && !status.appId
      && !status.startedAt
      && !status.error;
    if (isEmptyStoppedGateway && candidates.length > 1) {
      continue;
    }

    const appId = status?.appId;
    const dedupeKey = typeof appId === 'string' && appId.trim() ? appId : `gateway-${uniqueGateways.length}`;
    if (seenAppIds.has(dedupeKey)) {
      continue;
    }
    seenAppIds.add(dedupeKey);
    uniqueGateways.push(gateway);
  }

  return uniqueGateways;
}

function buildAggregatedGatewayStatus(gateways: any[]): {
  connected: boolean;
  startedAt: string | null;
  appId: string | null;
  botOpenId: string | null;
  botName: string | null;
  error: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
} {
  const statuses = gateways
    .map((gateway) => gateway?.getStatus?.())
    .filter((status) => status && typeof status === 'object');
  const connectedStatuses = statuses.filter((status) => status.connected);
  const primaryStatus = connectedStatuses[0] ?? statuses[0] ?? null;

  if (!primaryStatus) {
    return {
      connected: false,
      startedAt: null,
      appId: null,
      botOpenId: null,
      botName: null,
      error: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    };
  }

  return {
    ...primaryStatus,
    connected: connectedStatuses.length > 0,
    error: connectedStatuses.length > 0
      ? null
      : primaryStatus.error ?? null,
  };
}

function resolveActiveFeishuGateway(req: Request): any | null {
  const gateways = resolveFeishuGateways(req);
  const connectedGateway = gateways.find((gateway: any) => gateway?.isConnected?.());
  const fallbackGateway = connectedGateway ?? gateways[0] ?? null;

  if (fallbackGateway) {
    _feishuGatewayInstance = fallbackGateway;
  }

  return fallbackGateway;
}

const FEISHU_ROLE_LABELS: Record<string, string> = {
  organizer: '浏览器助手',
  writer: '文字撰写员',
  designer: '美术编辑师',
  analyst: '数据分析师',
};

const feishuTenantTokenCache = new Map<string, { token: string; expiresAt: number }>();
const processedFeishuMessages = new Map<string, number>();

type FeishuWebhookAppConfig = {
  id?: string;
  name?: string;
  appId?: string;
  appSecret?: string;
  agentRoleKey?: string;
  botOpenId?: string;
  enabled?: boolean;
  createdAt?: number;
};

type FeishuWebhookSession = {
  id: string;
  cwd: string;
  status?: string;
  systemPrompt?: string;
  messages?: Array<{ id: string; type: string; content: string; metadata?: Record<string, unknown> }>;
  agentRoleKey?: string;
  modelId?: string;
};

type FeishuAgentBinding = {
  agentRoleKey: string;
  modelId: string;
  roleLabel: string;
};

type FeishuWebhookMention = {
  key?: string;
  id?: {
    open_id?: string;
    user_id?: string;
  };
  name?: string;
};

type FeishuWebhookMessage = {
  message_id?: string;
  chat_id?: string;
  chat_type?: 'p2p' | 'group';
  message_type?: string;
  content?: string;
  mentions?: FeishuWebhookMention[];
};

type FeishuWebhookEvent = {
  sender?: {
    sender_id?: {
      user_id?: string;
      open_id?: string;
    };
    sender_type?: string;
  };
  message?: FeishuWebhookMessage;
  app_id?: string;
};

function getFeishuApiBaseUrl(): string {
  return readEnvAliasPair(ENV_ALIAS_PAIRS.feishuApiBaseUrl) ?? FEISHU_API_BASE_URL;
}

function splitFeishuMessageChunks(text: string, maxChars: number = FEISHU_MESSAGE_MAX_CHARS): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [FEISHU_EMPTY_RESULT_MESSAGE];
  }

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxChars) {
    let cutIndex = remaining.lastIndexOf('\n', maxChars);
    if (cutIndex < Math.floor(maxChars * 0.5)) {
      cutIndex = remaining.lastIndexOf(' ', maxChars);
    }
    if (cutIndex < Math.floor(maxChars * 0.5)) {
      cutIndex = maxChars;
    }
    chunks.push(remaining.slice(0, cutIndex).trim());
    remaining = remaining.slice(cutIndex).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks.filter(Boolean);
}

async function getFeishuTenantAccessToken(app: FeishuWebhookAppConfig): Promise<string> {
  if (!app.appId || !app.appSecret) {
    throw new Error('Feishu app credentials are incomplete.');
  }

  const cacheKey = app.appId;
  const cached = feishuTenantTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + FEISHU_TOKEN_EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  const response = await fetch(`${getFeishuApiBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: app.appId,
      app_secret: app.appSecret,
    }),
  });

  type FeishuTokenResponse = {
    code?: number;
    tenant_access_token?: string;
    expire?: number;
  };
  const payload = await response.json().catch(() => ({} as FeishuTokenResponse)) as FeishuTokenResponse;
  if (!response.ok || payload.code !== 0 || typeof payload.tenant_access_token !== 'string') {
    throw new Error(`Feishu tenant token request failed: HTTP ${response.status}`);
  }

  const expireSeconds = typeof payload.expire === 'number' ? payload.expire : 7200;
  const token = payload.tenant_access_token;
  feishuTenantTokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (expireSeconds * 1000),
  });
  return token;
}

function cleanupProcessedFeishuMessages(): void {
  const now = Date.now();
  for (const [messageId, timestamp] of processedFeishuMessages.entries()) {
    if (now - timestamp > FEISHU_MESSAGE_DEDUP_TTL_MS) {
      processedFeishuMessages.delete(messageId);
    }
  }
}

function isFeishuMessageProcessed(messageId: string): boolean {
  if (!messageId) {
    return false;
  }

  cleanupProcessedFeishuMessages();
  if (processedFeishuMessages.has(messageId)) {
    return true;
  }

  processedFeishuMessages.set(messageId, Date.now());
  return false;
}

function stripFeishuMentions(text: string, mentions?: FeishuWebhookMention[]): string {
  if (!text || !Array.isArray(mentions) || mentions.length === 0) {
    return text.trim();
  }

  let result = text;
  for (const mention of mentions) {
    const mentionName = mention.name?.trim();
    const mentionKey = mention.key?.trim();
    if (mentionName) {
      result = result.replace(new RegExp(`@${mentionName}\\s*`, 'g'), ' ');
    }
    if (mentionKey) {
      result = result.replace(new RegExp(mentionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    }
  }

  return result.replace(/\s+/g, ' ').trim();
}

async function sendFeishuTextReply(
  app: FeishuWebhookAppConfig,
  chatId: string,
  text: string,
  replyToMessageId?: string
): Promise<void> {
  if (!chatId && !replyToMessageId) {
    throw new Error('Feishu reply target is required for reply sending.');
  }

  const tenantAccessToken = await getFeishuTenantAccessToken(app);
  const chunks = splitFeishuMessageChunks(text);

  for (const chunk of chunks) {
    const response = replyToMessageId
      ? await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/messages/${replyToMessageId}/reply`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tenantAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg_type: 'text',
          content: JSON.stringify({ text: chunk }),
        }),
      })
      : await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tenantAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: chunk }),
        }),
      });

    const payload = await response.json().catch(() => ({})) as { code?: number };
    if (!response.ok || payload.code !== 0) {
      throw new Error(`Feishu send message failed: HTTP ${response.status}`);
    }
  }
}

function createDelayedStatusController(task: () => Promise<void>, delayMs: number): {
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
          console.error('[Feishu] Delayed status send failed:', error);
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
  getSession: () => FeishuWebhookSession | null;
  knownToolUseIds?: Set<string>;
  sendStatus: (text: string) => Promise<void>;
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
      console.error('[Feishu] Tool status monitor failed:', error);
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

async function uploadFeishuImage(
  app: FeishuWebhookAppConfig,
  filePath: string
): Promise<string | null> {
  const tenantAccessToken = await getFeishuTenantAccessToken(app);
  const form = new FormData();
  form.append('image_type', 'message');
  form.append('image', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));

  const response = await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({})) as { code?: number; data?: { image_key?: string } };
  if (!response.ok || payload.code !== 0 || typeof payload.data?.image_key !== 'string') {
    return null;
  }
  return payload.data.image_key;
}

async function uploadFeishuFile(
  app: FeishuWebhookAppConfig,
  filePath: string
): Promise<string | null> {
  const tenantAccessToken = await getFeishuTenantAccessToken(app);
  const form = new FormData();
  const extension = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'bin';
  form.append('file_type', extension);
  form.append('file_name', path.basename(filePath));
  form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));

  const response = await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({})) as { code?: number; data?: { file_key?: string } };
  if (!response.ok || payload.code !== 0 || typeof payload.data?.file_key !== 'string') {
    return null;
  }
  return payload.data.file_key;
}

async function sendFeishuImageReply(
  app: FeishuWebhookAppConfig,
  chatId: string,
  imageKey: string,
  replyToMessageId?: string
): Promise<void> {
  const tenantAccessToken = await getFeishuTenantAccessToken(app);
  const response = replyToMessageId
    ? await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/messages/${replyToMessageId}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      }),
    })
    : await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      }),
    });

  const payload = await response.json().catch(() => ({})) as { code?: number };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu send image failed: HTTP ${response.status}`);
  }
}

async function sendFeishuFileReply(
  app: FeishuWebhookAppConfig,
  chatId: string,
  fileKey: string,
  replyToMessageId?: string
): Promise<void> {
  const tenantAccessToken = await getFeishuTenantAccessToken(app);
  const response = replyToMessageId
    ? await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/messages/${replyToMessageId}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'file',
        content: JSON.stringify({ file_key: fileKey }),
      }),
    })
    : await fetch(`${getFeishuApiBaseUrl()}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'file',
        content: JSON.stringify({ file_key: fileKey }),
      }),
    });

  const payload = await response.json().catch(() => ({})) as { code?: number };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu send file failed: HTTP ${response.status}`);
  }
}

async function sendFeishuArtifacts(
  app: FeishuWebhookAppConfig,
  chatId: string,
  artifacts: Array<{ kind: 'image' | 'file'; path: string }>,
  replyToMessageId?: string
): Promise<void> {
  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.path)) {
      continue;
    }
    if (artifact.kind === 'image') {
      const imageKey = await uploadFeishuImage(app, artifact.path);
      if (imageKey) {
        await sendFeishuImageReply(app, chatId, imageKey, replyToMessageId);
        replyToMessageId = undefined;
      }
      continue;
    }

    const fileKey = await uploadFeishuFile(app, artifact.path);
    if (fileKey) {
      await sendFeishuFileReply(app, chatId, fileKey, replyToMessageId);
      replyToMessageId = undefined;
    }
  }
}

async function downloadFeishuMessageImage(
  app: FeishuWebhookAppConfig,
  messageId: string,
  imageKey: string
): Promise<ImageAttachment | null> {
  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(app);
    const response = await fetch(
      `${getFeishuApiBaseUrl()}/open-apis/im/v1/messages/${messageId}/resources/${imageKey}?type=image`,
      {
        headers: {
          Authorization: `Bearer ${tenantAccessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`[Feishu] Image download failed: status=${response.status}, messageId=${messageId}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      return null;
    }

    let mimeType = 'image/png';
    let extension = 'png';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      mimeType = 'image/jpeg';
      extension = 'jpg';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
      mimeType = 'image/gif';
      extension = 'gif';
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49) {
      mimeType = 'image/webp';
      extension = 'webp';
    }

    return {
      name: `feishu_image_${imageKey.slice(0, 16)}.${extension}`,
      mimeType,
      base64Data: buffer.toString('base64'),
    };
  } catch (error) {
    console.error(`[Feishu] Download image failed (${imageKey}):`, error);
    return null;
  }
}

function extractNewAssistantReplies(session: FeishuWebhookSession | null, knownAssistantIds: Set<string>): string[] {
  if (!session?.messages?.length) {
    return [];
  }

  return session.messages
    .filter((message) => (
      message.type === 'assistant'
      && !knownAssistantIds.has(message.id)
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

function extractLatestErrorMessage(session: FeishuWebhookSession | null): string | null {
  if (!session?.messages?.length) {
    return null;
  }

  const candidate = session.messages
    .slice()
    .reverse()
    .find((message) => message.type === 'system' && typeof message.content === 'string' && message.content.trim());

  return candidate?.content?.trim() ?? null;
}

function getFeishuSessionScopeKey(app: FeishuWebhookAppConfig, chatId: string): string {
  if (!app.appId) {
    throw new Error('Feishu appId is required for session scoping.');
  }
  return `${FEISHU_SESSION_SCOPE_PREFIX}${app.appId}:${chatId}`;
}

function resolveFeishuAgentBinding(store: any, app: FeishuWebhookAppConfig): FeishuAgentBinding {
  return cleanRoomResolveFeishuAgentBinding(store, app) as FeishuAgentBinding;
}

function findReusableFeishuSession(
  coworkStore: any,
  store: RequestContext['store'],
  app: FeishuWebhookAppConfig,
  binding: FeishuAgentBinding,
  chatId: string
): FeishuWebhookSession | null {
  return cleanRoomFindReusableFeishuSession(
    coworkStore,
    store as any,
    app,
    binding,
    chatId
  ) as FeishuWebhookSession | null;
}

function handleFeishuSchedulerBindingCommand(params: {
  store: RequestContext['store'];
  app: FeishuWebhookAppConfig;
  binding: FeishuAgentBinding;
  chatId: string;
  senderId: string;
  chatType?: 'p2p' | 'group';
  text: string;
}): { handled: boolean; replyText?: string } {
  const command = resolveFeishuSchedulerBindingCommand(params.text);
  if (!command) {
    return { handled: false };
  }

  if (params.chatType !== 'p2p') {
    return {
      handled: true,
      replyText: '当前只支持飞书私聊开启定时通知，不支持群聊。',
    };
  }

  const key = getFeishuSchedulerBindingKey(params.binding.agentRoleKey);
  if (command === 'disable') {
    params.store.delete(key);
    return {
      handled: true,
      replyText: `已关闭 ${params.binding.roleLabel} 的飞书定时通知绑定。`,
    };
  }

  const nextBinding: FeishuSchedulerBinding = {
    agentRoleKey: params.binding.agentRoleKey,
    appId: params.app.appId || '',
    appName: params.app.name || params.binding.roleLabel,
    chatId: params.chatId,
    senderId: params.senderId,
    chatType: 'p2p',
    updatedAt: new Date().toISOString(),
  };
  params.store.set(key, nextBinding);
  return {
    handled: true,
    replyText: `已开启 ${params.binding.roleLabel} 的飞书定时通知绑定。后续在定时任务里启用飞书通知并选择该角色即可生效。`,
  };
}

async function processFeishuConversation(params: {
  coworkStore: any;
  store: RequestContext['store'];
  skillManager: RequestContext['skillManager'];
  app: FeishuWebhookAppConfig;
  session: FeishuWebhookSession;
  prompt: string;
  chatId: string;
  replyToMessageId?: string;
  imageAttachments?: ImageAttachment[];
}): Promise<void> {
  // 【1.0链路】FEISHU-WEBHOOK-EXEC: 飞书 webhook 稳定主链 = 绑定会话 -> HttpSessionExecutor -> 回帖/回传文件。
  // {标记} FLOW-ROUTE-IM-FEISHU-ACTIVE: 这是当前已落地的轻链渠道执行口。
  // {标记} 待评估-可能波及: 若后续改这里，需同时核对回帖抽取、artifact 回传、shared-thread finalizer。
  const { coworkStore, store, skillManager, app, session, prompt, chatId, replyToMessageId, imageAttachments } = params;
  const sessionExecutor = getOrCreateWebSessionExecutor({
    store: coworkStore,
    configStore: store,
    buildSelectedSkillsPrompt: (skillIds: string[]) => skillManager.buildSelectedSkillsPrompt(skillIds),
  });
  const baselineSession = coworkStore.getSession(session.id) as FeishuWebhookSession | null;
  const knownAssistantIds = new Set(baselineSession?.messages?.map((message) => message.id) ?? []);
  const knownToolUseIds = new Set(
    (baselineSession?.messages ?? [])
      .filter((message) => message.type === 'tool_use')
      .map((message) => (
        typeof message.metadata?.toolUseId === 'string' ? message.metadata.toolUseId : message.id
      ))
      .filter((value): value is string => Boolean(value))
  );
  const runStartedAt = Date.now();

  if (sessionExecutor.isSessionActive(session.id) || session.status === 'running') {
    await sendFeishuTextReply(app, chatId, FEISHU_BUSY_MESSAGE, replyToMessageId);
    return;
  }

  const delayedStatus = createDelayedStatusController(
    () => sendFeishuTextReply(app, chatId, FEISHU_STATUS_PROCESSING_MESSAGE),
    FEISHU_STATUS_MESSAGE_DELAY_MS
  );
  const toolStatusMonitor = createFeishuToolStatusMonitor({
    getSession: () => coworkStore.getSession(session.id) as FeishuWebhookSession | null,
    knownToolUseIds,
    sendStatus: (text) => sendFeishuTextReply(app, chatId, text),
  });
  let processingStatusSent = false;

  try {
    await sessionExecutor.runChannelFastTurn(session.id, prompt, {
      systemPrompt: undefined,
      confirmationMode: 'text',
      autoApprove: true,
      workspaceRoot: session.cwd,
      imageAttachments,
    });
  } catch (error) {
    console.error('[Feishu] Session executor execution failed:', error);
  } finally {
    toolStatusMonitor.stop();
    delayedStatus.cancel();
    processingStatusSent = await delayedStatus.wait();
  }

  const completedSession = coworkStore.getSession(session.id) as FeishuWebhookSession | null;
  const rawReplyTexts = extractNewAssistantReplies(completedSession, knownAssistantIds);
  const artifactResult = collectFeishuArtifacts({
    sessionMessages: completedSession?.messages ?? [],
    knownMessageIds: knownAssistantIds,
    workspaceRoot: session.cwd,
    runStartedAt,
  });
  const replyTexts = (() => {
    if (artifactResult.cleanText) {
      if (rawReplyTexts.length === 0) {
        return [artifactResult.cleanText];
      }
      return [...rawReplyTexts.slice(0, -1), artifactResult.cleanText];
    }
    return rawReplyTexts;
  })();
  if (replyTexts.length > 0) {
    let currentReplyToMessageId = replyToMessageId;
    for (const replyText of replyTexts) {
      await sendFeishuTextReply(app, chatId, replyText, currentReplyToMessageId);
      currentReplyToMessageId = undefined;
    }
    await sendFeishuArtifacts(app, chatId, artifactResult.artifacts, replyToMessageId);
    if (processingStatusSent) {
      await sendFeishuTextReply(app, chatId, FEISHU_STATUS_SENT_MESSAGE);
    }
    return;
  }

  const errorText = extractLatestErrorMessage(completedSession);
  if (errorText) {
    await sendFeishuTextReply(app, chatId, `处理失败：${errorText}`, replyToMessageId);
    if (processingStatusSent) {
      await sendFeishuTextReply(app, chatId, FEISHU_STATUS_SENT_MESSAGE);
    }
    return;
  }

  if (artifactResult.artifacts.length > 0) {
    await sendFeishuTextReply(app, chatId, '已附上处理结果文件。', replyToMessageId);
    await sendFeishuArtifacts(app, chatId, artifactResult.artifacts, replyToMessageId);
    if (processingStatusSent) {
      await sendFeishuTextReply(app, chatId, FEISHU_STATUS_SENT_MESSAGE);
    }
    return;
  }

  await sendFeishuTextReply(app, chatId, FEISHU_EMPTY_RESULT_MESSAGE, replyToMessageId);
  if (processingStatusSent) {
    await sendFeishuTextReply(app, chatId, FEISHU_STATUS_SENT_MESSAGE);
  }
}

// [FLOW] 本地测试引导：允许通过 .env 注入一个飞书应用，避免把密钥写入仓库或 sqlite 配置
export function resolveBootstrapFeishuAppFromEnv(): FeishuWebhookAppConfig | null {
  const appId = readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAppId);
  const appSecret = readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAppSecret);
  const agentRoleKey = readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAgentRoleKey)?.trim();

  if (!appId || !appSecret) {
    return null;
  }

  if (!agentRoleKey) {
    console.warn('[Feishu] Skip env bootstrap app: missing FEISHU_AGENT_ROLE_KEY / agentRoleKey binding');
    return null;
  }

  return {
    id: 'env-bootstrap',
    name: readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAppName) ?? '本地环境飞书测试应用',
    appId,
    appSecret,
    agentRoleKey,
    enabled: true,
    createdAt: 0,
  };
}

// [FLOW] 运行态合并：优先保留多应用配置模型，仅把本地环境凭据作为测试补丁层叠加
export function resolveRuntimeFeishuApps(feishuConfig: { enabled?: boolean; apps?: FeishuWebhookAppConfig[] } | null | undefined): FeishuWebhookAppConfig[] {
  const envApp = resolveBootstrapFeishuAppFromEnv();
  return cleanRoomResolveRuntimeFeishuApps({
    configuredApps: feishuConfig?.apps,
    envApp,
  }) as FeishuWebhookAppConfig[];
}

export function setupFeishuWebhookRoutes(app: Router) {
  const router = Router();

  /**
   * {标记} POST /api/im/feishu/webhook
   * 飞书消息 webhook 处理器
   */
  // 【1.0链路】FEISHU-WEBHOOK-INBOUND: 飞书 HTTP 回调入口，负责验签、去重、解析、找到 app/role/session 后异步执行。
  router.post('/webhook', async (req: Request, res: Response) => {
    try {
      const { store, coworkStore, skillManager } = req.context as RequestContext;
      const { challenge, header, event } = req.body as {
        challenge?: string;
        header?: {
          app_id?: string;
          event_type?: string;
        };
        event?: FeishuWebhookEvent;
      };

      // 1. 验证挑战值 (飞书首次配置时会发送)
      if (challenge) {
        return res.json({ challenge });
      }

      // 2. 提取 App ID（从飞书请求中）
      const appId = event?.app_id || header?.app_id;
      if (!appId) {
        console.error('[Feishu] Missing app_id in request');
        return res.sendStatus(400);
      }

      const activeGatewayForApp = (req.context?.feishuGateways || []).some((gateway) => {
        const status = gateway.getStatus();
        return status.connected && status.appId === appId;
      });
      if (activeGatewayForApp) {
        console.log('[Feishu] Gateway active for app, webhook message ignored:', appId);
        return res.sendStatus(200);
      }

      // 3. 查找对应的应用配置
      const kvData = store.get('im_config');
      const imConfig = (kvData && typeof kvData === 'object') ? kvData as Record<string, any> : {} as Record<string, any>;
      const feishuConfig = imConfig.feishu || { enabled: false, apps: [] };
      const feishuApps = resolveRuntimeFeishuApps(feishuConfig);

      const app = feishuApps.find((a) => a.appId === appId && a.enabled);
      if (!app) {
        console.error('[Feishu] App not found or disabled:', appId);
        return res.sendStatus(404);
      }

      // 4. 验证签名（使用该应用的 appSecret）
      const signature = req.headers['x-lark-signature'] as string;
      const timestamp = req.headers['x-lark-request-timestamp'] as string;
      const nonce = req.headers['x-lark-request-nonce'] as string;

      if (signature && app.appSecret && !verifySignature(signature, timestamp, nonce, JSON.stringify(req.body), app.appSecret)) {
        console.error('[Feishu] Signature verification failed');
        return res.sendStatus(401);
      }

      const envelopeResult = readFeishuWebhookEnvelope({
        headerEventType: header?.event_type,
        event,
      });
      if (envelopeResult.kind === 'ignore') {
        console.log('[Feishu] Ignoring non-message event:', envelopeResult.eventType);
        return res.sendStatus(200);
      }
      if (envelopeResult.kind === 'bad_request') {
        console.error('[Feishu] Missing message payload');
        return res.sendStatus(400);
      }

      const envelope = envelopeResult.envelope;
      const chatId = envelope.chatId;
      const messageId = envelope.messageId;

      // [FLOW] 抄上游的幂等处理，避免飞书重试把同一条消息重复灌进同一 Bot 线程。
      if (isFeishuMessageProcessed(messageId)) {
        console.log('[Feishu] Duplicate message ignored:', messageId);
        return res.sendStatus(200);
      }

      const normalizedInbound = normalizeFeishuTextEnvelope(envelope);
      if (normalizedInbound.kind === 'ignore') {
        return res.sendStatus(200);
      }
      if (normalizedInbound.kind === 'bad_request') {
        console.error('[Feishu] Failed to parse message content:', normalizedInbound.error);
        return res.sendStatus(400);
      }

      let imageAttachments: ImageAttachment[] | undefined;
      let imageDownloadFailed = false;
      if (normalizedInbound.imageKey) {
        const imageAttachment = await downloadFeishuMessageImage(app, normalizedInbound.messageId || '', normalizedInbound.imageKey);
        if (imageAttachment) {
          imageAttachments = [imageAttachment];
        } else {
          imageDownloadFailed = true;
          console.warn('[Feishu] Image payload detected but download failed:', normalizedInbound.imageKey);
        }
      }

      const text = normalizedInbound.text;
      const senderId = normalizedInbound.senderId;
      const chatType = event?.message?.chat_type;

      console.log('[Feishu] Message received:', {
        appName: app.name,
        chatId,
        senderId,
        text: text.substring(0, 50),
        images: imageAttachments?.length || 0,
      });

      if (!text.trim()) {
        return res.sendStatus(200);
      }

      if (imageDownloadFailed) {
        res.sendStatus(200);
        void sendFeishuTextReply(
          app,
          chatId,
          FEISHU_IMAGE_DOWNLOAD_FAILED_MESSAGE,
          messageId
        ).catch((error) => {
          console.error('[Feishu] Failed to send image download fallback reply:', error);
        });
        return;
      }

      // [FLOW] 飞书对外严格按官方 webhook 协议收发；内部仅用 bot 配置映射到角色/模型。
      const binding = resolveFeishuAgentBinding(store, app);
      console.log('[Feishu] Using internal binding:', {
        appId: app.appId,
        appName: app.name,
        agentRoleKey: binding.agentRoleKey,
        modelId: binding.modelId,
      });

      const schedulerBindingCommand = handleFeishuSchedulerBindingCommand({
        store,
        app,
        binding,
        chatId,
        senderId: senderId || '',
        chatType,
        text,
      });
      if (schedulerBindingCommand.handled) {
        res.sendStatus(200);
        if (schedulerBindingCommand.replyText) {
          void sendFeishuTextReply(app, chatId, schedulerBindingCommand.replyText, messageId).catch((replyError) => {
            console.error('[Feishu] Failed to reply scheduler binding command:', replyError);
          });
        }
        return;
      }

      const inboundRequest = buildFeishuInboundRequest({
        chatId: normalizedInbound.chatId,
        messageId: normalizedInbound.messageId,
        text: normalizedInbound.text,
        imageAttachments,
        agentRoleKey: binding.agentRoleKey,
        modelId: binding.modelId,
        scopeKey: getFeishuSessionScopeKey(app, normalizedInbound.chatId),
      });

      // [FLOW] 单 Bot = 单线程；多个飞书 Bot 只是把这条单线程复制 N 份，每个 Bot 走各自内部角色/模型绑定。
      const session = await getOrCreateFeishuSession(coworkStore, store, app, binding, inboundRequest.channelId);

      console.log('[Feishu] Using session:', {
        sessionId: session.id,
        agentRoleKey: session.agentRoleKey,
        modelId: session.modelId,
      });

      // [FLOW] 先快速应答 webhook，再异步跑身份会话并回发飞书消息，形成入站→执行→出站闭环
      res.sendStatus(200);
      void processFeishuConversation({
        coworkStore,
        store,
        skillManager,
        app,
        session,
        prompt: inboundRequest.text,
        chatId: inboundRequest.channelId,
        replyToMessageId: inboundRequest.replyTargetId,
        imageAttachments: inboundRequest.imageAttachments,
      }).catch((error) => {
        console.error('[Feishu] Async conversation processing failed:', error);
      });
      return;
    } catch (error) {
      console.error('[Feishu] Webhook error:', error);
      res.sendStatus(500);
    }
  });

  // ==================== WSClient Gateway Control ====================

  // {埋点} ⚡ 飞书Gateway状态查询 (ID: feishu-gw-004) GET /api/im/feishu/gateway/status → _feishuGatewayInstance.getStatus()
  router.get('/gateway/status', async (req: Request, res: Response) => {
    try {
      const gateways = resolveFeishuGateways(req);
      const status = buildAggregatedGatewayStatus(gateways);
      res.json({
        success: true,
        status,
        gateways: gateways.map((gateway) => gateway.getStatus()),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed' });
    }
  });

  // POST /api/im/feishu/gateway/start
  router.post('/gateway/start', async (req: Request, res: Response) => {
    try {
      const { store, coworkStore, skillManager } = req.context as any;
      const { appId, appSecret, agentRoleKey, domain, debug, apps } = req.body;
      const requestedApps = Array.isArray(apps)
        ? apps
        : [{ appId, appSecret, agentRoleKey, domain, debug }];
      const validApps = cleanRoomDedupeRuntimeFeishuApps(
        requestedApps.filter((app) => app?.appId && app?.appSecret),
      );
      if (validApps.length < requestedApps.length) {
        console.warn(`[Feishu] Deduped manual gateway start app list: ${requestedApps.length} -> ${validApps.length}`);
      }

      if (validApps.length === 0) {
        return res.status(400).json({ success: false, error: 'appId and appSecret required' });
      }

      const contextGateways = Array.isArray((req.context as any)?.feishuGateways)
        ? (req.context as any).feishuGateways
        : [];
      for (const gateway of resolveFeishuGateways(req)) {
        try {
          await gateway.stop();
        } catch (error) {
          console.error('[Feishu] Failed to stop gateway before restart:', error);
        }
      }
      contextGateways.length = 0;
      _feishuGatewayInstance = null;

      const startedGateways: any[] = [];
      const failedApps: string[] = [];
      for (const app of validApps) {
        try {
          const identityRoleKey = typeof app.agentRoleKey === 'string' ? app.agentRoleKey.trim() : '';
          if (!identityRoleKey) {
            throw new Error('missing agentRoleKey binding');
          }
          const { FeishuGateway } = await import('../libs/feishuGateway');
          const gateway = new FeishuGateway();
          gateway.setDependencies({
            coworkStore,
            store,
            buildSelectedSkillsPrompt: (skillIds: string[]) => skillManager.buildSelectedSkillsPrompt(skillIds),
          });
          await gateway.start({
            appId: app.appId,
            appSecret: app.appSecret,
            agentRoleKey: identityRoleKey,
            botOpenId: typeof app.botOpenId === 'string' ? app.botOpenId : null,
            domain: app.domain || domain || 'feishu',
            debug: app.debug ?? debug ?? true,
          });
          startedGateways.push(gateway);
        } catch (error) {
          const failedAppId = typeof app?.appId === 'string' ? app.appId : 'unknown-app';
          failedApps.push(failedAppId);
          console.error(`[Feishu] Failed to start gateway for ${failedAppId}:`, error);
        }
      }

      contextGateways.push(...startedGateways);
      _feishuGatewayInstance = startedGateways[0] ?? null;

      if (startedGateways.length === 0) {
        return res.status(500).json({
          success: false,
          error: failedApps.length > 0
            ? `Failed to start gateways: ${failedApps.join(', ')}`
            : 'Failed to start gateway',
        });
      }

      res.json({
        success: true,
        status: buildAggregatedGatewayStatus(startedGateways),
        gateways: startedGateways.map((gateway) => gateway.getStatus()),
        failedApps,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to start' });
    }
  });

  // POST /api/im/feishu/gateway/stop
  router.post('/gateway/stop', async (req: Request, res: Response) => {
    try {
      const gateways = resolveFeishuGateways(req);
      for (const gateway of gateways) {
        await gateway.stop();
      }
      const contextGateways = Array.isArray((req.context as any)?.feishuGateways)
        ? (req.context as any).feishuGateways
        : [];
      contextGateways.length = 0;
      _feishuGatewayInstance = null;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to stop' });
    }
  });

  // POST /api/im/feishu/gateway/send - Send test message
  router.post('/gateway/send', async (req: Request, res: Response) => {
    try {
      const { chatId, text } = req.body;
      const gateway = resolveActiveFeishuGateway(req);
      if (!gateway?.isConnected()) {
        return res.status(400).json({ success: false, error: 'Gateway not connected' });
      }
      if (!chatId || !text) {
        return res.status(400).json({ success: false, error: 'chatId and text required' });
      }
      await gateway.sendNotification(chatId, text);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to send' });
    }
  });

  app.use('/api/im/feishu', router);
}

/**
 * {标记} 功能：验证飞书签名
 */
function verifySignature(
  signature: string,
  timestamp: string,
  nonce: string,
  body: string,
  secret: string
): boolean {
  const str = `${timestamp}${nonce}${secret}${body}`;
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return hash === signature;
}

/**
 * {标记} 功能：获取或创建飞书用户的 Session (关键：绑定身份)
 * {标记} 策略：使用应用绑定的身份，不再支持命令
 * {标记} 核心：同一身份跨渠道共享记忆，不按渠道隔离 Session
 */
async function getOrCreateFeishuSession(
  coworkStore: any,
  store: RequestContext['store'],
  app: FeishuWebhookAppConfig,
  binding: FeishuAgentBinding,
  chatId: string
): Promise<any> {
  // 【1.0链路】FEISHU-SESSION-BIND: 飞书 appId + chatId + role 绑定到唯一 session，复用历史上下文。
  const existingSession = findReusableFeishuSession(coworkStore, store, app, binding, chatId);

  if (existingSession) {
    console.log('[Feishu] Reusing bot session:', existingSession.id, 'for app:', app.appId);
    return existingSession;
  }

  console.log('[Feishu] Creating new bot session:', {
    appId: app.appId,
    chatId,
    agentRoleKey: binding.agentRoleKey,
    modelId: binding.modelId,
  });
  return cleanRoomGetOrCreateFeishuSession(
    coworkStore,
    store as any,
    app,
    binding,
    chatId,
    getProjectRoot()
  );
}
