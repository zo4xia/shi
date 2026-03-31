import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { RequestContext } from '../src/index';
import { AGENT_ROLE_ORDER } from '../../src/shared/agentRoleConfig';
import {
  getProjectRoot,
  resolveRuntimeUserDataPath,
} from '../../src/shared/runtimeDataPaths';
import {
  ENV_ALIAS_PAIRS,
  getEnvAliasKeysForPair,
  readEnvAliasPair,
  readEnvAliasPairWithSuffix,
} from '../../src/shared/envAliases';
import {
  getSharedSkillSecretPath,
  getSharedSkillSecretsRoot,
  readJsonRecordIfExists,
} from '../../src/shared/skillSecretRuntime';
import {
  ensureRoleRuntimeDirs,
  getRoleSkillSecretPath,
  syncRoleSkillIndexes,
} from '../libs/roleSkillFiles';
import { syncRoleCapabilitySnapshots } from '../libs/roleRuntimeViews';
import {
  mergeWechatBotConfigWithRuntime,
  syncWechatBotConfigToRuntime,
} from '../libs/wechatbotBridgeRuntime';

const IMA_SKILL_ID = 'ima-note';
const APP_CONFIG_REQUIRED_TOP_LEVEL_KEYS = ['api', 'model', 'theme', 'language', 'useSystemProxy', 'app'] as const;
const APP_CONFIG_PROTECTED_TOP_LEVEL_KEYS = [
  'agentRoles',
  'conversationFileCache',
  'dailyMemory',
  'helpers',
  'nativeCapabilities',
  'providers',
  'links',
  'shortcuts',
] as const;

export function resolveEnvSyncTargetPath(): string {
  const explicitEnvPath = process.env.UCLAW_ENV_FILE?.trim() || process.env.LOBSTERAI_ENV_FILE?.trim() || '';
  if (!explicitEnvPath) {
    return path.join(getProjectRoot(), '.env');
  }
  return path.isAbsolute(explicitEnvPath)
    ? explicitEnvPath
    : path.join(getProjectRoot(), explicitEnvPath);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function mergeOptionalObject(
  currentValue: unknown,
  incomingValue: unknown,
): unknown {
  if (incomingValue === undefined) {
    return currentValue;
  }
  if (isPlainObject(currentValue) && isPlainObject(incomingValue)) {
    return {
      ...currentValue,
      ...incomingValue,
    };
  }
  return incomingValue;
}

function mergeRecordOfObjects(
  currentValue: unknown,
  incomingValue: unknown,
): unknown {
  if (incomingValue === undefined) {
    return currentValue;
  }
  if (!isPlainObject(currentValue) || !isPlainObject(incomingValue)) {
    return incomingValue;
  }

  const next: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(currentValue), ...Object.keys(incomingValue)]);

  for (const key of keys) {
    const currentEntry = currentValue[key];
    const incomingEntry = incomingValue[key];
    next[key] = incomingEntry === undefined
      ? currentEntry
      : isPlainObject(currentEntry) && isPlainObject(incomingEntry)
        ? { ...currentEntry, ...incomingEntry }
        : incomingEntry;
  }

  return next;
}

export function prepareAppConfigForStore(
  currentValue: unknown,
  incomingValue: unknown,
  source: string,
): Record<string, unknown> {
  // {路标} FLOW-STORE-APP-CONFIG-GUARD
  if (!isPlainObject(incomingValue)) {
    throw new Error('Invalid app_config payload: expected object');
  }

  const currentConfig = isPlainObject(currentValue) ? currentValue : {};
  const incomingConfig = incomingValue;
  const next: Record<string, unknown> = {
    ...currentConfig,
    ...incomingConfig,
  };

  next.api = mergeOptionalObject(currentConfig.api, incomingConfig.api);
  next.model = mergeOptionalObject(currentConfig.model, incomingConfig.model);
  next.app = mergeOptionalObject(currentConfig.app, incomingConfig.app);
  next.links = mergeOptionalObject(currentConfig.links, incomingConfig.links);
  next.shortcuts = mergeOptionalObject(currentConfig.shortcuts, incomingConfig.shortcuts);
  next.helpers = mergeOptionalObject(currentConfig.helpers, incomingConfig.helpers);
  next.conversationFileCache = mergeOptionalObject(
    currentConfig.conversationFileCache,
    incomingConfig.conversationFileCache,
  );
  next.dailyMemory = mergeOptionalObject(currentConfig.dailyMemory, incomingConfig.dailyMemory);
  next.providers = mergeRecordOfObjects(currentConfig.providers, incomingConfig.providers);
  next.agentRoles = mergeRecordOfObjects(currentConfig.agentRoles, incomingConfig.agentRoles);
  next.nativeCapabilities = mergeRecordOfObjects(
    currentConfig.nativeCapabilities,
    incomingConfig.nativeCapabilities,
  );

  const missingRequiredKeys = APP_CONFIG_REQUIRED_TOP_LEVEL_KEYS.filter((key) => {
    const value = next[key];
    return value === undefined || value === null;
  });
  if (missingRequiredKeys.length > 0) {
    throw new Error(
      `[app_config guard] ${source} missing required top-level keys: ${missingRequiredKeys.join(', ')}`,
    );
  }

  const preservedProtectedKeys = APP_CONFIG_PROTECTED_TOP_LEVEL_KEYS.filter((key) => (
    !hasOwn(incomingConfig, key)
    && currentConfig[key] !== undefined
  ));
  if (preservedProtectedKeys.length > 0) {
    console.warn(
      `[app_config guard] ${source} preserved existing keys: ${preservedProtectedKeys.join(', ')}`,
    );
  }

  return next;
}

