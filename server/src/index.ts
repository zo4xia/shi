import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// {标记} P0-环境变量加载：优先加载项目根目录的.env 文件
// 编译后路径: server/dist/server/src/index.js → 向上逐级查找 .env
function findEnvFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
    const hasServerDir = fs.existsSync(path.join(dir, 'server'));
    if (hasPackageJson && hasServerDir) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return path.resolve(startDir);
}

const envPath = findEnvFile(__dirname);
if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`[Env] Loaded .env from: ${envPath}`);
} else {
  console.log(`[Env] No .env found (searched up from ${__dirname}), using process.env or database config`);
}
const bootstrapProjectRoot = envPath ? path.dirname(envPath) : findProjectRoot(__dirname);
if (!process.env.UCLAW_APP_ROOT?.trim()) process.env.UCLAW_APP_ROOT = bootstrapProjectRoot;
if (!process.env.LOBSTERAI_APP_ROOT?.trim()) process.env.LOBSTERAI_APP_ROOT = bootstrapProjectRoot;
if (!process.env.UCLAW_WORKSPACE?.trim()) process.env.UCLAW_WORKSPACE = bootstrapProjectRoot;
if (!process.env.LOBSTERAI_WORKSPACE?.trim()) process.env.LOBSTERAI_WORKSPACE = bootstrapProjectRoot;
import { initWebSocketServer, broadcastToAll, broadcastToRoom, flushPendingMessageUpdates } from '../websocket';
import { setupStoreRoutes } from '../routes/store';
import { setupSkillsRoutes } from '../routes/skills';
import { setupMcpRoutes } from '../routes/mcp';
import { setupDailyMemoryRoutes } from '../routes/dailyMemory';
import { setupCoworkRoutes } from '../routes/cowork';
import { setupScheduledTaskRoutes } from '../routes/scheduledTasks';
import { setupPermissionsRoutes } from '../routes/permissions';
import { setupAppRoutes } from '../routes/app';
import { setupApiConfigRoutes } from '../routes/apiConfig';
import { setupLogRoutes } from '../routes/log';
import { setupApiProxyRoutes } from '../routes/apiProxy';
import { setupDialogRoutes } from '../routes/dialog';
import { setupShellRoutes } from '../routes/shell';
import { setupFilesRoutes } from '../routes/files';
import { setupRoleRuntimeRoutes } from '../routes/roleRuntime';
import { setupFeishuWebhookRoutes } from '../routes/feishuWebhook';
import { setupDingTalkWebhookRoutes } from '../routes/dingtalkWebhook';
// {标记} P1-技能隔离：导入角色技能配置路由
import { setupSkillRoleConfigRoutes } from '../routes/skillRoleConfigs';
import { setupBackupRoutes } from '../routes/backup';
import { setupSkillsMcpHelperRoutes } from '../routes/skillsMcpHelper';

// Import existing main process modules
import { SqliteStore } from '../sqliteStore.web';
import { CoworkStore, type CoworkSession } from '../../src/main/coworkStore';
import { CoworkRunner } from '../../src/main/libs/coworkRunner';
import { SkillManager } from '../../src/main/skillManager';
import { McpStore } from '../../src/main/mcpStore';
import { ScheduledTaskStore, type ScheduledTask } from '../../src/main/scheduledTaskStore';
import { Scheduler } from '../../src/main/libs/scheduler';
import { initLogger, getLogFilePath } from '../../src/main/logger';
import { setStoreGetter } from '../../src/main/libs/claudeSettings';
import { getCoworkLogPath } from '../../src/main/libs/coworkLogger';
import { exportLogsZip } from '../../src/main/libs/logExport';
import { APP_NAME } from '../../src/main/appConstants';
import { CoworkSessionId } from '../../src/renderer/types/cowork';
import { resolveAgentRolesFromConfig, type AgentRoleKey as SharedAgentRoleKey } from '../../src/shared/agentRoleConfig';
import {
  ensureDirectory,
  getProjectRoot,
  setProjectRoot,
  resolveRuntimeRoot,
  resolveRuntimeUserDataPath,
} from '../../src/shared/runtimeDataPaths';
import { ENV_ALIAS_PAIRS, assignEnvAlias, readEnvAliasPair } from '../../src/shared/envAliases';
import { startCoworkOpenAICompatProxy, stopCoworkOpenAICompatProxy } from '../../src/main/libs/coworkOpenAICompatProxy';
import { FeishuGateway } from '../libs/feishuGateway';
import { getOrCreateWebSessionExecutor } from '../libs/httpSessionExecutor';
import {
  ensureRoleRuntimeDirs,
  getRoleSkillConfigPath,
  getRoleSkillSecretPath,
  syncRoleSkillIndexes,
} from '../libs/roleSkillFiles';
import { syncRoleCapabilitySnapshots, syncRoleSettingsViews } from '../libs/roleRuntimeViews';
import { runRoleRuntimeHealthCheck } from '../libs/roleRuntimeHealthCheck';
import { recoverSkillBindingsFromRuntimeTruth } from '../libs/skillBindingRecovery';

// Types for context passed to routes
export interface RequestContext {
  store: SqliteStore;
  coworkStore: CoworkStore;
  coworkRunner: CoworkRunner;
  skillManager: SkillManager;
  mcpStore: McpStore;
  scheduledTaskStore: ScheduledTaskStore;
  scheduler: Scheduler;
  getWss: () => import('ws').WebSocketServer;
  feishuGateway: FeishuGateway | null;
  feishuGateways: FeishuGateway[];
}

