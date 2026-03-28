import fs from 'fs';
import path from 'path';

import { resolveRuntimeUserDataPath } from '../../src/shared/runtimeDataPaths';

export const WECHATBOT_CHANNEL_ID = 'openclaw-weixin';
export const WECHATBOT_BRIDGE_MODE = 'official-relay' as const;

export type WechatBotBridgeConfig = {
  enabled: boolean;
  bridgeMode: typeof WECHATBOT_BRIDGE_MODE;
  agentRoleKey: string;
  botAccountId: string;
  linkedUserId: string;
  baseUrl: string;
  botToken: string;
  syncBotReplies: boolean;
};

type WechatBotBridgeBinding = Omit<WechatBotBridgeConfig, 'botToken'> & {
  updatedAt: number;
};

type WechatBotBridgeCredentials = {
  botToken: string;
  updatedAt: number;
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeWechatBotConfig(config: any): WechatBotBridgeConfig {
  const raw = isPlainObject(config?.wechatbot) ? config.wechatbot : {};
  return {
    enabled: raw.enabled === true,
    bridgeMode: WECHATBOT_BRIDGE_MODE,
    agentRoleKey: typeof raw.agentRoleKey === 'string' ? raw.agentRoleKey.trim() : '',
    botAccountId: typeof raw.botAccountId === 'string' ? raw.botAccountId.trim() : '',
    linkedUserId: typeof raw.linkedUserId === 'string' ? raw.linkedUserId.trim() : '',
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '',
    botToken: typeof raw.botToken === 'string' ? raw.botToken.trim() : '',
    syncBotReplies: raw.syncBotReplies !== false,
  };
}

export function getWechatBotRuntimeDir(userDataPath = resolveRuntimeUserDataPath()): string {
  return path.join(userDataPath, 'channels', WECHATBOT_CHANNEL_ID);
}

export function getWechatBotBindingPath(userDataPath = resolveRuntimeUserDataPath()): string {
  return path.join(getWechatBotRuntimeDir(userDataPath), 'binding.json');
}

export function getWechatBotCredentialsPath(userDataPath = resolveRuntimeUserDataPath()): string {
  return path.join(getWechatBotRuntimeDir(userDataPath), 'credentials.json');
}

function readJsonIfExists<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readWechatBotRuntimeConfig(userDataPath = resolveRuntimeUserDataPath()): WechatBotBridgeConfig {
  const binding = readJsonIfExists<Partial<WechatBotBridgeBinding>>(getWechatBotBindingPath(userDataPath));
  const credentials = readJsonIfExists<Partial<WechatBotBridgeCredentials>>(getWechatBotCredentialsPath(userDataPath));

  return {
    enabled: binding?.enabled === true,
    bridgeMode: WECHATBOT_BRIDGE_MODE,
    agentRoleKey: typeof binding?.agentRoleKey === 'string' ? binding.agentRoleKey.trim() : '',
    botAccountId: typeof binding?.botAccountId === 'string' ? binding.botAccountId.trim() : '',
    linkedUserId: typeof binding?.linkedUserId === 'string' ? binding.linkedUserId.trim() : '',
    baseUrl: typeof binding?.baseUrl === 'string' ? binding.baseUrl.trim() : '',
    botToken: typeof credentials?.botToken === 'string' ? credentials.botToken.trim() : '',
    syncBotReplies: binding?.syncBotReplies !== false,
  };
}

export function mergeWechatBotConfigWithRuntime(config: any, userDataPath = resolveRuntimeUserDataPath()): WechatBotBridgeConfig {
  const current = normalizeWechatBotConfig(config);
  const runtime = readWechatBotRuntimeConfig(userDataPath);

  return {
    enabled: current.enabled || runtime.enabled,
    bridgeMode: WECHATBOT_BRIDGE_MODE,
    agentRoleKey: current.agentRoleKey || runtime.agentRoleKey,
    botAccountId: current.botAccountId || runtime.botAccountId,
    linkedUserId: current.linkedUserId || runtime.linkedUserId,
    baseUrl: current.baseUrl || runtime.baseUrl,
    botToken: current.botToken || runtime.botToken,
    syncBotReplies: current.syncBotReplies,
  };
}

export function syncWechatBotConfigToRuntime(config: any, userDataPath = resolveRuntimeUserDataPath()): void {
  const normalized = normalizeWechatBotConfig(config);
  const runtimeDir = getWechatBotRuntimeDir(userDataPath);
  const bindingPath = getWechatBotBindingPath(userDataPath);
  const credentialsPath = getWechatBotCredentialsPath(userDataPath);

  fs.mkdirSync(runtimeDir, { recursive: true });

  const binding: WechatBotBridgeBinding = {
    enabled: normalized.enabled,
    bridgeMode: normalized.bridgeMode,
    agentRoleKey: normalized.agentRoleKey,
    botAccountId: normalized.botAccountId,
    linkedUserId: normalized.linkedUserId,
    baseUrl: normalized.baseUrl,
    syncBotReplies: normalized.syncBotReplies,
    updatedAt: Date.now(),
  };

  fs.writeFileSync(bindingPath, JSON.stringify(binding, null, 2), 'utf8');

  if (normalized.botToken) {
    const credentials: WechatBotBridgeCredentials = {
      botToken: normalized.botToken,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), 'utf8');
    return;
  }

  if (fs.existsSync(credentialsPath)) {
    fs.unlinkSync(credentialsPath);
  }
}
