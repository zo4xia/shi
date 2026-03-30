import crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const BOT_TYPE = '3';
const LONG_POLL_TIMEOUT_MS = 35_000;
const REQUEST_TIMEOUT_MS = 15_000;
const SESSION_TTL_MS = 10 * 60 * 1000;

export type WechatBotQrLoginPhase = 'wait' | 'scanned' | 'confirmed' | 'expired' | 'error';

export type WechatBotQrLoginSession = {
  sessionId: string;
  qrcodeTicket: string;
  qrcodeUrl: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  phase: WechatBotQrLoginPhase;
  lastError: string | null;
  result: null | {
    botAccountId: string;
    linkedUserId: string;
    botToken: string;
    baseUrl: string;
    messageForms: string[];
  };
};

type QrCodeResponse = {
  qrcode?: string;
  qrcode_img_content?: string;
};

type QrStatusResponse = {
  status?: 'wait' | 'scaned' | 'confirmed' | 'expired';
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
};

const loginSessions = new Map<string, WechatBotQrLoginSession>();

function normalizeBaseUrl(baseUrl?: string): string {
  return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/$/, '') || DEFAULT_BASE_URL;
}

function buildTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? buildTimeoutSignal(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return await response.json() as T;
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of loginSessions.entries()) {
    if (session.expiresAt <= now || session.phase === 'expired') {
      loginSessions.delete(sessionId);
    }
  }
}

export async function createWechatBotQrLoginSession(baseUrl?: string): Promise<WechatBotQrLoginSession> {
  cleanupExpiredSessions();

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const qrCodeResponse = await fetchJson<QrCodeResponse>(
    `${normalizedBaseUrl}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`,
    {
      method: 'GET',
      headers: {
        'iLink-App-ClientVersion': '1',
      },
    }
  );

  if (!qrCodeResponse.qrcode || !qrCodeResponse.qrcode_img_content) {
    throw new Error('微信官方未返回有效二维码信息');
  }

  const now = Date.now();
  const session: WechatBotQrLoginSession = {
    sessionId: crypto.randomUUID(),
    qrcodeTicket: qrCodeResponse.qrcode,
    qrcodeUrl: qrCodeResponse.qrcode_img_content,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + SESSION_TTL_MS,
    phase: 'wait',
    lastError: null,
    result: null,
  };

  loginSessions.set(session.sessionId, session);
  return session;
}

export function getWechatBotQrLoginSession(sessionId: string): WechatBotQrLoginSession | null {
  cleanupExpiredSessions();
  return loginSessions.get(sessionId) ?? null;
}

export async function waitWechatBotQrLoginSession(sessionId: string): Promise<WechatBotQrLoginSession | null> {
  cleanupExpiredSessions();
  const session = loginSessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.phase === 'confirmed' || session.phase === 'expired' || session.phase === 'error') {
    return session;
  }

  const normalizedBaseUrl = normalizeBaseUrl(session.result?.baseUrl);

  try {
    const statusResponse = await fetchJson<QrStatusResponse>(
      `${normalizedBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(session.qrcodeTicket)}`,
      {
        method: 'GET',
        headers: {
          'iLink-App-ClientVersion': '1',
        },
      },
      LONG_POLL_TIMEOUT_MS,
    );

    session.updatedAt = Date.now();
    session.lastError = null;

    switch (statusResponse.status) {
      case 'scaned':
        session.phase = 'scanned';
        break;
      case 'expired':
        session.phase = 'expired';
        session.expiresAt = Date.now();
        break;
      case 'confirmed':
        if (!statusResponse.bot_token || !statusResponse.ilink_bot_id) {
          session.phase = 'error';
          session.lastError = '微信官方返回缺少 bot_token 或 ilink_bot_id。';
          break;
        }
        session.phase = 'confirmed';
        session.result = {
          botAccountId: statusResponse.ilink_bot_id,
          linkedUserId: String(statusResponse.ilink_user_id || '').trim(),
          botToken: statusResponse.bot_token,
          baseUrl: normalizeBaseUrl(statusResponse.baseurl),
          messageForms: ['text', 'document'],
        };
        break;
      case 'wait':
      default:
        session.phase = 'wait';
        break;
    }
  } catch (error) {
    if (error instanceof Error && /aborted|timeout/i.test(error.message)) {
      session.updatedAt = Date.now();
      if (session.phase !== 'scanned') {
        session.phase = 'wait';
      }
      return session;
    }

    session.updatedAt = Date.now();
    session.phase = 'error';
    session.lastError = error instanceof Error ? error.message : '微信扫码状态轮询失败';
  }

  return session;
}