// Re-export types used by routes
export type { CoworkSessionId };

// Server options interface
export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  workspace?: string;
}

// Default configuration
const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '127.0.0.1';

const isPortAvailable = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, host);
  });

const findAvailablePort = async (host: string, preferredPort: number, maxAttempts = 20): Promise<number> => {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await isPortAvailable(host, candidate)) {
      return candidate;
    }
  }
  throw new Error(`No available port found from ${preferredPort} to ${preferredPort + maxAttempts - 1}`);
};

// User data directory (web version uses a different path than Electron)
const getUserDataPath = (customDataDir?: string): string => {
  const userDataPath = resolveRuntimeUserDataPath(customDataDir, getProjectRoot());
  ensureDirectory(userDataPath);
  return userDataPath;
};

// Global options
let serverOptions: Required<ServerOptions> = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  dataDir: '',
  workspace: bootstrapProjectRoot,
};

// Initialize logger
initLogger();

// Global state (similar to main.ts singleton pattern)
let store: SqliteStore | null = null;
let coworkStore: CoworkStore | null = null;
let coworkRunner: CoworkRunner | null = null;
let skillManager: SkillManager | null = null;
let mcpStore: McpStore | null = null;
let scheduledTaskStore: ScheduledTaskStore | null = null;
let scheduler: Scheduler | null = null;
let wss: import('ws').WebSocketServer | null = null;
let feishuGateway: FeishuGateway | null = null;
const feishuGateways: FeishuGateway[] = [];
let staleSessionSweepTimer: ReturnType<typeof setInterval> | null = null;
let unlistenStoreChanges: (() => void) | null = null;
let deferredStartupWarmupTimer: ReturnType<typeof setTimeout> | null = null;

const STALE_RUNNING_SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_RUNNING_SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
const DAILY_MEMORY_CRON_TASK_TITLE = '每日记忆抽取与文件归档';
const WEB_DIRECT_NATIVE_SKILL_IDS = new Set([
  'blingbling-little-eye',
  'ima-note',
]);
let dailyMemoryCatchupPromise: Promise<void> | null = null;

const normalizeScheduledTaskRoleKey = (value: string | null | undefined): SharedAgentRoleKey => {
  return value === 'writer' || value === 'designer' || value === 'analyst'
    ? value
    : 'organizer';
};

const resolveScheduledTaskIdentityRoleKey = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'organizer';
};

const resolveConfiguredRoleModelId = (
  store: SqliteStore,
  agentRoleKey: SharedAgentRoleKey
): string | undefined => {
  const appConfig = store.get('app_config') as Parameters<typeof resolveAgentRolesFromConfig>[0];
  const roles = resolveAgentRolesFromConfig(appConfig);
  const modelId = roles[agentRoleKey]?.modelId?.trim();
  return modelId || undefined;
};

const normalizeRequiredIdentityRoleKey = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

function hasRuntimeSkillPayload(filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return true;
    }

    return Object.keys(parsed as Record<string, unknown>).length > 0;
  } catch {
    return true;
  }
}

function getUnsupportedWebRuntimeSkillIds(
  userDataPath: string,
  roleKey: SharedAgentRoleKey,
  skillIds?: string[]
): string[] {
  const dedupedSkillIds = Array.from(new Set(
    (skillIds ?? [])
      .map((skillId) => String(skillId || '').trim())
      .filter(Boolean)
      .filter((skillId) => !WEB_DIRECT_NATIVE_SKILL_IDS.has(skillId))
  ));

  if (dedupedSkillIds.length === 0) {
    return [];
  }

  return dedupedSkillIds.filter((skillId) => (
    hasRuntimeSkillPayload(getRoleSkillConfigPath(userDataPath, roleKey, skillId))
    || hasRuntimeSkillPayload(getRoleSkillSecretPath(userDataPath, roleKey, skillId))
  ));
}

const initializeSkillManager = (manager: SkillManager): void => {
  try {
    // [FLOW] Web Server 启动时补齐 upstream 技能初始化，确保“已安装”列表能看到同步后的内置/已安装技能。
    manager.syncBundledSkillsToUserData();
  } catch (error) {
    console.error('[skills] Failed to sync bundled skills during web server init:', error);
  }

  try {
    // [FLOW] 保持技能目录监听在线，避免安装完成后列表刷新依赖偶发 API 调用。
    manager.startWatching();
  } catch (error) {
    console.error('[skills] Failed to start skill watcher during web server init:', error);
  }
};

const syncRoleSkillIndexesForRuntime = (): void => {
  try {
    const userDataPath = getUserDataPath(serverOptions.dataDir);
    ensureRoleRuntimeDirs(userDataPath);
    syncRoleSkillIndexes(userDataPath, getStore(), getSkillManager());
  } catch (error) {
    console.error('[roles] Failed to sync role skill indexes:', error);
  }
};

const syncRoleSettingsViewsForRuntime = (): void => {
  try {
    const userDataPath = getUserDataPath(serverOptions.dataDir);
    const appConfig = getStore().get('app_config');
    syncRoleSettingsViews(userDataPath, appConfig as any);
    syncRoleCapabilitySnapshots(userDataPath, getStore(), getSkillManager(), getMcpStore());
  } catch (error) {
    console.error('[roles] Failed to sync role settings views:', error);
  }
};

