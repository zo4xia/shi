import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type { CoworkSession, CoworkStore } from '../../src/main/coworkStore';
import type { SkillManager } from '../../src/main/skillManager';
import { AGENT_ROLE_LABELS } from '../../src/shared/agentRoleConfig';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import type { SqliteStore } from '../sqliteStore.web';
import { bindChannelSession, buildChannelBindingKey, findLatestScopedSession, getBoundChannelSession } from './channelSessionBinding';
import { collectFeishuArtifacts } from './feishuArtifacts';
import { parseFile } from './fileParser';
import { getOrCreateWebSessionExecutor } from './httpSessionExecutor';
import type { WechatBotBridgeConfig } from './wechatbotBridgeRuntime';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const DEFAULT_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const USER_MESSAGE_TYPE = 1;
const BOT_MESSAGE_TYPE = 2;
const TEXT_ITEM_TYPE = 1;
const FILE_ITEM_TYPE = 4;
const SESSION_EXPIRED_ERRCODE = -14;
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
const DEFAULT_API_TIMEOUT_MS = 15_000;
const MESSAGE_DEDUP_TTL_MS = 5 * 60_000;
const MESSAGE_STALE_TTL_MS = 2 * 60_000;
const RETRY_DELAY_MS = 2_000;
const BACKOFF_DELAY_MS = 30_000;
const MAX_FILE_ATTACHMENTS = 3;
const MAX_ARTIFACT_FILES = 3;
const OUTBOUND_TEXT_MAX_CHARS = 3200;
const WECHATBOT_SCOPE_PREFIX = 'im:wechatbot:user:';
const CHANNEL_VERSION = 'uclaw-wechatbot-bridge-phase1';

type WechatBotGatewayDeps = {
  coworkStore: CoworkStore;
  store: SqliteStore;
  skillManager: SkillManager;
  userDataPath: string;
  workspaceRoot?: string;
};

type WechatBotGatewayStartOptions = {
  config: WechatBotBridgeConfig;
  deps: WechatBotGatewayDeps;
};

export type WechatBotGatewayStatus = {
  running: boolean;
  connected: boolean;
  bridgeReady: boolean;
  configured: boolean;
  startedAt: string | null;
  accountId: string | null;
  linkedUserId: string | null;
  agentRoleKey: string | null;
  lastError: string | null;
  lastEventAt: number | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
};

type BaseInfo = {
  channel_version: string;
};

type GetUpdatesResponse = {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WechatMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
};

type GetUploadUrlResponse = {
  upload_param?: string;
};

type MessageTextItem = {
  text?: string;
};

type MessageRefItem = {
  title?: string;
  message_item?: MessageItem;
};

type MessageFileMedia = {
  encrypt_query_param?: string;
  aes_key?: string;
};

type MessageFileItem = {
  media?: MessageFileMedia;
  file_name?: string;
};

type MessageVoiceItem = {
  text?: string;
};

type MessageItem = {
  type?: number;
  text_item?: MessageTextItem;
  file_item?: MessageFileItem;
  voice_item?: MessageVoiceItem;
  ref_msg?: MessageRefItem;
};

type WechatMessage = {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  create_time_ms?: number;
  session_id?: string;
  message_type?: number;
  item_list?: MessageItem[];
  context_token?: string;
};

type ParsedInboundFile = {
  fileName: string;
  localPath: string;
  parseText: string;
  parseFileType: string;
  parseError: string | null;
};

type WechatBotAgentBinding = {
  agentRoleKey: string;
  modelId: string;
  roleLabel: string;
};

type UploadedFileInfo = {
  downloadEncryptedQueryParam: string;
  aeskeyHex: string;
  fileSize: number;
};

