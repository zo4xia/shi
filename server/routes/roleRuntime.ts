import { Router, Request, Response } from 'express';
import { AGENT_ROLE_ORDER, resolveAgentRolesFromConfig, type AgentRoleKey } from '../../src/shared/agentRoleConfig';
import type { RequestContext } from '../src/index';
import {
  getRoleRoot,
  getRoleSkillConfigsRoot,
  getRoleSkillSecretsRoot,
  getRoleSkillsIndexPath,
} from '../libs/roleSkillFiles';
import {
  getRoleCapabilitySnapshotPath,
  getRoleNotesPath,
  getRolePitfallsPath,
  readRoleRuntimeNotes,
  syncRoleSettingsView,
  syncRoleCapabilitySnapshot,
  writeRoleRuntimeNotes,
} from '../libs/roleRuntimeViews';
import { getRoleRuntimeFileHealth, runRoleRuntimeHealthCheck } from '../libs/roleRuntimeHealthCheck';
import { syncAppConfigToEnv } from './store';
import { probeCoworkModelReadiness } from '../../src/main/libs/coworkUtil';

function isValidRoleKey(value: string): value is AgentRoleKey {
  return (AGENT_ROLE_ORDER as string[]).includes(value);
}

function readCount(result: any[]): number {
  return Number(result?.[0]?.values?.[0]?.[0] ?? 0);
}