const repairSkillBindingsForRuntime = (): void => {
  try {
    const userDataPath = getUserDataPath(serverOptions.dataDir);
    const result = recoverSkillBindingsFromRuntimeTruth(
      userDataPath,
      getProjectRoot(),
      getStore(),
      getSkillManager(),
    );

    if (!result.recovered) {
      return;
    }

    console.warn(
      `[roles] P0-SKILL-BINDING-RECOVERY recovered ${result.bindingsWritten} binding(s) from ${result.sourceRoot}`
    );
    if (result.deletedArtifacts.length > 0) {
      console.warn(
        `[roles] P0-SKILL-BINDING-RECOVERY pruned ${result.deletedArtifacts.length} stale role skill artifact(s)`
      );
    }
    if (result.restoredArtifacts.length > 0) {
      console.warn(
        `[roles] P0-SKILL-BINDING-RECOVERY restored ${result.restoredArtifacts.length} role skill artifact(s)`
      );
    }
  } catch (error) {
    console.error('[roles] Failed to recover skill bindings from runtime truth:', error);
  }
};

const ensureRuntimeViewSyncSubscriptions = (): void => {
  if (unlistenStoreChanges) {
    return;
  }

  unlistenStoreChanges = getStore().onDidChange(({ key }) => {
    if (key !== 'app_config') {
      return;
    }
    syncRoleSettingsViewsForRuntime();
  });
};

const scheduleDeferredStartupWarmup = (): void => {
  if (deferredStartupWarmupTimer) {
    return;
  }

  // 非核心的 Skills / 角色运行态修复放到 listen 之后静默执行，减少弱设备启动阻塞。
  deferredStartupWarmupTimer = setTimeout(() => {
    deferredStartupWarmupTimer = null;
    repairSkillBindingsForRuntime();
    syncRoleSkillIndexesForRuntime();
    syncRoleSettingsViewsForRuntime();
    logRoleRuntimeHealthCheck();
    ensureRuntimeViewSyncSubscriptions();
  }, 0);
};

const logRoleRuntimeHealthCheck = (): void => {
  try {
    const userDataPath = getUserDataPath(serverOptions.dataDir);
    const healthCheck = runRoleRuntimeHealthCheck(userDataPath);
    if (healthCheck.status === 'ok') {
      console.log(
        `[roles] P0-RUNTIME-FILE-SELF-CHECK ok (${healthCheck.filenameSummaries.length} file families / ${healthCheck.runtimeRoot})`
      );
      return;
    }

    console.warn(
      `[roles] P0-RUNTIME-FILE-SELF-CHECK warning (${healthCheck.warnings.length} issue(s) / ${healthCheck.runtimeRoot})`
    );
    for (const warning of healthCheck.warnings) {
      console.warn(`[roles] P0-RUNTIME-FILE-SELF-CHECK ${warning}`);
    }
  } catch (error) {
    console.error('[roles] Failed to run runtime file self-check:', error);
  }
};

const initStore = async (): Promise<SqliteStore> => {
  if (!store) {
    // {路标} FLOW-REQUEST-CONTEXT-STORE
    // {FLOW} STORE-SINGLETON-BOOT: 整个 Web 服务端的 SQLite 单例从这里创建，后续 routes/context 共用同一份 db 句柄。
    store = await SqliteStore.create(getUserDataPath(serverOptions.dataDir));
    // 注入 store getter 供 claudeSettings.resolveCurrentApiConfig 使用
    setStoreGetter(() => store as any);
  }
  return store;
};

const getCoworkStore = (): CoworkStore => {
  if (!coworkStore) {
    const sqliteStore = getStore();
    coworkStore = new CoworkStore(sqliteStore.getDatabase(), sqliteStore.getSaveFunction());
    const resetRunningSessions = coworkStore.resetRunningSessions();
    if (resetRunningSessions > 0) {
      console.warn(`[cowork] Reset ${resetRunningSessions} stale running sessions on startup`);
    }
    const cleaned = coworkStore.autoDeleteNonPersonalMemories();
    if (cleaned > 0) {
      console.info(`[cowork-memory] Auto-deleted ${cleaned} non-personal/procedural memories`);
    }
  }
  return coworkStore;
};

const getCoworkRunner = (): CoworkRunner => {
  if (!coworkRunner) {
    // {BREAKPOINT} LEGACY-RUNNER-SINGLETON
    // {FLOW} PHASE1-LEGACY-SHELL: 该单例仍可被遗留入口按需构造，但已不是 Web / Feishu / scheduler / daily-memory 的现役主执行器。
    // {标记} 旧污染活口: server/src/index.ts 仍在服务端主入口构造 CoworkRunner 单例。
    // {标记} 待评估-可能波及: server/src/index.ts / server/routes/cowork.ts / src/main/libs/scheduler.ts / IM webhook。
    // {标记} 重构边界-待确认: 若完全切除该单例，需同步重做权限响应、停止会话、渠道快路与定时任务执行器。
    // [SDK-CUT:RUNNER-SINGLETON] Server runtime still constructs CoworkRunner as the central executor singleton.
    coworkRunner = new CoworkRunner(getCoworkStore());
    coworkRunner.setContinuityStateStore(getStore() as any);

    coworkRunner.setSkillPromptProvider((skillIds: string[]) => {
      return getSkillManager().buildSelectedSkillsPrompt(skillIds);
    });

    // Provide MCP server configuration to the runner
    coworkRunner.setMcpServerProvider((agentRoleKey?: string) => {
      return getMcpStore().getRuntimeEnabledServers(agentRoleKey);
    });
  }
  return coworkRunner;
};