function ensureSharedSkillSecretsDir(userDataPath: string): void {
  fs.mkdirSync(getSharedSkillSecretsRoot(userDataPath), { recursive: true });
}

function syncProcessEnvFromContent(envContent: string): void {
  const lines = envContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}

function normalizeImaConfig(config: any): { clientId: string; apiKey: string } {
  return {
    clientId: String(config?.ima?.clientId ?? '').trim(),
    apiKey: String(config?.ima?.apiKey ?? '').trim(),
  };
}

function readImaSharedSecret(userDataPath: string): { clientId: string; apiKey: string } | null {
  const secret = readJsonRecordIfExists(getSharedSkillSecretPath(userDataPath, IMA_SKILL_ID));
  if (!secret) {
    return null;
  }

  const clientId = String(secret.IMA_OPENAPI_CLIENTID ?? '').trim();
  const apiKey = String(secret.IMA_OPENAPI_APIKEY ?? '').trim();
  if (!clientId && !apiKey) {
    return null;
  }

  return { clientId, apiKey };
}

function writeImaSharedSecret(userDataPath: string, ima: { clientId: string; apiKey: string }): void {
  const sharedSecretPath = getSharedSkillSecretPath(userDataPath, IMA_SKILL_ID);
  if (!ima.clientId && !ima.apiKey) {
    if (fs.existsSync(sharedSecretPath)) {
      fs.unlinkSync(sharedSecretPath);
    }
    return;
  }

  ensureSharedSkillSecretsDir(userDataPath);
  fs.writeFileSync(sharedSecretPath, JSON.stringify({
    IMA_OPENAPI_CLIENTID: ima.clientId,
    IMA_OPENAPI_APIKEY: ima.apiKey,
  }, null, 2), 'utf8');
}

function resolveImaFallbackConfig(): { clientId: string; apiKey: string } {
  const envClientId = readEnvAliasPair(ENV_ALIAS_PAIRS.imaOpenapiClientId) ?? '';
  const envApiKey = readEnvAliasPair(ENV_ALIAS_PAIRS.imaOpenapiApiKey) ?? '';

  if (envClientId || envApiKey) {
    return { clientId: envClientId, apiKey: envApiKey };
  }

  const userDataPath = resolveRuntimeUserDataPath();
  const sharedSecret = readImaSharedSecret(userDataPath);
  if (sharedSecret) {
    return sharedSecret;
  }

  for (const roleKey of AGENT_ROLE_ORDER) {
    const secretPath = getRoleSkillSecretPath(userDataPath, roleKey, IMA_SKILL_ID);
    const secret = readJsonRecordIfExists(secretPath);
    if (!secret) {
      continue;
    }

    const clientId = String(secret.IMA_OPENAPI_CLIENTID ?? '').trim();
    const apiKey = String(secret.IMA_OPENAPI_APIKEY ?? '').trim();
    if (clientId || apiKey) {
      writeImaSharedSecret(userDataPath, { clientId, apiKey });
      return { clientId, apiKey };
    }
  }

  return { clientId: '', apiKey: '' };
}