function normalizeBaseUrl(baseUrl?: string): string {
  return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function buildBaseInfo(): BaseInfo {
  return { channel_version: CHANNEL_VERSION };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf8').toString('base64');
}

function buildHeaders(body: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'Content-Length': String(Buffer.byteLength(body, 'utf8')),
    'X-WECHAT-UIN': randomWechatUin(),
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

async function postWechatApi<T>(
  params: {
    baseUrl: string;
    endpoint: string;
    body: Record<string, unknown>;
    token?: string;
    timeoutMs: number;
  },
): Promise<T> {
  const baseUrl = ensureTrailingSlash(normalizeBaseUrl(params.baseUrl));
  const url = new URL(params.endpoint, baseUrl).toString();
  const body = JSON.stringify({
    ...params.body,
    base_info: buildBaseInfo(),
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(body, params.token),
    body,
    signal: createTimeoutSignal(params.timeoutMs),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`微信接口 ${params.endpoint} 请求失败: HTTP ${response.status} ${response.statusText} ${rawText}`);
  }

  return JSON.parse(rawText) as T;
}

async function getUpdates(params: {
  baseUrl: string;
  token?: string;
  getUpdatesBuf: string;
  timeoutMs?: number;
}): Promise<GetUpdatesResponse> {
  try {
    return await postWechatApi<GetUpdatesResponse>({
      baseUrl: params.baseUrl,
      endpoint: 'ilink/bot/getupdates',
      body: {
        get_updates_buf: params.getUpdatesBuf,
      },
      token: params.token,
      timeoutMs: params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ret: 0,
        msgs: [],
        get_updates_buf: params.getUpdatesBuf,
      };
    }
    throw error;
  }
}

async function getUploadUrl(params: {
  baseUrl: string;
  token?: string;
  filekey: string;
  rawsize: number;
  rawfilemd5: string;
  filesize: number;
  aeskeyHex: string;
  toUserId: string;
}): Promise<GetUploadUrlResponse> {
  return postWechatApi<GetUploadUrlResponse>({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/getuploadurl',
    body: {
      filekey: params.filekey,
      media_type: 3,
      to_user_id: params.toUserId,
      rawsize: params.rawsize,
      rawfilemd5: params.rawfilemd5,
      filesize: params.filesize,
      no_need_thumb: true,
      aeskey: params.aeskeyHex,
    },
    token: params.token,
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
  });
}

function buildDownloadUrl(encryptedQueryParam: string): string {
  return `${DEFAULT_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
}

function buildUploadUrl(uploadParam: string, filekey: string): string {
  return `${DEFAULT_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;
}

function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64');
  if (decoded.length === 16) {
    return decoded;
  }
  const ascii = decoded.toString('ascii');
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(ascii)) {
    return Buffer.from(ascii, 'hex');
  }
  throw new Error(`微信媒体 aes_key 非法，解码后长度=${decoded.length}`);
}

async function downloadAndDecryptFile(encryptedQueryParam: string, aesKeyBase64: string): Promise<Buffer> {
  const response = await fetch(buildDownloadUrl(encryptedQueryParam), {
    method: 'GET',
    signal: createTimeoutSignal(DEFAULT_API_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`微信文档下载失败: HTTP ${response.status} ${response.statusText}`);
  }
  const encrypted = Buffer.from(await response.arrayBuffer());
  return decryptAesEcb(encrypted, parseAesKey(aesKeyBase64));
}

async function uploadEncryptedFile(params: {
  plaintext: Buffer;
  uploadParam: string;
  filekey: string;
  aeskey: Buffer;
}): Promise<string> {
  const ciphertext = encryptAesEcb(params.plaintext, params.aeskey);
  const response = await fetch(buildUploadUrl(params.uploadParam, params.filekey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(ciphertext),
    signal: createTimeoutSignal(DEFAULT_API_TIMEOUT_MS),
  });

  if (response.status !== 200) {
    const errorMessage = response.headers.get('x-error-message') || await response.text().catch(() => '');
    throw new Error(`微信 CDN 上传失败: HTTP ${response.status} ${errorMessage}`.trim());
  }

  const downloadParam = response.headers.get('x-encrypted-param');
  if (!downloadParam) {
    throw new Error('微信 CDN 上传成功但未返回 x-encrypted-param。');
  }
  return downloadParam;
}

function buildTextMessageBody(params: {
  toUserId: string;
  contextToken: string;
  text: string;
}) {
  return {
    msg: {
      from_user_id: '',
      to_user_id: params.toUserId,
      client_id: crypto.randomUUID(),
      message_type: BOT_MESSAGE_TYPE,
      message_state: 2,
      context_token: params.contextToken,
      item_list: [{
        type: TEXT_ITEM_TYPE,
        text_item: { text: params.text },
      }],
    },
  };
}

function buildFileMessageBody(params: {
  toUserId: string;
  contextToken: string;
  fileName: string;
  uploaded: UploadedFileInfo;
}) {
  return {
    msg: {
      from_user_id: '',
      to_user_id: params.toUserId,
      client_id: crypto.randomUUID(),
      message_type: BOT_MESSAGE_TYPE,
      message_state: 2,
      context_token: params.contextToken,
      item_list: [{
        type: FILE_ITEM_TYPE,
        file_item: {
          media: {
            encrypt_query_param: params.uploaded.downloadEncryptedQueryParam,
            aes_key: Buffer.from(params.uploaded.aeskeyHex).toString('base64'),
            encrypt_type: 1,
          },
          file_name: params.fileName,
          len: String(params.uploaded.fileSize),
        },
      }],
    },
  };
}

async function sendWechatMessage(params: {
  baseUrl: string;
  token?: string;
  body: Record<string, unknown>;
}): Promise<void> {
  await postWechatApi<Record<string, unknown>>({
    baseUrl: params.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body: params.body,
    token: params.token,
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
  });
}

function extractTextBody(itemList?: MessageItem[]): string {
  if (!itemList?.length) {
    return '';
  }

  const sections: string[] = [];
  for (const item of itemList) {
    if (item.type === TEXT_ITEM_TYPE && item.text_item?.text) {
      const text = String(item.text_item.text).trim();
      if (text) {
        sections.push(text);
      }
      continue;
    }
    if (item.voice_item?.text?.trim()) {
      sections.push(item.voice_item.text.trim());
      continue;
    }
    if (item.ref_msg?.title?.trim()) {
      sections.push(`[引用] ${item.ref_msg.title.trim()}`);
    }
    if (item.ref_msg?.message_item?.text_item?.text?.trim()) {
      sections.push(`[引用正文] ${item.ref_msg.message_item.text_item.text.trim()}`);
    }
  }

  return sections.join('\n').trim();
}

function sanitizeFileName(fileName: string, fallback = 'wechat-document.bin'): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || fallback;
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveRuntimeRoleKey(agentRoleKey: string): string {
  return agentRoleKey === 'writer' || agentRoleKey === 'designer' || agentRoleKey === 'analyst'
    ? agentRoleKey
    : 'organizer';
}

function resolveWechatBotAgentBinding(store: SqliteStore, agentRoleKey: string): WechatBotAgentBinding {
  const identityRoleKey = (agentRoleKey || 'organizer').trim() || 'organizer';
  const runtimeRoleKey = resolveRuntimeRoleKey(identityRoleKey);
  const configData = store.get<Record<string, any>>('app_config');
  const appConfig = (configData && typeof configData === 'object') ? configData : {};
  const roleConfig = appConfig.agentRoles?.[runtimeRoleKey];

  if (!roleConfig?.enabled || !roleConfig.modelId) {
    throw new Error(`Runtime role "${runtimeRoleKey}" 未正确配置，无法绑定个人微信角色 "${identityRoleKey}"。`);
  }

  return {
    agentRoleKey: identityRoleKey,
    modelId: roleConfig.modelId,
    roleLabel: AGENT_ROLE_LABELS[runtimeRoleKey as keyof typeof AGENT_ROLE_LABELS] ?? identityRoleKey,
  };
}

function getMessageDedupKey(message: WechatMessage): string {
  if (typeof message.message_id === 'number') {
    return String(message.message_id);
  }
  if (message.client_id?.trim()) {
    return message.client_id.trim();
  }
  return [
    message.from_user_id || '',
    message.session_id || '',
    message.create_time_ms || Date.now(),
    message.context_token || '',
  ].join(':');
}

function extractNewAssistantReply(
  session: { messages?: Array<{ id?: string; type?: string; content?: string; metadata?: Record<string, unknown> }> } | null,
  knownIds: Set<string>,
): string | null {
  if (!session?.messages?.length) {
    return null;
  }

  const parts = session.messages
    .filter((message) => (
      message.type === 'assistant'
      && typeof message.id === 'string'
      && !knownIds.has(message.id)
      && !message.metadata?.isThinking
    ))
    .map((message) => message.content?.trim())
    .filter((content): content is string => Boolean(content));

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function splitOutboundText(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > OUTBOUND_TEXT_MAX_CHARS) {
    let cut = remaining.lastIndexOf('\n', OUTBOUND_TEXT_MAX_CHARS);
    if (cut < OUTBOUND_TEXT_MAX_CHARS * 0.5) {
      cut = OUTBOUND_TEXT_MAX_CHARS;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

function buildWechatbotMirrorText(text: string): string {
  return [
    '[个人微信已发送]',
    text.trim(),
  ].join('\n');
}

function buildWechatbotMirrorFileNotice(fileName: string): string {
  return `[个人微信已发送文件] ${fileName}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) {
      return;
    }
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });
}

class WechatBotGateway {
  private deps: WechatBotGatewayDeps | null = null;
  private config: WechatBotBridgeConfig | null = null;
  private abortController: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private readonly processedMessages = new Map<string, number>();
  private readonly processingMessages = new Set<string>();
  private readonly userQueues = new Map<string, Promise<void>>();
  private status: WechatBotGatewayStatus = {
    running: false,
    connected: false,
    bridgeReady: false,
    configured: false,
    startedAt: null,
    accountId: null,
    linkedUserId: null,
    agentRoleKey: null,
    lastError: null,
    lastEventAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
  };

  getStatus(): WechatBotGatewayStatus {
    return { ...this.status };
  }

  async start(options: WechatBotGatewayStartOptions): Promise<WechatBotGatewayStatus> {
    await this.stop();

    this.deps = options.deps;
    this.config = {
      ...options.config,
      baseUrl: normalizeBaseUrl(options.config.baseUrl),
    };

    const configured = Boolean(
      this.config.botAccountId
      && this.config.botToken
      && this.config.agentRoleKey,
    );

    this.status = {
      running: configured,
      connected: configured,
      bridgeReady: configured,
      configured,
      startedAt: configured ? new Date().toISOString() : null,
      accountId: this.config.botAccountId || null,
      linkedUserId: this.config.linkedUserId || null,
      agentRoleKey: this.config.agentRoleKey || null,
      lastError: configured ? null : '微信桥接缺少 botAccountId、botToken 或 agentRoleKey。',
      lastEventAt: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    };

    if (!configured) {
      return this.getStatus();
    }

    ensureDirectory(this.getRuntimeDir());
    this.abortController = new AbortController();
    this.loopPromise = this.monitorLoop(this.abortController.signal)
      .catch((error) => {
        if (this.abortController?.signal.aborted) {
          return;
        }
        this.status.lastError = error instanceof Error ? error.message : String(error);
        this.status.connected = false;
        this.status.bridgeReady = false;
      });

    return this.getStatus();
  }

  async stop(): Promise<WechatBotGatewayStatus> {
    const currentAbortController = this.abortController;
    const currentLoopPromise = this.loopPromise;

    this.abortController = null;
    this.loopPromise = null;
    this.userQueues.clear();
    this.processingMessages.clear();

    if (currentAbortController) {
      currentAbortController.abort();
    }

    if (currentLoopPromise) {
      try {
        await currentLoopPromise;
      } catch {
        // Swallow shutdown errors.
      }
    }

    this.status.running = false;
    this.status.connected = false;
    this.status.bridgeReady = false;
    this.status.startedAt = null;
    return this.getStatus();
  }

  private getRuntimeDir(): string {
    return path.join(this.deps!.userDataPath, 'channels', 'openclaw-weixin');
  }

  private getMonitorStatePath(): string {
    return path.join(this.getRuntimeDir(), 'monitor-state.json');
  }

  private getInboundDir(): string {
    return path.join(this.getRuntimeDir(), 'inbound');
  }

  private cleanupProcessedMessages(): void {
    const now = Date.now();
    for (const [messageId, ts] of this.processedMessages.entries()) {
      if (now - ts > MESSAGE_DEDUP_TTL_MS) {
        this.processedMessages.delete(messageId);
      }
    }
  }

  private loadGetUpdatesBuf(): string {
    try {
      const filePath = this.getMonitorStatePath();
      if (!fs.existsSync(filePath)) {
        return '';
      }
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { getUpdatesBuf?: string };
      return typeof parsed.getUpdatesBuf === 'string' ? parsed.getUpdatesBuf : '';
    } catch {
      return '';
    }
  }

  private saveGetUpdatesBuf(getUpdatesBuf: string): void {
    ensureDirectory(this.getRuntimeDir());
    fs.writeFileSync(this.getMonitorStatePath(), JSON.stringify({
      getUpdatesBuf,
      updatedAt: Date.now(),
    }, null, 2), 'utf8');
  }

  private async monitorLoop(signal: AbortSignal): Promise<void> {
    const config = this.requireConfig();
    let getUpdatesBuf = this.loadGetUpdatesBuf();
    let nextTimeoutMs = DEFAULT_LONG_POLL_TIMEOUT_MS;
    let consecutiveFailures = 0;

    while (!signal.aborted) {
      try {
        this.cleanupProcessedMessages();
        const response = await getUpdates({
          baseUrl: config.baseUrl,
          token: config.botToken,
          getUpdatesBuf,
          timeoutMs: nextTimeoutMs,
        });

        this.status.lastError = null;
        this.status.lastEventAt = Date.now();

        if (typeof response.longpolling_timeout_ms === 'number' && response.longpolling_timeout_ms > 0) {
          nextTimeoutMs = response.longpolling_timeout_ms;
        }

        if (response.get_updates_buf != null && response.get_updates_buf !== '') {
          getUpdatesBuf = response.get_updates_buf;
          this.saveGetUpdatesBuf(getUpdatesBuf);
        }

        const errorCode = typeof response.errcode === 'number'
          ? response.errcode
          : typeof response.ret === 'number' && response.ret !== 0
            ? response.ret
            : 0;

        if (errorCode === SESSION_EXPIRED_ERRCODE) {
          this.status.connected = false;
          this.status.bridgeReady = false;
          this.status.lastError = '微信扫码登录已失效，请在设置页重新扫码授权。';
          return;
        }

        if (errorCode !== 0) {
          consecutiveFailures += 1;
          this.status.lastError = `微信长轮询失败: errcode=${errorCode} ${response.errmsg || ''}`.trim();
          await sleep(consecutiveFailures >= 3 ? BACKOFF_DELAY_MS : RETRY_DELAY_MS, signal);
          if (consecutiveFailures >= 3) {
            consecutiveFailures = 0;
          }
          continue;
        }

        consecutiveFailures = 0;
        const messages = Array.isArray(response.msgs) ? response.msgs : [];
        for (const message of messages) {
          await this.handleIncomingMessage(message);
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        this.status.lastError = error instanceof Error ? error.message : String(error);
        consecutiveFailures += 1;
        await sleep(consecutiveFailures >= 3 ? BACKOFF_DELAY_MS : RETRY_DELAY_MS, signal);
        if (consecutiveFailures >= 3) {
          consecutiveFailures = 0;
        }
      }
    }
  }

  private async handleIncomingMessage(message: WechatMessage): Promise<void> {
    if (message.message_type !== USER_MESSAGE_TYPE) {
      return;
    }

    const dedupKey = getMessageDedupKey(message);
    if (this.processedMessages.has(dedupKey) || this.processingMessages.has(dedupKey)) {
      return;
    }

    const createdAt = typeof message.create_time_ms === 'number' ? message.create_time_ms : Date.now();
    if (Date.now() - createdAt > MESSAGE_STALE_TTL_MS) {
      this.processedMessages.set(dedupKey, Date.now());
      return;
    }

    const fromUserId = String(message.from_user_id || '').trim();
    if (!fromUserId) {
      return;
    }

    this.processingMessages.add(dedupKey);
    const queueKey = this.buildQueueKey(fromUserId);

    try {
      await this.enqueueUserTurn(queueKey, async () => {
        await this.processUserTurn(message, fromUserId);
        this.processedMessages.set(dedupKey, Date.now());
      });
    } finally {
      this.processingMessages.delete(dedupKey);
    }
  }

  private buildQueueKey(fromUserId: string): string {
    const config = this.requireConfig();
    return `${config.botAccountId}:${fromUserId}`;
  }

  private enqueueUserTurn(queueKey: string, task: () => Promise<void>): Promise<void> {
    const previous = this.userQueues.get(queueKey) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(task);

    const tracked = queued.finally(() => {
      if (this.userQueues.get(queueKey) === tracked) {
        this.userQueues.delete(queueKey);
      }
    });

    this.userQueues.set(queueKey, tracked);
    return tracked;
  }

  private async processUserTurn(message: WechatMessage, fromUserId: string): Promise<void> {
    const config = this.requireConfig();
    const deps = this.requireDeps();
    const binding = resolveWechatBotAgentBinding(deps.store, config.agentRoleKey);
    const session = this.getOrCreateSession(binding, fromUserId);
    const prompt = await this.buildPromptFromMessage(message);

    if (!prompt) {
      return;
    }

    const baseSession = deps.coworkStore.getSession(session.id) as any;
    const knownIds = new Set<string>(
      (baseSession?.messages ?? [])
        .map((entry: any) => (typeof entry?.id === 'string' ? entry.id : ''))
        .filter(Boolean),
    );

    const runStartedAt = Date.now();
    this.status.lastInboundAt = runStartedAt;
    this.status.lastEventAt = runStartedAt;

    const executor = getOrCreateWebSessionExecutor({
      store: deps.coworkStore,
      configStore: deps.store,
      buildSelectedSkillsPrompt: (skillIds: string[]) => deps.skillManager.buildSelectedSkillsPrompt(skillIds) ?? null,
    });

    try {
      await executor.runChannelFastTurn(session.id, prompt, {
        confirmationMode: 'text',
        autoApprove: true,
        workspaceRoot: session.cwd || deps.workspaceRoot || getProjectRoot(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sendTextReply(fromUserId, message.context_token, `处理失败：${errorMessage}`, session.id);
      return;
    }

    const completed = deps.coworkStore.getSession(session.id) as any;
    const replyText = extractNewAssistantReply(completed, knownIds);
    const artifactResult = collectFeishuArtifacts({
      sessionMessages: completed?.messages ?? [],
      knownMessageIds: knownIds,
      workspaceRoot: session.cwd || deps.workspaceRoot || getProjectRoot(),
      runStartedAt,
    });
    const fileArtifacts = artifactResult.artifacts
      .filter((artifact) => artifact.kind === 'file' && fs.existsSync(artifact.path))
      .slice(0, MAX_ARTIFACT_FILES);

    if (replyText?.trim()) {
      await this.sendTextReply(fromUserId, message.context_token, replyText, session.id);
    }

    if (fileArtifacts.length > 0) {
      for (const artifact of fileArtifacts) {
        await this.sendFileReply(fromUserId, message.context_token, artifact.path, session.id);
      }
      return;
    }

    if (replyText?.trim()) {
      return;
    }

    const systemErrorMessage = (completed?.messages ?? [])
      .slice()
      .reverse()
      .find((entry: any) => entry.type === 'system' && entry.content?.trim());

    if (systemErrorMessage?.content?.trim()) {
      await this.sendTextReply(fromUserId, message.context_token, `处理失败：${systemErrorMessage.content.trim()}`, session.id);
      return;
    }

    await this.sendTextReply(fromUserId, message.context_token, '已收到消息，但这一轮没有生成可发送的文本结果。', session.id);
  }

  private getOrCreateSession(binding: WechatBotAgentBinding, fromUserId: string): CoworkSession {
    const deps = this.requireDeps();
    const config = this.requireConfig();
    const scopeKey = `${WECHATBOT_SCOPE_PREFIX}${config.botAccountId}:${fromUserId}`;
    const bindingKey = buildChannelBindingKey('wechatbot', scopeKey, binding.agentRoleKey);
    const bound = getBoundChannelSession(deps.store, deps.coworkStore, bindingKey);
    if (bound) {
      return this.syncSessionTruth(bound, binding, scopeKey);
    }

    const scoped = findLatestScopedSession(deps.coworkStore, {
      agentRoleKey: binding.agentRoleKey,
      scopeKeys: [scopeKey],
    });
    if (scoped) {
      bindChannelSession(deps.store, bindingKey, scoped.id, scopeKey);
      return this.syncSessionTruth(scoped, binding, scopeKey);
    }

    const session = deps.coworkStore.createSession(
      `${binding.roleLabel} - 微信对话`,
      deps.workspaceRoot || getProjectRoot(),
      scopeKey,
      'local',
      [],
      {
        agentRoleKey: binding.agentRoleKey,
        modelId: binding.modelId,
        sourceType: 'external',
      },
    );
    bindChannelSession(deps.store, bindingKey, session.id, scopeKey);
    return {
      ...session,
      agentRoleKey: binding.agentRoleKey,
      modelId: binding.modelId,
    };
  }

  private syncSessionTruth(session: CoworkSession, binding: WechatBotAgentBinding, scopeKey: string): CoworkSession {
    const deps = this.requireDeps();
    const needsSync = session.systemPrompt !== scopeKey
      || session.sourceType !== 'external'
      || session.agentRoleKey !== binding.agentRoleKey
      || session.modelId !== binding.modelId;

    if (!needsSync) {
      return session;
    }

    deps.coworkStore.updateSession(session.id, {
      systemPrompt: scopeKey,
      sourceType: 'external',
      agentRoleKey: binding.agentRoleKey,
      modelId: binding.modelId,
    });

    return deps.coworkStore.getSession(session.id) || {
      ...session,
      systemPrompt: scopeKey,
      sourceType: 'external',
      agentRoleKey: binding.agentRoleKey,
      modelId: binding.modelId,
    };
  }

  private async buildPromptFromMessage(message: WechatMessage): Promise<string> {
    const textBody = extractTextBody(message.item_list);
    const parsedFiles = await this.downloadAndParseFiles(message.item_list);

    const sections: string[] = [];
    if (textBody) {
      sections.push(textBody);
    }

    if (parsedFiles.length > 0) {
      const fileBlocks = parsedFiles.map((file) => {
        if (file.parseError) {
          return [
            `文件: ${file.fileName}`,
            `保存路径: ${file.localPath}`,
            `解析结果: ${file.parseError}`,
          ].join('\n');
        }
        return [
          `文件: ${file.fileName}`,
          `保存路径: ${file.localPath}`,
          `类型: ${file.parseFileType}`,
          '提取文本:',
          file.parseText,
        ].join('\n');
      });

      sections.push([
        textBody ? '以下是用户本轮附带文档的底层解析结果。只根据这里展示的文本理解内容，不要假装读取了未展示部分。' : '用户本轮发送了文档，请优先根据以下解析结果处理。',
        '<attached_files>',
        ...fileBlocks,
        '</attached_files>',
      ].join('\n\n'));
    }

    return sections
      .map((section) => section.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  private async downloadAndParseFiles(itemList?: MessageItem[]): Promise<ParsedInboundFile[]> {
    if (!itemList?.length) {
      return [];
    }

    const fileItems = itemList
      .filter((item) => item.type === FILE_ITEM_TYPE && item.file_item?.media?.encrypt_query_param && item.file_item.media.aes_key)
      .slice(0, MAX_FILE_ATTACHMENTS);

    if (fileItems.length === 0) {
      return [];
    }

    const inboundDir = this.getInboundDir();
    ensureDirectory(inboundDir);

    const results: ParsedInboundFile[] = [];
    for (const item of fileItems) {
      const fileName = sanitizeFileName(item.file_item?.file_name || 'wechat-document.bin');
      const filePath = path.join(inboundDir, `${Date.now()}-${crypto.randomUUID()}-${fileName}`);

      try {
        const buffer = await downloadAndDecryptFile(
          item.file_item!.media!.encrypt_query_param!,
          item.file_item!.media!.aes_key!,
        );
        fs.writeFileSync(filePath, buffer);

        const parsed = await parseFile(fileName, buffer);
        results.push({
          fileName,
          localPath: filePath,
          parseText: parsed.text,
          parseFileType: parsed.fileType,
          parseError: parsed.success ? null : (parsed.error || '解析失败'),
        });
      } catch (error) {
        results.push({
          fileName,
          localPath: filePath,
          parseText: '',
          parseFileType: 'unknown',
          parseError: error instanceof Error ? error.message : '下载或解析失败',
        });
      }
    }

    return results;
  }

  private mirrorOutboundText(sessionId: string | undefined, text: string): void {
    const config = this.requireConfig();
    const deps = this.requireDeps();
    const normalizedText = text.trim();
    if (!config.syncBotReplies || !sessionId || !normalizedText) {
      return;
    }

    deps.coworkStore.addMessage(sessionId, {
      type: 'system',
      content: buildWechatbotMirrorText(normalizedText),
      metadata: {
        channel: 'wechatbot',
        isTransportMirror: true,
        mirrorKind: 'outbound_text',
      },
    });
  }

  private mirrorOutboundFile(sessionId: string | undefined, filePath: string): void {
    const config = this.requireConfig();
    const deps = this.requireDeps();
    if (!config.syncBotReplies || !sessionId) {
      return;
    }

    deps.coworkStore.addMessage(sessionId, {
      type: 'system',
      content: buildWechatbotMirrorFileNotice(path.basename(filePath)),
      metadata: {
        channel: 'wechatbot',
        isTransportMirror: true,
        mirrorKind: 'outbound_file',
        fileName: path.basename(filePath),
      },
    });
  }

  private async sendTextReply(
    toUserId: string,
    contextToken: string | undefined,
    text: string,
    mirrorSessionId?: string,
  ): Promise<void> {
    const config = this.requireConfig();
    const normalizedContextToken = String(contextToken || '').trim();
    if (!normalizedContextToken) {
      this.status.lastError = '微信回帖缺少 context_token，无法发送回复。';
      return;
    }

    const chunks = splitOutboundText(text);
    for (const chunk of chunks) {
      await sendWechatMessage({
        baseUrl: config.baseUrl,
        token: config.botToken,
        body: buildTextMessageBody({
          toUserId,
          contextToken: normalizedContextToken,
          text: chunk,
        }),
      });
      this.status.lastOutboundAt = Date.now();
      this.status.lastEventAt = this.status.lastOutboundAt;
    }

    this.mirrorOutboundText(mirrorSessionId, text);
  }

  private async sendFileReply(
    toUserId: string,
    contextToken: string | undefined,
    filePath: string,
    mirrorSessionId?: string,
  ): Promise<void> {
    const config = this.requireConfig();
    const normalizedContextToken = String(contextToken || '').trim();
    if (!normalizedContextToken) {
      this.status.lastError = '微信回帖缺少 context_token，无法发送文件。';
      return;
    }

    const plaintext = await fs.promises.readFile(filePath);
    const filekey = crypto.randomBytes(16).toString('hex');
    const rawsize = plaintext.length;
    const rawfilemd5 = crypto.createHash('md5').update(plaintext).digest('hex');
    const aeskey = crypto.randomBytes(16);
    const aeskeyHex = aeskey.toString('hex');
    const filesize = aesEcbPaddedSize(rawsize);
    const uploadUrlResponse = await getUploadUrl({
      baseUrl: config.baseUrl,
      token: config.botToken,
      filekey,
      rawsize,
      rawfilemd5,
      filesize,
      aeskeyHex,
      toUserId,
    });

    if (!uploadUrlResponse.upload_param) {
      throw new Error('微信文件发送失败：getuploadurl 未返回 upload_param。');
    }

    const downloadEncryptedQueryParam = await uploadEncryptedFile({
      plaintext,
      uploadParam: uploadUrlResponse.upload_param,
      filekey,
      aeskey,
    });

    await sendWechatMessage({
      baseUrl: config.baseUrl,
      token: config.botToken,
      body: buildFileMessageBody({
        toUserId,
        contextToken: normalizedContextToken,
        fileName: path.basename(filePath),
        uploaded: {
          downloadEncryptedQueryParam,
          aeskeyHex,
          fileSize: rawsize,
        },
      }),
    });

    this.status.lastOutboundAt = Date.now();
    this.status.lastEventAt = this.status.lastOutboundAt;
    this.mirrorOutboundFile(mirrorSessionId, filePath);
  }

  private requireConfig(): WechatBotBridgeConfig {
    if (!this.config) {
      throw new Error('WechatBot gateway config is not initialized.');
    }
    return this.config;
  }

  private requireDeps(): WechatBotGatewayDeps {
    if (!this.deps) {
      throw new Error('WechatBot gateway dependencies are not initialized.');
    }
    return this.deps;
  }
}

const wechatBotGateway = new WechatBotGateway();

export async function startWechatBotGateway(options: WechatBotGatewayStartOptions): Promise<WechatBotGatewayStatus> {
  return wechatBotGateway.start(options);
}

export async function stopWechatBotGateway(): Promise<WechatBotGatewayStatus> {
  return wechatBotGateway.stop();
}

export function getWechatBotGatewayStatus(): WechatBotGatewayStatus {
  return wechatBotGateway.getStatus();
}