const ensureStaleRunningSessionSweep = (): void => {
  if (staleSessionSweepTimer) {
    return;
  }

  // {标记} P0-SESSION-STATE-FIX: 失联中的运行态会话 5 分钟后自动关状态，避免前端永远显示“运行中”
  staleSessionSweepTimer = setInterval(() => {
    try {
      const store = getCoworkStore();
      const webSessionExecutor = getOrCreateWebSessionExecutor({
        store,
        configStore: getStore(),
        buildSelectedSkillsPrompt: (skillIds?: string[]) => (
          skillIds?.length ? getSkillManager().buildSelectedSkillsPrompt(skillIds) : null
        ),
      });
      const now = Date.now();
      // {标记} P1-STALE-SWEEP-PHASE1: 一期失联清理只覆盖 Web/Feishu 轻链会话，不再依赖 CoworkRunner 活跃表。
      const staleSessions = store.listSessions().filter((session) => (
        session.status === 'running'
        && isPrimaryPhaseSession(session)
        && now - session.updatedAt >= STALE_RUNNING_SESSION_TIMEOUT_MS
        && !webSessionExecutor.isSessionActive(session.id)
      ));

      if (staleSessions.length === 0) {
        return;
      }

      for (const session of staleSessions) {
        store.updateSession(session.id, { status: 'error' });
        flushPendingMessageUpdates(session.id);
        broadcastToRoom('cowork', session.id, {
          type: 'cowork:stream:error',
          data: {
            sessionId: session.id,
            error: '会话已失联超过 5 分钟，状态已自动关闭。',
          },
        });
        broadcastToAll({
          type: 'cowork:sessions:changed',
          data: { sessionId: session.id, reason: 'stale-auto-close' },
        });
      }

      console.warn(`[cowork] Auto-closed ${staleSessions.length} stale running sessions`);
    } catch (error) {
      console.warn('[cowork] Failed to sweep stale running sessions:', error);
    }
  }, STALE_RUNNING_SESSION_SWEEP_INTERVAL_MS);
};

const getSkillManager = (): SkillManager => {
  if (!skillManager) {
    // Type assertion: web SqliteStore is compatible with main process version for SkillManager's usage
    skillManager = new SkillManager(getStore as any);
    initializeSkillManager(skillManager);
  }
  return skillManager;
};

const getMcpStore = (): McpStore => {
  if (!mcpStore) {
    const sqliteStore = getStore();
    mcpStore = new McpStore(sqliteStore.getDatabase(), sqliteStore.getSaveFunction());
  }
  return mcpStore;
};

const getScheduledTaskStore = (): ScheduledTaskStore => {
  if (!scheduledTaskStore) {
    const sqliteStore = getStore();
    scheduledTaskStore = new ScheduledTaskStore(sqliteStore.getDatabase(), sqliteStore.getSaveFunction());
  }
  return scheduledTaskStore;
};

const runDailyMemoryExtractionNow = async (): Promise<void> => {
  const {
    getDailyMemoryTargetSlotDay,
    runAndMarkDailyMemoryPipeline,
  } = await import('../libs/dailyMemoryPipeline');
  const result = await runAndMarkDailyMemoryPipeline({
    store: getStore(),
    coworkStore: getCoworkStore(),
    slotDay: getDailyMemoryTargetSlotDay(new Date()),
  });
  if (result.backup.status === 'failed') {
    console.warn(`[DailyMemory] Conversation backup failed: ${result.backup.error || result.backup.reason || 'unknown-error'}`);
  } else if (result.backup.status === 'completed') {
    console.log(`[DailyMemory] Conversation backup written: ${result.backup.backupDir}`);
  }
};

const runScheduledTaskThroughWebExecutor = async (
  task: ScheduledTask
): Promise<{ handled: boolean; sessionId?: string | null }> => {
  if (task.name === DAILY_MEMORY_CRON_TASK_TITLE) {
    await runDailyMemoryExtractionNow();
    return { handled: true, sessionId: null };
  }

  const identityRoleKey = resolveScheduledTaskIdentityRoleKey(task.agentRoleKey);
  const runtimeRoleKey = normalizeScheduledTaskRoleKey(identityRoleKey);
  const selectedSkillIds = Array.isArray(task.skillIds) ? task.skillIds.filter(Boolean) : [];
  const runtimeUserDataPath = getUserDataPath(serverOptions.dataDir);
  const unsupportedRuntimeSkillIds = getUnsupportedWebRuntimeSkillIds(
    runtimeUserDataPath,
    runtimeRoleKey,
    selectedSkillIds
  );
  if (unsupportedRuntimeSkillIds.length > 0) {
    throw new Error(
      `当前定时任务轻链已禁止回退旧 CoworkRunner；以下技能仍依赖未桥接的 runtime config/secret：${unsupportedRuntimeSkillIds.join(', ')}`
    );
  }

  const coworkStore = getCoworkStore();
  const store = getStore();
  const config = coworkStore.getConfig();
  const cwd = path.resolve(task.workingDirectory || config.workingDirectory || getProjectRoot());
  const baseSystemPrompt = task.systemPrompt || config.systemPrompt;
  const systemPrompt = baseSystemPrompt?.trim() ? baseSystemPrompt : undefined;
  const modelId = task.modelId || resolveConfiguredRoleModelId(store, runtimeRoleKey) || '';

  const session = coworkStore.createSession(
    `[定时] ${task.name}`,
    cwd,
    systemPrompt ?? '',
    'local',
    selectedSkillIds,
    {
      // {标记} P0-IDENTITY-BOUNDARY: 定时任务会话保留原始身份键；4主角色归一化仅用于运行时模型/技能配置解析。
      agentRoleKey: identityRoleKey,
      modelId,
      sourceType: 'desktop',
    }
  );

  coworkStore.addMessage(session.id, {
    type: 'user',
    content: task.prompt,
    metadata: selectedSkillIds.length > 0 ? { skillIds: selectedSkillIds } : undefined,
  });

  const webSessionExecutor = getOrCreateWebSessionExecutor({
    store: coworkStore,
    configStore: store,
    buildSelectedSkillsPrompt: (skillIds: string[]) => getSkillManager().buildSelectedSkillsPrompt(skillIds),
  });

  await webSessionExecutor.startSession(session.id, task.prompt, {
    skipInitialUserMessage: true,
    skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
    systemPrompt,
    workspaceRoot: cwd,
    confirmationMode: 'text',
  });

  return {
    handled: true,
    sessionId: session.id,
  };
};

