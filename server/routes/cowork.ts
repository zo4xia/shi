import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { RequestContext, CoworkSessionId } from '../src/index';
import { generateSessionTitle } from '../../src/main/libs/coworkUtil';
import { resolveAgentRolesFromConfig, type AgentRoleKey as SharedAgentRoleKey } from '../../src/shared/agentRoleConfig';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import { getOrCreateWebSessionExecutor } from '../libs/httpSessionExecutor';
import { clearIdentityThreadForRole, listIdentityThreadBoardSnapshots } from '../libs/identityThreadHelper';
import {
  getRoleSkillConfigPath,
  getRoleSkillSecretPath,
} from '../libs/roleSkillFiles';
import { createWebInboundRequest } from '../../clean-room/spine/modules/inbound';
import { createRequestTrace } from '../../clean-room/spine/modules/requestTrace';
import { orchestrateWebTurn } from '../../clean-room/spine/modules/sessionOrchestrator';
// {标记} P0-记忆连续性-FIX: route 层不再直接 appendToIdentityThread，由当前命中的执行器收口 shared-thread finalizer。

// Constants
const MIN_MEMORY_USER_MEMORIES_MAX_ITEMS = 1;
const MAX_MEMORY_USER_MEMORIES_MAX_ITEMS = 60;

// Utility to resolve task working directory
const resolveTaskWorkingDirectory = (workspaceRoot: string): string => {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  fs.mkdirSync(resolvedWorkspaceRoot, { recursive: true });
  if (!fs.statSync(resolvedWorkspaceRoot).isDirectory()) {
    throw new Error(`Selected workspace is not a directory: ${resolvedWorkspaceRoot}`);
  }
  return resolvedWorkspaceRoot;
};

const resolveExistingTaskWorkingDirectory = (workspaceRoot: string): string => {
  const trimmed = workspaceRoot.trim();
  if (!trimmed) {
    throw new Error('请先选择一个工作目录');
  }
  const resolvedWorkspaceRoot = path.resolve(trimmed);
  if (!fs.existsSync(resolvedWorkspaceRoot) || !fs.statSync(resolvedWorkspaceRoot).isDirectory()) {
    throw new Error(`工作目录不存在: ${resolvedWorkspaceRoot}`);
  }
  return resolvedWorkspaceRoot;
};

const resolveConfiguredRoleModelId = (
  store: RequestContext['store'],
  agentRoleKey: string
): string | undefined => {
  const appConfig = store.get('app_config') as Parameters<typeof resolveAgentRolesFromConfig>[0];
  const roles = resolveAgentRolesFromConfig(appConfig);
  const runtimeRoleKey = resolveRuntimeWebRoleKey(agentRoleKey);
  const modelId = roles[runtimeRoleKey]?.modelId?.trim();
  return modelId || undefined;
};

function resolveIdentityRoleKey(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || 'organizer';
}

function resolveRuntimeWebRoleKey(value: string | null | undefined): SharedAgentRoleKey {
  if (value === 'writer' || value === 'designer' || value === 'analyst') {
    return value;
  }
  return 'organizer';
}

const WEB_DIRECT_NATIVE_SKILL_IDS = new Set([
  'blingbling-little-eye',
  'ima-note',
]);

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
    // 非空但解析失败，也说明这个 skill 期待运行时文件，不应继续走纯 prompt 轻链路。
    return true;
  }
}

function getUnsupportedWebRuntimeSkillIds(
  userDataPath: string,
  roleKey: string,
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

  const runtimeRoleKey = resolveRuntimeWebRoleKey(roleKey);

  return dedupedSkillIds.filter((skillId) => (
    hasRuntimeSkillPayload(getRoleSkillConfigPath(userDataPath, runtimeRoleKey, skillId))
    || hasRuntimeSkillPayload(getRoleSkillSecretPath(userDataPath, runtimeRoleKey, skillId))
  ));
}

