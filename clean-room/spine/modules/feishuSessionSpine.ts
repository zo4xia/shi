import type { AgentRoleKey, KvStore, SessionRecord, SessionStore } from './contracts';
import {
  bindChannelSession,
  buildChannelBindingKey,
  getBoundChannelSession,
} from './channelSessionBinding';

const FEISHU_SESSION_SCOPE_PREFIX = 'im:feishu:chat:';
const FEISHU_LEGACY_WS_SCOPE_PREFIX = 'im:feishu:ws:';
const FEISHU_LEGACY_WEBHOOK_SCOPE_PREFIX = 'im:feishu:app:';

export interface FeishuAgentBinding {
  agentRoleKey: AgentRoleKey;
  modelId: string;
  roleLabel: string;
}

export interface FeishuAppConfig {
  appId?: string;
  name?: string;
}

function findLatestSessionsByScope(
  sessionStore: SessionStore,
  options: {
    agentRoleKey: AgentRoleKey;
    scopeKeys: string[];
    limit?: number;
  }
): SessionRecord[] {
  const scopeKeys = Array.from(new Set(options.scopeKeys.filter(Boolean)));
  if (scopeKeys.length === 0) {
    return [];
  }

  const limit = Math.max(1, options.limit ?? 1);
  const placeholders = scopeKeys.map(() => '?').join(', ');
  const result = sessionStore.getDatabase().exec(
    `
      SELECT id
      FROM cowork_sessions
      WHERE agent_role_key = ?
        AND system_prompt IN (${placeholders})
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `,
    [options.agentRoleKey, ...scopeKeys]
  );

  const ids = (result[0]?.values ?? [])
    .map((row) => row?.[0])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return ids
    .map((sessionId) => sessionStore.getSession(sessionId))
    .filter((session): session is SessionRecord => Boolean(session));
}

function findMigratableLegacyFeishuSession(
  sessionStore: SessionStore,
  binding: FeishuAgentBinding,
  app: FeishuAppConfig
): SessionRecord | null {
  const legacyCandidates = findLatestSessionsByScope(sessionStore, {
    agentRoleKey: binding.agentRoleKey,
    scopeKeys: [
      `${FEISHU_LEGACY_WS_SCOPE_PREFIX}${app.appId}`,
      `${FEISHU_LEGACY_WEBHOOK_SCOPE_PREFIX}${app.appId}`,
    ],
    limit: 2,
  });

  if (legacyCandidates.length !== 1) {
    return null;
  }

  return legacyCandidates[0];
}

function syncFeishuSessionTruth(
  sessionStore: SessionStore,
  session: SessionRecord,
  binding: FeishuAgentBinding,
  scopeKey: string
): SessionRecord {
  // {标记} P0-IDENTITY-BOUNDARY: 这里同步的是渠道作用域与当前 runtime 元信息；session 复用判断本身不能按 modelId 切桶。
  // modelId 只用于“当前绑定的发动机是否需要刷新到 session 元信息”，不用于 identity / thread / memory bucket。
  const needsSync = session.systemPrompt !== scopeKey
    || session.sourceType !== 'external'
    || session.agentRoleKey !== binding.agentRoleKey
    || session.modelId !== binding.modelId;

  if (!needsSync) {
    return session;
  }

  sessionStore.updateSession(session.id, {
    systemPrompt: scopeKey,
    sourceType: 'external',
    agentRoleKey: binding.agentRoleKey,
    modelId: binding.modelId,
  });

  return sessionStore.getSession(session.id) || {
    ...session,
    systemPrompt: scopeKey,
    sourceType: 'external',
    agentRoleKey: binding.agentRoleKey,
    modelId: binding.modelId,
  };
}

function getFeishuSessionScopeKey(app: FeishuAppConfig, chatId: string): string {
  if (!app.appId) {
    throw new Error('Feishu appId is required for session scoping.');
  }
  return `${FEISHU_SESSION_SCOPE_PREFIX}${app.appId}:${chatId}`;
}

export function findReusableFeishuSession(
  sessionStore: SessionStore,
  kvStore: KvStore,
  app: FeishuAppConfig,
  binding: FeishuAgentBinding,
  chatId: string
): SessionRecord | null {
  const scopeKey = getFeishuSessionScopeKey(app, chatId);
  const bindingKey = buildChannelBindingKey('feishu', scopeKey, binding.agentRoleKey);

  const bound = getBoundChannelSession(kvStore, sessionStore, bindingKey);
  if (bound) {
    return syncFeishuSessionTruth(sessionStore, bound, binding, scopeKey);
  }

  const exactScopedSession = findLatestSessionsByScope(sessionStore, {
    agentRoleKey: binding.agentRoleKey,
    scopeKeys: [scopeKey],
    limit: 1,
  })[0] ?? null;

  if (exactScopedSession) {
    bindChannelSession(kvStore, bindingKey, exactScopedSession.id, scopeKey);
    return syncFeishuSessionTruth(sessionStore, exactScopedSession, binding, scopeKey);
  }

  const migratableLegacySession = findMigratableLegacyFeishuSession(sessionStore, binding, app);
  if (!migratableLegacySession) {
    return null;
  }

  bindChannelSession(kvStore, bindingKey, migratableLegacySession.id, scopeKey);
  return syncFeishuSessionTruth(sessionStore, migratableLegacySession, binding, scopeKey);
}

export function getOrCreateFeishuSession(
  sessionStore: SessionStore,
  kvStore: KvStore,
  app: FeishuAppConfig,
  binding: FeishuAgentBinding,
  chatId: string,
  cwd: string
): SessionRecord {
  const existing = findReusableFeishuSession(sessionStore, kvStore, app, binding, chatId);
  if (existing) {
    return existing;
  }

  const scopeKey = getFeishuSessionScopeKey(app, chatId);
  const bindingKey = buildChannelBindingKey('feishu', scopeKey, binding.agentRoleKey);
  const session = sessionStore.createSession(
    `${app.name || binding.roleLabel} - 飞书对话`,
    cwd,
    scopeKey,
    'local',
    [],
    {
      agentRoleKey: binding.agentRoleKey,
      modelId: binding.modelId,
      sourceType: 'external',
    }
  );

  bindChannelSession(kvStore, bindingKey, session.id, scopeKey);
  return {
    ...session,
    agentRoleKey: binding.agentRoleKey,
    modelId: binding.modelId,
  };
}