const isPrimaryPhaseSession = (
  session: Pick<Partial<CoworkSession>, 'sourceType' | 'systemPrompt' | 'title'>
): boolean => {
  if (session.sourceType === 'desktop') {
    return true;
  }

  const scope = session.systemPrompt?.trim() ?? '';
  if (
    scope.startsWith('im:feishu:chat:')
    || scope.startsWith('im:feishu:ws:')
    || scope.startsWith('im:feishu:app:')
  ) {
    return true;
  }

  const title = session.title?.trim() ?? '';
  return title.endsWith(' - 飞书对话');
};

const ensureDailyMemoryCatchupOnStartup = (): void => {
  if (dailyMemoryCatchupPromise) {
    return;
  }
  dailyMemoryCatchupPromise = (async () => {
    try {
      const {
        shouldRunDailyMemoryCatchup,
        runAndMarkDailyMemoryPipeline,
      } = await import('../libs/dailyMemoryPipeline');
      const status = shouldRunDailyMemoryCatchup(getStore(), new Date());
      if (!status.shouldRun) {
        console.log(`[DailyMemory] Startup catch-up not needed (last=${status.lastCompletedSlotDay || 'none'}, target=${status.targetSlotDay})`);
        return;
      }
      console.log(`[DailyMemory] Startup catch-up for slot ${status.targetSlotDay}`);
      const result = await runAndMarkDailyMemoryPipeline({
        store: getStore(),
        coworkStore: getCoworkStore(),
        slotDay: status.targetSlotDay,
      });
      if (result.backup.status === 'completed') {
        console.log(`[DailyMemory] Startup catch-up backup written: ${result.backup.backupDir}`);
      }
      if (result.extraction.errors.length > 0) {
        console.warn(`[DailyMemory] Startup catch-up finished with ${result.extraction.errors.length} extraction error(s)`);
      }
    } catch (error) {
      console.error('[DailyMemory] Startup catch-up failed:', error);
    } finally {
      dailyMemoryCatchupPromise = null;
    }
  })();
};

const getScheduler = (): Scheduler => {
  if (!scheduler) {
    scheduler = new Scheduler({
      scheduledTaskStore: getScheduledTaskStore(),
      coworkStore: getCoworkStore(),
      getSkillsPrompt: async (skillIds?: string[]) => {
        // {标记} P0-SCHEDULER-SKILL-SLIM: 定时任务未显式选技能时，不再默认注入 auto-routing prompt。
        return skillIds?.length
          ? getSkillManager().buildSelectedSkillsPrompt(skillIds)
          : null;
      },
      // {标记} P0-SCHEDULER-WEB-EXEC: 定时任务当前优先桥接到 HttpSessionExecutor，避免普通任务再走 CoworkRunner 主链。
      runTaskDirectly: runScheduledTaskThroughWebExecutor,
      stopSessionDirectly: (sessionId) => getOrCreateWebSessionExecutor({
        store: getCoworkStore(),
        configStore: getStore(),
        buildSelectedSkillsPrompt: (skillIds: string[]) => getSkillManager().buildSelectedSkillsPrompt(skillIds),
      }).stopSession(sessionId as CoworkSessionId),
    });

    // Note: Scheduler does not emit events in web version
    // Status updates are polled via API instead

    // [FLOW] Web 模式也必须主动启动调度循环，否则任务只会存在数据库中而不会按时执行。
    scheduler.start();
  }
  return scheduler;
};

const getStore = (): SqliteStore => {
  if (!store) {
    throw new Error('Store not initialized. Call initStore() first.');
  }
  return store;
};

// {标记} 预装内置 MCP servers — 首次启动自动注入
// Resolve local @playwright/mcp entry point so we don't need npx at runtime
const resolvePlaywrightMcpEntry = (): string => {
  try {
    // require.resolve not available in ESM; use import.meta.resolve or manual path
    const candidate = path.join(getProjectRoot(), 'node_modules', '@playwright', 'mcp', 'cli.js');
    if (fs.existsSync(candidate)) return candidate;
    // Fallback: try from __dirname (compiled dist)
    const candidate2 = path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', '@playwright', 'mcp', 'cli.js');
    if (fs.existsSync(candidate2)) return candidate2;
  } catch { /* ignore */ }
  return '';
};