function resolveFeishuFallbackConfig(): any {
  const apps: Array<{
    id: string;
    name: string;
    appId: string;
    appSecret: string;
    agentRoleKey: string;
    enabled: boolean;
    createdAt: number;
  }> = [];

  for (let index = 0; index < 10; index += 1) {
    const suffix = index === 0 ? '' : `_${index}`;
    const appId = readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.feishuAppId, suffix)?.trim();
    const appSecret = readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.feishuAppSecret, suffix)?.trim();

    if (!appId || !appSecret) {
      continue;
    }

    apps.push({
      id: `env-feishu-${index}`,
      name: readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.feishuAppName, suffix)?.trim() || `飞书应用 ${index + 1}`,
      appId,
      appSecret,
      agentRoleKey: readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.feishuAgentRoleKey, suffix)?.trim() || 'organizer',
      enabled: true,
      createdAt: 0,
    });
  }

  return {
    enabled: apps.length > 0,
    apps,
  };
}

function hydrateImConfigWithRuntime(value: any): any {
  const config = value && typeof value === 'object' ? { ...value } : {};
  const currentIma = normalizeImaConfig(config);
  const mergedWechatBot = mergeWechatBotConfigWithRuntime(config);
  const currentFeishu = config.feishu && typeof config.feishu === 'object' ? config.feishu : null;
  const hasConfiguredFeishuApps = Array.isArray(currentFeishu?.apps) && currentFeishu.apps.length > 0;
  const fallbackFeishu = resolveFeishuFallbackConfig();
  const hydratedFeishu = hasConfiguredFeishuApps
    ? currentFeishu
    : {
        ...fallbackFeishu,
        enabled: typeof currentFeishu?.enabled === 'boolean'
          ? currentFeishu.enabled
          : fallbackFeishu.enabled,
      };

  if (currentIma.clientId || currentIma.apiKey) {
    return {
      ...config,
      feishu: hydratedFeishu,
      ima: currentIma,
      wechatbot: mergedWechatBot,
    };
  }

  return {
    ...config,
    feishu: hydratedFeishu,
    ima: resolveImaFallbackConfig(),
    wechatbot: mergedWechatBot,
  };
}

function syncImaConfigToRoleSecrets(config: any): void {
  const ima = normalizeImaConfig(config);
  const userDataPath = resolveRuntimeUserDataPath();
  ensureRoleRuntimeDirs(userDataPath);
  writeImaSharedSecret(userDataPath, ima);

  for (const roleKey of AGENT_ROLE_ORDER) {
    const secretPath = getRoleSkillSecretPath(userDataPath, roleKey, IMA_SKILL_ID);
    if (!ima.clientId && !ima.apiKey) {
      if (fs.existsSync(secretPath)) {
        fs.unlinkSync(secretPath);
      }
      continue;
    }

    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, JSON.stringify({
      IMA_OPENAPI_CLIENTID: ima.clientId,
      IMA_OPENAPI_APIKEY: ima.apiKey,
    }, null, 2), 'utf8');
  }
}