function readMaybeNumber(result: any[]): number | null {
  const value = result?.[0]?.values?.[0]?.[0];
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function setupRoleRuntimeRoutes(app: Router) {
  const router = Router();

  // {路标} FLOW-ROUTE-ROLE-RUNTIME
  // {FLOW} ROLE-RUNTIME-TRUTH-VIEW: 这里不是单纯配置写口，而是把 app_config、roles 文件、capability snapshot、DB统计汇总成角色真相视图。
  router.get('/', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const appConfig = store.get('app_config');
      const rolesView = resolveAgentRolesFromConfig(appConfig as any);

      const roles = AGENT_ROLE_ORDER.map((roleKey) => {
        const role = rolesView[roleKey];
        return {
          roleKey,
          label: role.label,
          enabled: role.enabled,
          apiUrl: role.apiUrl,
          apiKey: role.apiKey,
          apiKeyConfigured: Boolean(role.apiKey),
          apiFormat: role.apiFormat,
          modelId: role.modelId,
          supportsImage: role.supportsImage,
          ready: Boolean(role.enabled && role.apiUrl && role.modelId),
        };
      });

      res.json({
        success: true,
        roles,
        truthSource: {
          store: 'uclaw.sqlite -> kv(key=\'app_config\')',
          pathPrefix: 'app_config.agentRoles',
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load role runtime configs',
      });
    }
  });

  router.put('/:roleKey/config', (req: Request, res: Response) => {
    try {
      const roleKey = req.params.roleKey;
      if (!isValidRoleKey(roleKey)) {
        return res.status(400).json({ success: false, error: 'Invalid role key' });
      }

      const {
        enabled,
        apiUrl,
        apiKey,
        modelId,
        apiFormat,
      } = req.body as {
        enabled?: boolean;
        apiUrl?: string;
        apiKey?: string;
        modelId?: string;
        apiFormat?: 'anthropic' | 'openai';
      };

      const { store } = req.context as RequestContext;
      const current = (store.get('app_config') as Record<string, any> | null) || {};
      const next = {
        ...current,
        agentRoles: {
          ...(current.agentRoles || {}),
          [roleKey]: {
            ...((current.agentRoles || {})[roleKey] || {}),
            enabled: Boolean(enabled),
            apiUrl: String(apiUrl || '').trim().replace(/\/+$/, ''),
            apiKey: String(apiKey || '').trim(),
            modelId: String(modelId || '').trim(),
            apiFormat: apiFormat === 'anthropic' ? 'anthropic' : 'openai',
          },
        },
      };

      store.set('app_config', next);
      syncAppConfigToEnv(next);

      const role = resolveAgentRolesFromConfig(next as any)[roleKey];
      res.json({
        success: true,
        role: {
          roleKey,
          label: role.label,
          enabled: role.enabled,
          apiUrl: role.apiUrl,
          apiKey: role.apiKey,
          apiKeyConfigured: Boolean(role.apiKey),
          apiFormat: role.apiFormat,
          modelId: role.modelId,
          supportsImage: role.supportsImage,
          ready: Boolean(role.enabled && role.apiUrl && role.modelId),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save role config',
      });
    }
  });

  router.post('/:roleKey/probe', async (req: Request, res: Response) => {
    try {
      const roleKey = req.params.roleKey;
      if (!isValidRoleKey(roleKey)) {
        return res.status(400).json({ success: false, error: 'Invalid role key' });
      }

      const result = await probeCoworkModelReadiness(roleKey);
      if (!result.ok) {
        return res.json({
          success: false,
          message: 'error' in result ? result.error : '模型探测失败',
        });
      }

      return res.json({
        success: true,
        message: `模型连通正常：${result.config?.model || 'unknown'}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to probe role config',
      });
    }
  });

  router.get('/:roleKey', (req: Request, res: Response) => {
    try {
      const roleKey = req.params.roleKey;
      if (!isValidRoleKey(roleKey)) {
        return res.status(400).json({ success: false, error: 'Invalid role key' });
      }

      const userDataPath = String(req.app.get('userDataPath') || '');
      const notes = readRoleRuntimeNotes(userDataPath, roleKey);
      const roleRoot = getRoleRoot(userDataPath, roleKey);
      const { store, skillManager, mcpStore } = req.context as RequestContext;
      const appConfig = store.get('app_config');
      const settingsView = syncRoleSettingsView(userDataPath, roleKey, appConfig as any).payload;
      const capabilitySnapshot = syncRoleCapabilitySnapshot(userDataPath, roleKey, store, skillManager, mcpStore).snapshot;
      const runtimeFileHealth = getRoleRuntimeFileHealth(runRoleRuntimeHealthCheck(userDataPath), roleKey);
      const db = store.getDatabase();

      const sessionsTotal = readCount(db.exec(
        'SELECT COUNT(*) FROM cowork_sessions WHERE agent_role_key = ?',
        [roleKey],
      ));
      const runningSessions = readCount(db.exec(
        "SELECT COUNT(*) FROM cowork_sessions WHERE agent_role_key = ? AND status = 'running'",
        [roleKey],
      ));
      const lastSessionAt = readMaybeNumber(db.exec(
        'SELECT MAX(updated_at) FROM cowork_sessions WHERE agent_role_key = ?',
        [roleKey],
      ));

      const tasksTotal = readCount(db.exec(
        'SELECT COUNT(*) FROM scheduled_tasks WHERE agent_role_key = ?',
        [roleKey],
      ));
      const enabledTasks = readCount(db.exec(
        'SELECT COUNT(*) FROM scheduled_tasks WHERE agent_role_key = ? AND enabled = 1',
        [roleKey],
      ));
      const runningTasks = readCount(db.exec(
        'SELECT COUNT(*) FROM scheduled_tasks WHERE agent_role_key = ? AND running_at_ms IS NOT NULL',
        [roleKey],
      ));
      const taskErrors = readCount(db.exec(
        "SELECT COUNT(*) FROM scheduled_tasks WHERE agent_role_key = ? AND last_status = 'error'",
        [roleKey],
      ));

      const memories = readCount(db.exec(
        "SELECT COUNT(*) FROM user_memories WHERE agent_role_key = ? AND status = 'created'",
        [roleKey],
      ));

      res.json({
        success: true,
        roleKey,
        paths: {
          roleRoot,
          settingsPath: settingsView.directories.settingsPath,
          capabilitySnapshotPath: getRoleCapabilitySnapshotPath(userDataPath, roleKey),
          skillsIndexPath: getRoleSkillsIndexPath(userDataPath, roleKey),
          skillConfigsRoot: getRoleSkillConfigsRoot(userDataPath, roleKey),
          skillSecretsRoot: getRoleSkillSecretsRoot(userDataPath, roleKey),
          notesRoot: notes.notesRoot,
          roleNotesPath: getRoleNotesPath(userDataPath, roleKey),
          pitfallsPath: getRolePitfallsPath(userDataPath, roleKey),
        },
        settingsView,
        notes: {
          roleNotes: notes.roleNotes,
          pitfalls: notes.pitfalls,
        },
        capabilitySnapshot,
        health: {
          ready: settingsView.settings.ready,
          enabled: settingsView.settings.enabled,
          apiKeyConfigured: settingsView.settings.apiKeyConfigured,
          capabilitySyncStatus: capabilitySnapshot.summary.syncStatus,
          capabilityWarnings: capabilitySnapshot.warnings,
          runtimeFilesStatus: runtimeFileHealth.status,
          runtimeFileWarnings: runtimeFileHealth.warnings,
          runtimeFileChecks: runtimeFileHealth.checks,
          invalidSkillBindings: capabilitySnapshot.invalidBindings,
          truthSources: {
            roleSettings: settingsView.sources.appConfigStore,
            roleSettingsPath: settingsView.sources.appConfigPath,
            skillsIndex: getRoleSkillsIndexPath(userDataPath, roleKey),
            capabilitySnapshot: getRoleCapabilitySnapshotPath(userDataPath, roleKey),
          },
        },
        summary: {
          sessionsTotal,
          runningSessions,
          lastSessionAt,
          tasksTotal,
          enabledTasks,
          runningTasks,
          taskErrors,
          skillBindings: capabilitySnapshot.summary.availableSkillCount,
          mcpBindings: capabilitySnapshot.summary.runtimeMcpCount,
          invalidSkillBindings: capabilitySnapshot.invalidBindings.length,
          memories,
          capabilityWarnings: capabilitySnapshot.summary.warningCount,
          runtimeFileWarnings: runtimeFileHealth.warnings.length,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load role runtime info',
      });
    }
  });

  router.put('/:roleKey/notes', (req: Request, res: Response) => {
    try {
      const roleKey = req.params.roleKey;
      if (!isValidRoleKey(roleKey)) {
        return res.status(400).json({ success: false, error: 'Invalid role key' });
      }

      const { roleNotes, pitfalls } = req.body as { roleNotes?: string; pitfalls?: string };
      const userDataPath = String(req.app.get('userDataPath') || '');
      const paths = writeRoleRuntimeNotes(userDataPath, roleKey, {
        roleNotes: typeof roleNotes === 'string' ? roleNotes : undefined,
        pitfalls: typeof pitfalls === 'string' ? pitfalls : undefined,
      });

      res.json({
        success: true,
        roleKey,
        paths,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save role runtime notes',
      });
    }
  });

  app.use('/api/role-runtime', router);
}