const BUILTIN_MCP_SERVERS = [
  {
    name: 'Playwright Browser',
    description: 'Browser automation via Playwright (built-in Chromium, organizer专用)',
    transportType: 'stdio' as const,
    command: 'node',
    args: [resolvePlaywrightMcpEntry()],
    env: {
      PLAYWRIGHT_BROWSERS_PATH: path.join(getProjectRoot(), '.playwright-browsers'),
    },
    isBuiltIn: true,
    registryId: 'playwright',
    agentRoleKey: 'organizer',
  },
  {
    name: 'Memory',
    description: 'Knowledge graph memory — AI auto-manages long-term memory across sessions',
    transportType: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    isBuiltIn: true,
    registryId: 'memory',
    agentRoleKey: 'all',
  },
];

const ensureBuiltinMcpServers = (): void => {
  try {
    const mcp = getMcpStore();
    const existing = mcp.listServers();
    for (const def of BUILTIN_MCP_SERVERS) {
      const match = existing.find(
        s => s.registryId === def.registryId || s.name === def.name
      );
      if (match) {
        // Update existing entry to latest config (e.g. npx→node, agentRoleKey change)
        try {
          mcp.updateServer(match.id, {
            command: def.command,
            args: def.args,
            env: def.env,
            agentRoleKey: def.agentRoleKey,
            description: def.description,
          } as any);
          console.log(`[MCP] Updated built-in "${def.name}" (id=${match.id})`);
        } catch (updateErr) {
          console.warn(`[MCP] Failed to update built-in "${def.name}":`, updateErr);
        }
        continue;
      }
      const created = mcp.createServer(def);
      console.log(`[MCP] Pre-installed built-in "${def.name}" (id=${created.id})`);
    }

    const disabledLegacyMemory = mcp.disableLegacyMemoryCompatServers();
    if (disabledLegacyMemory > 0) {
      console.log(`[MCP] Disabled ${disabledLegacyMemory} legacy Memory compatibility record(s) from runtime injection`);
    }
  } catch (error) {
    console.error('[MCP] Failed to ensure built-in MCP servers:', error);
  }
};

// {标记} 23点自动记忆抽取 — 每天23:00触发，提炼当日对话写入长期记忆
const ensureDailyMemoryExtractionCron = (): void => {
  try {
    const taskStore = getScheduledTaskStore();

    // 检查是否已存在
    const existing = taskStore.listTasks();
    const hasExisting = existing.some((t: any) => t.name === DAILY_MEMORY_CRON_TASK_TITLE);
    if (hasExisting) {
      console.log('[DailyMemory] Cron task already registered');
      return;
    }

    // 注册定时任务：每天23:00执行
    taskStore.createTask({
      name: DAILY_MEMORY_CRON_TASK_TITLE,
      description: '每天23:00自动归档会话快照，并提炼当日对话写入长期记忆',
      schedule: { type: 'cron', expression: '0 23 * * *' } as any,
      enabled: true,
      agentRoleKey: 'organizer',
      modelId: '',
      prompt: '执行每日记忆抽取',
      workingDirectory: getProjectRoot(),
      systemPrompt: '',
      executionMode: 'local',
      expiresAt: null,
      skillIds: [],
      notifyPlatforms: [],
    } as any);
    scheduler?.reschedule();
    console.log('[DailyMemory] Registered daily extraction cron at 23:00');
  } catch (error) {
    console.error('[DailyMemory] Failed to register cron:', error);
  }
};

// Feishu WSClient gateway auto-start
// {埋点} ⚡ 飞书Gateway初始化 (ID: feishu-gw-001) 遍历apps[] → new FeishuGateway → gw.start()
// {标记} 支持多个飞书应用，每个bot绑定一个角色身份
const initFeishuGateway = async (): Promise<void> => {
  try {
    const s = getStore();
    const kvData = s.get('im_config');
    const imConfig = (kvData && typeof kvData === 'object') ? kvData as Record<string, any> : {} as Record<string, any>;
    const feishuConfig = imConfig.feishu;

    // 检查数据库中的启用状态
    if (feishuConfig?.enabled === false) {
      console.log('[Feishu WS] Disabled in config, skipping');
      return;
    }

    // {标记} 收集所有要启动的应用：.env + 数据库apps[]
    const appsToStart: Array<{ appId: string; appSecret: string; agentRoleKey: string }> = [];

    // 1. .env 环境变量（向后兼容，作为第一个应用）
    const envAppId = readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAppId);
    const envAppSecret = readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAppSecret);
    const envAgentRoleKey = normalizeRequiredIdentityRoleKey(readEnvAliasPair(ENV_ALIAS_PAIRS.feishuAgentRoleKey));
    if (envAppId && envAppSecret) {
      if (!envAgentRoleKey) {
        console.warn('[Feishu WS] Skip env bootstrap app: missing FEISHU_AGENT_ROLE_KEY / agentRoleKey binding');
      } else {
        appsToStart.push({ appId: envAppId, appSecret: envAppSecret, agentRoleKey: envAgentRoleKey });
      }
    }

    // 2. 数据库 apps[] 配置（跳过已被.env覆盖的）
    const dbApps = Array.isArray(feishuConfig?.apps) ? feishuConfig.apps : [];
    for (const dbApp of dbApps) {
      if (!dbApp?.appId || !dbApp?.appSecret || !dbApp?.enabled) continue;
      // 跳过和.env重复的
      if (envAppId && dbApp.appId === envAppId) continue;
      const identityRoleKey = normalizeRequiredIdentityRoleKey(dbApp.agentRoleKey);
      if (!identityRoleKey) {
        console.warn(`[Feishu WS] Skip app ${dbApp.appId}: missing agentRoleKey binding`);
        continue;
      }
      appsToStart.push({
        appId: dbApp.appId,
        appSecret: dbApp.appSecret,
        agentRoleKey: identityRoleKey,
      });
    }

    if (appsToStart.length === 0) {
      console.log('[Feishu WS] No credentials configured, skipping auto-start');
      return;
    }

    // {标记} 逐个启动每个应用的长连接
    const domain = feishuConfig?.domain || 'feishu';
    const debug = feishuConfig?.debug ?? true;

    for (const app of appsToStart) {
      try {
        const gw = new FeishuGateway();
        gw.setDependencies({
          coworkStore: getCoworkStore(),
          store: getStore(),
          skillManager: getSkillManager(),
        });
        await gw.start({ appId: app.appId, appSecret: app.appSecret, agentRoleKey: app.agentRoleKey, domain, debug });
        feishuGateways.push(gw);
        console.log(`[Feishu WS] Gateway started: ${app.appId} → ${app.agentRoleKey}`);
      } catch (err: any) {
        console.error(`[Feishu WS] Failed to start ${app.appId} (${app.agentRoleKey}):`, err.message);
      }
    }

    // {标记} 向后兼容：feishuGateway 指向第一个成功启动的
    feishuGateway = feishuGateways.length > 0 ? feishuGateways[0] : null;

    console.log(`[Feishu WS] Total gateways started: ${feishuGateways.length}`);
  } catch (error: any) {
    console.error('[Feishu WS] Auto-start failed:', error.message);
  }
};