function ensureImaSkillBindings(req: Request): void {
  const userDataPath = String(req.app.get('userDataPath') || '');
  if (!userDataPath) return;

  const { store, skillManager, mcpStore } = req.context as RequestContext;
  const installedSkills = skillManager.listSkills();
  const hasImaSkill = installedSkills.some((skill) => skill.id === IMA_SKILL_ID || skill.name === IMA_SKILL_ID);
  if (!hasImaSkill) {
    return;
  }

  const db = store.getDatabase();
  const now = Date.now();
  let inserted = false;

  for (const roleKey of AGENT_ROLE_ORDER) {
    const existing = db.exec(
      'SELECT id FROM skill_role_configs WHERE role_key = ? AND skill_id = ? LIMIT 1',
      [roleKey, IMA_SKILL_ID],
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      continue;
    }

    db.run(
      `INSERT INTO skill_role_configs
       (id, role_key, skill_id, skill_name, prefix, enabled, config_json, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        roleKey,
        IMA_SKILL_ID,
        IMA_SKILL_ID,
        `${roleKey}_`,
        '{}',
        now,
        now,
      ],
    );
    inserted = true;
  }

  if (!inserted) {
    return;
  }

  store.getSaveFunction()();
  syncRoleSkillIndexes(userDataPath, store, skillManager);
  syncRoleCapabilitySnapshots(userDataPath, store, skillManager, mcpStore);
}

// {埋点} 💾 .env同步 (ID: env-sync-001) 前端保存app_config时，4个角色的API配置分别写入.env
export function syncAppConfigToEnv(config: any): void {
  try {
    const envPath = resolveEnvSyncTargetPath();
    if (!fs.existsSync(envPath)) { console.log('[env-sync] env target NOT FOUND at', envPath); return; }

    let envContent = fs.readFileSync(envPath, 'utf8');

    const roles = config.agentRoles;
    const fallbackApi = config?.api && typeof config.api === 'object' ? config.api : null;
    const dailyMemory = config?.dailyMemory && typeof config.dailyMemory === 'object' ? config.dailyMemory : null;
    console.log('[env-sync] agentRoles keys:', roles ? Object.keys(roles) : 'NONE');
    if (roles) {
      // 按角色写入各自的变量: UCLAW_* 为主，LOBSTERAI_* 兼容同步
      for (const [roleKey, role] of Object.entries(roles) as [string, any][]) {
        if (!role) continue;
        const suffix = '_' + roleKey.toUpperCase();
        envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.apiBaseUrl, role.apiUrl || '', suffix);
        envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.apiKey, role.apiKey || '', suffix);
        envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.defaultModel, role.modelId || '', suffix);
        console.log(`[env-sync] ${roleKey}: url=${(role.apiUrl || '').slice(0, 50)}, model=${role.modelId}`);
      }
      // {标记} NO-TOUCH-ENV-PRIMARY
      // 无后缀主 API 变量是“当前主链默认入口”，必须优先跟 config.api 走。
      // 不允许因为角色面板、小帮手配置、局部辅助功能保存，而把主 API 默认入口误伤切走。
      // 如果以后要改这里，必须同时核对：
      // 1. Settings 保存链
      // 2. .env 同步链
      // 3. claudeSettings / 当前运行态读取链
      const primaryKey = Object.keys(roles).find(k => roles[k].enabled) || 'organizer';
      const primary = roles[primaryKey];
      envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.apiBaseUrl, fallbackApi?.baseUrl || primary?.apiUrl || '');
      envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.apiKey, fallbackApi?.key || primary?.apiKey || '');
      envContent = upsertEnvAliasLines(
        envContent,
        ENV_ALIAS_PAIRS.defaultModel,
        fallbackApi?.defaultModel || config?.model?.defaultModel || primary?.modelId || '',
      );
    }

    envContent = upsertEnvAliasLines(
      envContent,
      ENV_ALIAS_PAIRS.dailyMemoryApiBaseUrl,
      dailyMemory?.enabled ? (dailyMemory.apiUrl || '') : '',
    );
    envContent = upsertEnvAliasLines(
      envContent,
      ENV_ALIAS_PAIRS.dailyMemoryApiKey,
      dailyMemory?.enabled ? (dailyMemory.apiKey || '') : '',
    );
    envContent = upsertEnvAliasLines(
      envContent,
      ENV_ALIAS_PAIRS.dailyMemoryModel,
      dailyMemory?.enabled ? (dailyMemory.modelId || '') : '',
    );
    envContent = upsertEnvAliasLines(
      envContent,
      ENV_ALIAS_PAIRS.dailyMemoryApiFormat,
      dailyMemory?.enabled ? (dailyMemory.apiFormat || 'openai') : '',
    );

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('[env-sync] .env written successfully');
    syncProcessEnvFromContent(envContent);
  } catch (err) {
    console.error('[env-sync] Failed to sync app_config to .env:', err);
  }
}

// {埋点} 💾 .env同步 (ID: env-sync-002) IM配置保存时，飞书凭证同步写入.env
function syncImConfigToEnv(config: any): void {
  try {
    const envPath = resolveEnvSyncTargetPath();
    if (!fs.existsSync(envPath)) return;

    let envContent = fs.readFileSync(envPath, 'utf8');

    // 飞书配置 - 写入所有apps，第0个用无后缀变量，其余用_1/_2...后缀
    const feishu = config.feishu;
    if (feishu?.apps?.length > 0) {
      feishu.apps.forEach((app: any, i: number) => {
        if (!app) return;
        const suffix = i === 0 ? '' : `_${i}`;
        envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.feishuAppId, app.appId || '', suffix);
        envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.feishuAppSecret, app.appSecret || '', suffix);
        envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.feishuAgentRoleKey, app.agentRoleKey || 'organizer', suffix);
      });
    }

    const ima = normalizeImaConfig(config);
    envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.imaOpenapiClientId, ima.clientId);
    envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.imaOpenapiApiKey, ima.apiKey);

    fs.writeFileSync(envPath, envContent, 'utf8');
    syncProcessEnvFromContent(envContent);
  } catch (err) {
    console.error('[env-sync] Failed to sync im_config to .env:', err);
  }
}

function upsertEnvAliasLines(content: string, pair: { primary: string; legacy: string }, value: string, suffix = ''): string {
  let nextContent = content;
  for (const key of getEnvAliasKeysForPair(pair, suffix)) {
    nextContent = upsertEnvLine(nextContent, key, value);
  }
  return nextContent;
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  // 如果有注释掉的同名key，在它后面插入
  const commentRegex = new RegExp(`^#\\s*${key}=.*$`, 'm');
  if (commentRegex.test(content)) {
    return content.replace(commentRegex, `$&\n${line}`);
  }
  // 否则追加到末尾
  return content.trimEnd() + '\n' + line + '\n';
}

export function setupStoreRoutes(app: Router) {
  const router = Router();

  function syncRoleCapabilityViews(req: Request): void {
    const userDataPath = String(req.app.get('userDataPath') || '');
    if (!userDataPath) {
      return;
    }
    const { store, skillManager, mcpStore } = req.context as RequestContext;
    ensureRoleRuntimeDirs(userDataPath);
    syncRoleCapabilitySnapshots(userDataPath, store, skillManager, mcpStore);
  }

  // {埋点} 💾 KV读取 (ID: kv-read-001) GET /api/store/:key → SQLite kv表
  // {ROUTE} /api/store/:key [GET]
  // {FLOW} STORE-LIGHT-READ: 普通读取偏轻，不应因 lazy context 被误判为会默认拉起重对象。
  // {路标} FLOW-ROUTE-STORE-KEY
  router.get('/:key', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const value = req.params.key === 'im_config'
        ? hydrateImConfigWithRuntime(store.get(req.params.key))
        : store.get(req.params.key);
      res.json({ success: true, value });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get value',
      });
    }
  });

  // {埋点} 💾 KV写入 (ID: kv-write-001) POST /api/store/:key → SQLite kv表 + .env同步
  // {ROUTE} /api/store/:key [POST]
  // {BREAKPOINT} STORE-WRITE-RUNTIME-SYNC
  // {FLOW} STORE-WRITE-EXPANDS: app_config / im_config 写入会触发 .env、skills、role runtime 相关同步，不属于纯轻写。
  // {路标} FLOW-ROUTE-STORE-KEY
  router.post('/:key', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const currentValue = store.get(req.params.key);
      const nextValue = req.params.key === 'im_config'
        ? hydrateImConfigWithRuntime(req.body)
        : req.params.key === 'app_config'
          ? prepareAppConfigForStore(currentValue, req.body, 'store.post')
          : req.body;
      store.set(req.params.key, nextValue);

      // 同步关键配置到.env
      if (req.params.key === 'app_config') {
        syncAppConfigToEnv(nextValue);
        syncRoleCapabilityViews(req);
      }
      if (req.params.key === 'im_config') {
        syncImConfigToEnv(nextValue);
        syncImaConfigToRoleSecrets(nextValue);
        syncWechatBotConfigToRuntime(nextValue);
        ensureImaSkillBindings(req);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set value',
      });
    }
  });

  // {埋点} 💾 KV写入 (ID: kv-write-002) PUT /api/store/:key → SQLite kv表 + .env同步
  // {ROUTE} /api/store/:key [PUT]
  // {BREAKPOINT} STORE-WRITE-RUNTIME-SYNC
  // {FLOW} STORE-WRITE-EXPANDS: app_config / im_config 写入会触发 .env、skills、role runtime 相关同步，不属于纯轻写。
  // {路标} FLOW-ROUTE-STORE-KEY
  router.put('/:key', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const currentValue = store.get(req.params.key);
      const nextValue = req.params.key === 'im_config'
        ? hydrateImConfigWithRuntime(req.body)
        : req.params.key === 'app_config'
          ? prepareAppConfigForStore(currentValue, req.body, 'store.put')
          : req.body;
      store.set(req.params.key, nextValue);

      // 同步关键配置到.env
      if (req.params.key === 'app_config') {
        syncAppConfigToEnv(nextValue);
        syncRoleCapabilityViews(req);
      }
      if (req.params.key === 'im_config') {
        syncImConfigToEnv(nextValue);
        syncImaConfigToRoleSecrets(nextValue);
        syncWechatBotConfigToRuntime(nextValue);
        ensureImaSkillBindings(req);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set value',
      });
    }
  });

  // DELETE /api/store/:key - Remove a value from the store
  // {路标} FLOW-ROUTE-STORE-KEY
  router.delete('/:key', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      store.delete(req.params.key);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete value',
      });
    }
  });

  // {路标} FLOW-MOUNT-STORE
  app.use('/api/store', router);
}