export function setupCoworkRoutes(app: Router) {
  const router = Router();

  // 【1.0链路】WEB-EXECUTOR: 当前稳定主链统一走 HttpSessionExecutor，不再按 skill payload 静默回退旧 CoworkRunner。
  // {标记} 待评估-可能波及: server/routes/cowork.ts 当前同时承载轻链主路与旧链回退口，属于重构边界文件。
  const createPreferredSessionExecutor = (context: RequestContext) => getOrCreateWebSessionExecutor({
    store: context.coworkStore,
    configStore: context.store,
    buildSelectedSkillsPrompt: (skillIds: string[]) => context.skillManager.buildSelectedSkillsPrompt(skillIds),
  });

  // ==================== Session Management ====================

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // POST /api/cowork/sessions - Start a new cowork session
  // 【1.0链路】WEB-START: Web UI 新建会话 -> orchestrateWebTurn -> 执行器 -> 本地 session/message 持久化。
  router.post('/sessions', async (req: Request, res: Response) => {
    try {
      const { coworkStore, store, skillManager } = req.context as RequestContext;
      const {
        prompt,
        cwd,
        systemPrompt,
        title,
        activeSkillIds,
        imageAttachments,
        zenMode,
      } = req.body;

      const config = coworkStore.getConfig();
      const resolvedSystemPrompt = systemPrompt ?? config.systemPrompt;
      const appWorkspace = String(req.app.get('workspace') || getProjectRoot()).trim();
      // 没选工作目录时回到当前运行态项目根，不再跟随 shell cwd 漂移。
      const selectedWorkspaceRoot = (cwd || config.workingDirectory || appWorkspace).trim();

      if (!selectedWorkspaceRoot) {
        return res.status(400).json({
          success: false,
          error: '请先选择一个工作目录',
        });
      }

      const fallbackTitle = (prompt as string)?.split('\n')[0]?.slice(0, 50) || 'New Session';
      const sessionTitle = title?.trim() || fallbackTitle;
      const taskWorkingDirectory = resolveTaskWorkingDirectory(selectedWorkspaceRoot);
      const runtimeUserDataPath = String(req.app.get('userDataPath') || '');

      const agentRoleKey = resolveIdentityRoleKey(config.agentRoleKey);
      const modelId = resolveConfiguredRoleModelId(store, agentRoleKey);
      const trace = createRequestTrace({
        platform: 'web',
        channelId: 'web:new',
        agentRoleKey,
        modelId,
      });
      const request = createWebInboundRequest({
        text: prompt,
        title: sessionTitle,
        systemPrompt: resolvedSystemPrompt,
        skillIds: activeSkillIds,
        imageAttachments,
        zenMode: Boolean(zenMode),
        cwd: taskWorkingDirectory,
        agentRoleKey,
        modelId,
        confirmationMode: 'modal',
        autoApprove: false,
        trace,
      });

      const unsupportedRuntimeSkillIds = getUnsupportedWebRuntimeSkillIds(
        runtimeUserDataPath,
        agentRoleKey,
        activeSkillIds
      );
      if (unsupportedRuntimeSkillIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: `当前 Web 轻链已禁止回退旧 CoworkRunner；以下技能仍依赖未桥接的 runtime config/secret：${unsupportedRuntimeSkillIds.join(', ')}`,
        });
      }

      const sessionExecutor = createPreferredSessionExecutor(req.context as RequestContext);

      const result = await orchestrateWebTurn({
        sessionStore: coworkStore as any,
        executor: sessionExecutor,
        trace,
        request,
        defaultCwd: taskWorkingDirectory,
      });

      const session = coworkStore.getSession(result.sessionId);
      res.json({ success: true, session });
    } catch (error) {
      console.error('[Cowork] POST /sessions error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start session',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // POST /api/cowork/sessions/:sessionId/continue - Continue a session
  // 【1.0链路】WEB-CONTINUE: Web UI 续聊同一 session，只负责本地继续执行，不包含渠道侧自动回推。
  router.post('/sessions/:sessionId/continue', async (req: Request, res: Response) => {
    try {
      const { coworkStore, store, skillManager } = req.context as RequestContext;
      const { sessionId } = req.params;
      const { prompt, systemPrompt, activeSkillIds, imageAttachments, zenMode } = req.body;

      const session = coworkStore.getSession(sessionId as CoworkSessionId);
      const agentRoleKey = resolveIdentityRoleKey(session?.agentRoleKey || coworkStore.getConfig().agentRoleKey);
      const runtimeUserDataPath = String(req.app.get('userDataPath') || '');
      const effectiveSkillIds = activeSkillIds?.length
        ? activeSkillIds
        : session?.activeSkillIds ?? [];
      const modelId = session?.modelId || resolveConfiguredRoleModelId(store, agentRoleKey);
      const trace = createRequestTrace({
        platform: 'web',
        channelId: sessionId,
        sessionId,
        agentRoleKey,
        modelId,
      });
      const request = createWebInboundRequest({
        text: prompt,
        systemPrompt,
        skillIds: activeSkillIds,
        imageAttachments,
        zenMode: Boolean(zenMode),
        cwd: session?.cwd,
        sessionId,
        agentRoleKey,
        modelId,
        confirmationMode: 'modal',
        autoApprove: false,
        trace,
      });

      const unsupportedRuntimeSkillIds = getUnsupportedWebRuntimeSkillIds(
        runtimeUserDataPath,
        agentRoleKey,
        effectiveSkillIds
      );
      if (unsupportedRuntimeSkillIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: `当前 Web 轻链已禁止回退旧 CoworkRunner；以下技能仍依赖未桥接的 runtime config/secret：${unsupportedRuntimeSkillIds.join(', ')}`,
        });
      }

      const sessionExecutor = createPreferredSessionExecutor(req.context as RequestContext);

      const result = await orchestrateWebTurn({
        sessionStore: coworkStore as any,
        executor: sessionExecutor,
        trace,
        request,
        defaultCwd: session?.cwd || resolveExistingTaskWorkingDirectory(
          coworkStore.getConfig().workingDirectory || String(req.app.get('workspace') || getProjectRoot())
        ),
      });

      const updatedSession = coworkStore.getSession(result.sessionId as CoworkSessionId);
      res.json({ success: true, session: updatedSession });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to continue session',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // POST /api/cowork/sessions/:sessionId/stop - Stop a session
  router.post('/sessions/:sessionId/stop', async (req: Request, res: Response) => {
    try {
      const { coworkStore, skillManager, store } = req.context as RequestContext;
      const webSessionExecutor = getOrCreateWebSessionExecutor({
        store: coworkStore,
        configStore: store,
        buildSelectedSkillsPrompt: (skillIds: string[]) => skillManager.buildSelectedSkillsPrompt(skillIds),
      });
      // {标记} P0-WEB-STOP-DIRECT: Web stop 只认现役 HttpSessionExecutor，不再回退旧 CoworkRunner。
      const handledByWebExecutor = webSessionExecutor.stopSession(req.params.sessionId as CoworkSessionId);
      if (!handledByWebExecutor) {
        return res.status(409).json({
          success: false,
          error: '当前 Web 会话未处于可停止的轻执行状态，旧 CoworkRunner 停止兜底已禁用。',
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop session',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // DELETE /api/cowork/sessions/:sessionId - Delete a session
  router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      coworkStore.deleteSession(req.params.sessionId as CoworkSessionId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete session',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // DELETE /api/cowork/sessions - Batch delete sessions
  router.delete('/sessions', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { sessionIds } = req.body;

      if (!Array.isArray(sessionIds)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter: sessionIds (array) required',
        });
      }

      coworkStore.deleteSessions(sessionIds);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch delete sessions',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // PATCH /api/cowork/sessions/:sessionId/pin - Set session pinned state
  router.patch('/sessions/:sessionId/pin', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { pinned } = req.body;

      if (typeof pinned !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter: pinned (boolean) required',
        });
      }

      coworkStore.setSessionPinned(req.params.sessionId as CoworkSessionId, pinned);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update session pin',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // PATCH /api/cowork/sessions/:sessionId - Rename session
  router.patch('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { title } = req.body;

      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter: title (non-empty string) required',
        });
      }

      coworkStore.updateSession(req.params.sessionId as CoworkSessionId, { title: title.trim() });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rename session',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // GET /api/cowork/sessions/:sessionId - Get a session
  router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const rawMessageLimit = typeof req.query.messageLimit === 'string' ? Number(req.query.messageLimit) : null;
      const messageLimit = Number.isFinite(rawMessageLimit) ? Math.max(1, Math.floor(rawMessageLimit as number)) : undefined;
      const session = coworkStore.getSession(req.params.sessionId as CoworkSessionId, { messageLimit });
      res.json({ success: true, session });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-SESSIONS
  // GET /api/cowork/sessions - List all sessions
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const sessions = coworkStore.listSessions();
      res.json({ success: true, sessions });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list sessions',
      });
    }
  });

  // ==================== Configuration ====================

  // {路标} FLOW-ROUTE-COWORK-CONFIG
  // GET /api/cowork/config - Get cowork configuration
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const config = coworkStore.getConfig();
      res.json({ success: true, config });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get config',
      });
    }
  });

  // {路标} FLOW-ROUTE-COWORK-CONFIG
  // PUT /api/cowork/config - Set cowork configuration
  router.put('/config', async (req: Request, res: Response) => {
    try {
      const { coworkStore, skillManager } = req.context as RequestContext;
      const config = req.body;

      const normalizedExecutionMode = 'local';
      const normalizedMemoryEnabled = typeof config.memoryEnabled === 'boolean'
        ? config.memoryEnabled
        : undefined;
      const normalizedMemoryImplicitUpdateEnabled = typeof config.memoryImplicitUpdateEnabled === 'boolean'
        ? config.memoryImplicitUpdateEnabled
        : undefined;
      const normalizedMemoryLlmJudgeEnabled = typeof config.memoryLlmJudgeEnabled === 'boolean'
        ? config.memoryLlmJudgeEnabled
        : undefined;
      const normalizedMemoryGuardLevel = config.memoryGuardLevel === 'strict'
        || config.memoryGuardLevel === 'standard'
        || config.memoryGuardLevel === 'relaxed'
        ? config.memoryGuardLevel
        : undefined;
      const normalizedMemoryUserMemoriesMaxItems =
        typeof config.memoryUserMemoriesMaxItems === 'number' && Number.isFinite(config.memoryUserMemoriesMaxItems)
          ? Math.max(
            MIN_MEMORY_USER_MEMORIES_MAX_ITEMS,
            Math.min(MAX_MEMORY_USER_MEMORIES_MAX_ITEMS, Math.floor(config.memoryUserMemoriesMaxItems))
          )
        : undefined;
      const normalizedConfig = {
        ...config,
        executionMode: normalizedExecutionMode,
        memoryEnabled: normalizedMemoryEnabled,
        memoryImplicitUpdateEnabled: normalizedMemoryImplicitUpdateEnabled,
        memoryLlmJudgeEnabled: normalizedMemoryLlmJudgeEnabled,
        memoryGuardLevel: normalizedMemoryGuardLevel,
        memoryUserMemoriesMaxItems: normalizedMemoryUserMemoriesMaxItems,
      };

      const previousWorkingDir = coworkStore.getConfig().workingDirectory;
      coworkStore.setConfig(normalizedConfig);

      if (normalizedConfig.workingDirectory !== undefined && normalizedConfig.workingDirectory !== previousWorkingDir) {
        skillManager.handleWorkingDirectoryChange();
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set config',
      });
    }
  });

  // ==================== Permissions ====================

  // POST /api/cowork/permissions/:requestId/respond - Respond to a permission request
  // {路标} FLOW-ROUTE-COWORK-PERMISSIONS
  router.post('/permissions/:requestId/respond', async (req: Request, res: Response) => {
    // {标记} P0-WEB-PERMISSION-CUT: Web 轻链不再把审批请求转回旧 CoworkRunner 权限语义。
    res.status(410).json({
      success: false,
      error: '当前 Web 轻链已移除旧审批桥接；若仍出现该审批请求，说明还有残留旧链需要继续拔除。',
    });
  });

  // ==================== Memory ====================

  // GET /api/cowork/memory/entries - List memory entries
  // {标记} P0-身份隔离-FIX: 记忆列表按 agentRoleKey 归桶
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  router.get('/memory/entries', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { query, status, includeDeleted, limit, offset, agentRoleKey } = req.query;

      const entries = coworkStore.listUserMemories({
        query: typeof query === 'string' ? query.trim() : undefined,
        status: (status as 'created' | 'stale' | 'deleted' | 'all') || 'all',
        includeDeleted: includeDeleted === 'true',
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        agentRoleKey: typeof agentRoleKey === 'string' ? agentRoleKey : undefined,
      });

      res.json({ success: true, entries });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list memory entries',
      });
    }
  });

  // POST /api/cowork/memory/entries - Create a memory entry
  // {标记} P0-身份隔离-FIX: 记忆写入按 agentRoleKey 归桶，modelId 仅作为元信息保留
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  router.post('/memory/entries', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { text, confidence, isExplicit, agentRoleKey, modelId } = req.body;

      const entry = coworkStore.createUserMemory({
        text,
        confidence,
        isExplicit,
        agentRoleKey,
        modelId,
      });

      res.json({ success: true, entry });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create memory entry',
      });
    }
  });

  // PUT /api/cowork/memory/entries/:id - Update a memory entry
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  router.put('/memory/entries/:id', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { id } = req.params;
      const { text, confidence, status, isExplicit } = req.body;

      const entry = coworkStore.updateUserMemory({
        id,
        text,
        confidence,
        status,
        isExplicit,
      });

      if (!entry) {
        return res.status(404).json({ success: false, error: 'Memory entry not found' });
      }

      res.json({ success: true, entry });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update memory entry',
      });
    }
  });

  // DELETE /api/cowork/memory/entries/:id - Delete a memory entry
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  router.delete('/memory/entries/:id', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const success = coworkStore.deleteUserMemory(req.params.id);

      res.json(success ? { success: true } : { success: false, error: 'Memory entry not found' });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete memory entry',
      });
    }
  });

  // GET /api/cowork/memory/stats - Get memory statistics
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  router.get('/memory/stats', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { agentRoleKey } = req.query;
      const stats = coworkStore.getUserMemoryStats({
        agentRoleKey: typeof agentRoleKey === 'string' ? agentRoleKey : undefined,
      });
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get memory stats',
      });
    }
  });

  // GET /api/cowork/memory/broadcast-boards - Observe 24h broadcast boards
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  // {标记} P0-广播板可观测性: 只读导出 identity_thread_24h，先恢复“看得见”。
  router.get('/memory/broadcast-boards', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const { agentRoleKey, limit } = req.query;
      const boards = listIdentityThreadBoardSnapshots(coworkStore.getDatabase(), {
        agentRoleKey: typeof agentRoleKey === 'string' ? agentRoleKey : undefined,
        limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      });
      res.json({ success: true, boards });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load broadcast boards',
      });
    }
  });

  // POST /api/cowork/memory/broadcast-boards/clear - Clear one role's 24h broadcast board
  // {路标} FLOW-ROUTE-COWORK-MEMORY
  router.post('/memory/broadcast-boards/clear', async (req: Request, res: Response) => {
    try {
      const { coworkStore } = req.context as RequestContext;
      const agentRoleKey = typeof req.body?.agentRoleKey === 'string' ? req.body.agentRoleKey.trim() : '';
      if (!agentRoleKey) {
        return res.status(400).json({
          success: false,
          error: 'agentRoleKey is required',
        });
      }

      const cleared = clearIdentityThreadForRole(coworkStore.getDatabase(), agentRoleKey);
      if (cleared > 0) {
        coworkStore.getSaveFunction()();
      }

      res.json({ success: true, cleared });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear broadcast board',
      });
    }
  });

  // ==================== Utilities ====================

  // POST /api/cowork/generateTitle - Generate session title
  // {路标} FLOW-ROUTE-COWORK-AUX
  router.post('/generateTitle', async (req: Request, res: Response) => {
    const { userInput } = req.body;
    const title = await generateSessionTitle(userInput || null);
    res.json({ success: true, title });
  });

  // GET /api/cowork/recentCwds - Get recent working directories
  // {路标} FLOW-ROUTE-COWORK-AUX
  router.get('/recentCwds', async (req: Request, res: Response) => {
    const { coworkStore } = req.context as RequestContext;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 8;
    const boundedLimit = Math.min(Math.max(limit, 1), 20);
    const cwds = coworkStore.listRecentCwds(boundedLimit);
    res.json(cwds);
  });

  // {路标} FLOW-MOUNT-COWORK
  app.use('/api/cowork', router);
}