const getFeishuGateway = (): FeishuGateway | null => feishuGateway;

// User data path (export for compatibility with older imports).
// Do not resolve it at module load time, otherwise cwd drift can freeze the wrong runtime root.
export let userDataPath = '';

// Create Express app
const app: ReturnType<typeof express> = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '50mb', type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[API] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Create request context middleware
const requestContextMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await initStore();
    const context: RequestContext = {
      store: getStore(),
      get coworkStore() {
        return getCoworkStore();
      },
      // {标记} P1-RUNNER-LAZY-CONTEXT: /api request context 不再无脑预热 CoworkRunner，只有命中旧链/遗留入口时才惰性构造。
      get coworkRunner() {
        return getCoworkRunner();
      },
      // {标记} P1-CONTEXT-LAZY-SERVICES: skill/mcp/scheduler 统一改成按需 getter，轻接口不再默认拉起 watcher/调度实例。
      get skillManager() {
        return getSkillManager();
      },
      get mcpStore() {
        return getMcpStore();
      },
      get scheduledTaskStore() {
        return getScheduledTaskStore();
      },
      get scheduler() {
        return getScheduler();
      },
      getWss: () => wss!,
      feishuGateway: getFeishuGateway(),
      feishuGateways,
    };
    req.context = context;
    next();
  } catch (error) {
    console.error('[Middleware] Failed to initialize context:', error);
    res.status(500).json({ success: false, error: 'Failed to initialize request context' });
  }
};

// Apply context middleware to all API routes
// {路标} FLOW-API-CONTEXT-HYDRATE
// {FLOW} API-CONTEXT-FIRST: 所有 /api/* 请求先注入 store/cowork/skills/mcp/scheduler，再进入具体 route。
app.use('/api', requestContextMiddleware);

// Setup API routes
// {路标} FLOW-API-MOUNT-ORDER
// {FLOW} API-MOUNT-TRUNK: 当前主链装配顺序以这里为准；核查“接口是否存在”先看这里再看 routes 文件。
setupStoreRoutes(app);
setupSkillsRoutes(app);
setupMcpRoutes(app);
setupDailyMemoryRoutes(app);
setupCoworkRoutes(app);
setupScheduledTaskRoutes(app);
setupPermissionsRoutes(app);
setupAppRoutes(app);
setupApiConfigRoutes(app);
setupLogRoutes(app);
setupApiProxyRoutes(app);
setupDialogRoutes(app);
setupShellRoutes(app);
setupFilesRoutes(app);
setupRoleRuntimeRoutes(app);
setupFeishuWebhookRoutes(app);
setupDingTalkWebhookRoutes(app);
// {标记} P1-技能隔离：注册角色技能配置路由
setupSkillRoleConfigRoutes(app);
setupBackupRoutes(app);
// {标记} P0-SKILLS-MCP-HELPER: 注册独立外挂式 Skills / MCP 小助手路由
setupSkillsMcpHelperRoutes(app);

// Store workspace path in app for files routes to access
app.set('workspace', serverOptions.workspace);

// Serve static files from web build (server/public)
// Dev模式下不提供前端页面，统一走 vite:5176
const isDev = process.env.NODE_ENV !== 'production';

if (!isDev) {
  // In compiled mode: __dirname = server/dist/server/src → public is at ../../../public
  const publicPath = path.resolve(__dirname, '..', '..', '..', 'public');
  const publicPathAlt = path.resolve(__dirname, '..', 'public');
  const publicPathAlt2 = path.resolve(__dirname, '..', '..', 'public');
  const staticRoot = fs.existsSync(path.join(publicPath, 'index.html'))
    ? publicPath
    : fs.existsSync(path.join(publicPathAlt, 'index.html'))
      ? publicPathAlt
      : fs.existsSync(path.join(publicPathAlt2, 'index.html'))
        ? publicPathAlt2
        : null;

  if (staticRoot) {
    app.use(express.static(staticRoot));

    // SPA fallback — only for non-API routes
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/health')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(path.join(staticRoot, 'index.html'));
    });
  }
} else {
  // Dev模式：3001只提供API，访问根路径提示去5176
  app.get('/', (req: Request, res: Response) => {
    res.send('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1A1611;color:#9A9085"><div style="text-align:center"><h2>UCLAW API Server</h2><p>前端开发请访问 <a href="http://localhost:5176" style="color:#A78BFA">http://localhost:5176</a></p></div></div></body></html>');
  });
}

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Create HTTP server
const server = http.createServer(app);

// Start server
const startServer = async (options: ServerOptions = {}): Promise<http.Server> => {
  // Merge options with defaults
  // {BUG-FIX} R2: 修复端口 NaN 问题 - 使用 || 替代 ?? (因为 parseInt('')=NaN, NaN??DEFAULT_PORT=NaN)
  const requestedPort = options.port || parseInt(process.env.PORT || '') || DEFAULT_PORT;
  const resolvedWorkspace = path.resolve(options.workspace || serverOptions.workspace || getProjectRoot());

  // {标记} PROJECT-ROOT-TRUTH
  // 运行态项目根以当前服务启动时的 workspace 为准，避免 cwd 漂移导致 .env / .uclaw / 资源路径写错位置。
  setProjectRoot(resolvedWorkspace);
  assignEnvAlias(process.env, ENV_ALIAS_PAIRS.workspace, resolvedWorkspace);
  (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath = resolvedWorkspace;
  serverOptions = {
    port: requestedPort,
    host: options.host || DEFAULT_HOST,
    dataDir: options.dataDir || '',
    workspace: resolvedWorkspace,
  };

  // Update workspace in app settings
  app.set('workspace', serverOptions.workspace);
  userDataPath = getUserDataPath(serverOptions.dataDir);
  app.set('userDataPath', userDataPath);

  try {
    const resolvedPort = await findAvailablePort(serverOptions.host, serverOptions.port);
    if (resolvedPort !== requestedPort) {
      console.warn(`[Server] Port ${requestedPort} is occupied, switched to ${resolvedPort}`);
    }
    serverOptions.port = resolvedPort;

    // Initialize store before starting
    await initStore();

    // Start OpenAI-compatible proxy early so runtime config can resolve
    await startCoworkOpenAICompatProxy();

    // Initialize WebSocket server
    wss = initWebSocketServer(server);

    // [FLOW] 服务启动时预热调度器，避免必须先访问一次 API 才开始跑 cron。
    getScheduler();

    // Pre-install built-in MCP servers (e.g. Playwright Browser, Memory)
    ensureBuiltinMcpServers();

    // {标记} P0架构修复: 合并历史 identity_thread_24h 数据（去掉 modelId 隔离）
    try {
      const { migrateThreadsDropModelId } = await import('../libs/identityThreadHelper.js');
      const db = store.getDatabase();
      migrateThreadsDropModelId(db);
      store.getSaveFunction()();
    } catch (e: any) {
      console.error('[IdentityThread] Migration error:', e.message);
    }

    // {标记} 23点自动记忆抽取 cron
    ensureDailyMemoryExtractionCron();
    ensureDailyMemoryCatchupOnStartup();
    ensureStaleRunningSessionSweep();

    // Auto-start Feishu WSClient gateway (non-blocking)
    initFeishuGateway().catch(err => console.error('[Feishu WS] Init error:', err));

    return new Promise((resolve) => {
      server.listen(serverOptions.port, serverOptions.host, () => {
        console.log(`[Server] ${APP_NAME} Web Server running on http://${serverOptions.host}:${serverOptions.port}`);
        console.log(`[Server] WebSocket server initialized`);
        console.log(`[Server] User data path: ${getUserDataPath(serverOptions.dataDir)}`);
        console.log(`[Server] Runtime root: ${resolveRuntimeRoot(getProjectRoot())}`);
        console.log(`[Server] Workspace: ${serverOptions.workspace}`);
        console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
        scheduleDeferredStartupWarmup();
        resolve(server);
      });
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  if (deferredStartupWarmupTimer) {
    clearTimeout(deferredStartupWarmupTimer);
    deferredStartupWarmupTimer = null;
  }
  if (staleSessionSweepTimer) {
    clearInterval(staleSessionSweepTimer);
    staleSessionSweepTimer = null;
  }
  if (unlistenStoreChanges) {
    unlistenStoreChanges();
    unlistenStoreChanges = null;
  }
  if (store) {
    store.flush();
  }
  server.close(() => {
    void stopCoworkOpenAICompatProxy().finally(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  if (staleSessionSweepTimer) {
    clearInterval(staleSessionSweepTimer);
    staleSessionSweepTimer = null;
  }
  if (unlistenStoreChanges) {
    unlistenStoreChanges();
    unlistenStoreChanges = null;
  }
  if (store) {
    store.flush();
  }
  server.close(() => {
    void stopCoworkOpenAICompatProxy().finally(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
  });
});

// Export for testing
export { app, startServer, getStore, getCoworkStore, getCoworkRunner, broadcastToAll, broadcastToRoom, getFeishuGateway };

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

// Start server if this file is run directly
// {标记} P0修复: Windows下 import.meta.url 是 file:///C:/... 而 process.argv[1] 可能是相对路径
// 用 fileURLToPath 统一转换后比较，兼容 Windows/Linux/相对路径/绝对路径
const isMainModule = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entryFile = path.resolve(process.argv[1]);
    return path.normalize(thisFile) === path.normalize(entryFile);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  startServer();
}
