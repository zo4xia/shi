import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as SqliteStoreModule from '../server/sqliteStore.web.ts';
import * as RoleSkillFilesModule from '../server/libs/roleSkillFiles.ts';
import * as RoleRuntimeViewsModule from '../server/libs/roleRuntimeViews.ts';
import type { AgentRoleKey } from '../src/shared/agentRoleConfig.ts';

const SKILL_ID = 'blingbling-little-eye';
const SKILL_NAME = 'blingbling小眼睛';
const TARGET_ROLES: AgentRoleKey[] = ['organizer', 'writer', 'designer', 'analyst'];
const DEFAULT_SKILL_CONFIG = { order: 226, enabled: true };

type RuntimeSkillRecord = {
  id: string;
  name: string;
  enabled: boolean;
  skillPath: string;
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureRuntimeSkillInstalled(projectRoot: string, userDataPath: string): string {
  const sourceDir = path.join(projectRoot, 'SKILLs', SKILL_ID);
  const sourceSkillPath = path.join(sourceDir, 'SKILL.md');
  if (!fs.existsSync(sourceSkillPath)) {
    throw new Error(`Project skill not found: ${sourceSkillPath}`);
  }

  const runtimeSkillsRoot = path.join(userDataPath, 'SKILLs');
  const runtimeDir = path.join(runtimeSkillsRoot, SKILL_ID);
  ensureDir(runtimeSkillsRoot);
  fs.cpSync(sourceDir, runtimeDir, { recursive: true, force: true });

  const sourceConfigPath = path.join(projectRoot, 'SKILLs', 'skills.config.json');
  const runtimeConfigPath = path.join(runtimeSkillsRoot, 'skills.config.json');
  const sourceConfig = readJsonFile<{ defaults?: Record<string, unknown> }>(sourceConfigPath, {});
  const runtimeConfig = readJsonFile<{
    version?: number;
    description?: string;
    defaults?: Record<string, unknown>;
  }>(runtimeConfigPath, {
    version: 1,
    description: 'Default skill configuration for LobsterAI',
    defaults: {},
  });

  runtimeConfig.version = runtimeConfig.version ?? 1;
  runtimeConfig.description = runtimeConfig.description || 'Default skill configuration for LobsterAI';
  runtimeConfig.defaults = runtimeConfig.defaults ?? {};
  runtimeConfig.defaults[SKILL_ID] = sourceConfig.defaults?.[SKILL_ID] ?? DEFAULT_SKILL_CONFIG;
  writeJsonFile(runtimeConfigPath, runtimeConfig);

  return runtimeDir;
}

function listRuntimeSkills(skillsRoot: string): RuntimeSkillRecord[] {
  if (!fs.existsSync(skillsRoot)) {
    return [];
  }

  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map<RuntimeSkillRecord | null>((entry) => {
      const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        return null;
      }

      return {
        id: entry.name,
        name: entry.name,
        enabled: true,
        skillPath,
      };
    })
    .filter((skill): skill is RuntimeSkillRecord => skill !== null);
}

async function main(): Promise<void> {
  const SqliteStore = (SqliteStoreModule as any).SqliteStore
    ?? (SqliteStoreModule as any).default?.SqliteStore
    ?? (SqliteStoreModule as any).default;
  const cleanupRoleSkillRuntimeState = (RoleSkillFilesModule as any).cleanupRoleSkillRuntimeState
    ?? (RoleSkillFilesModule as any).default?.cleanupRoleSkillRuntimeState;
  const syncRoleSkillIndexes = (RoleSkillFilesModule as any).syncRoleSkillIndexes
    ?? (RoleSkillFilesModule as any).default?.syncRoleSkillIndexes;
  const syncRoleCapabilitySnapshots = (RoleRuntimeViewsModule as any).syncRoleCapabilitySnapshots
    ?? (RoleRuntimeViewsModule as any).default?.syncRoleCapabilitySnapshots;
  const syncRoleSettingsViews = (RoleRuntimeViewsModule as any).syncRoleSettingsViews
    ?? (RoleRuntimeViewsModule as any).default?.syncRoleSettingsViews;

  if (!SqliteStore || !cleanupRoleSkillRuntimeState || !syncRoleSkillIndexes || !syncRoleCapabilitySnapshots || !syncRoleSettingsViews) {
    throw new Error('Failed to resolve runtime binding modules');
  }

  const projectRoot = path.resolve(process.cwd());
  const userDataPath = path.join(projectRoot, '.uclaw', 'web');
  const runtimeDir = ensureRuntimeSkillInstalled(projectRoot, userDataPath);
  const store = await SqliteStore.create(userDataPath);
  const db = store.getDatabase();
  const now = Date.now();
  const insertedBindings: string[] = [];
  const updatedBindings: string[] = [];

  for (const roleKey of TARGET_ROLES) {
    const existing = db.exec(
      'SELECT id, enabled FROM skill_role_configs WHERE role_key = ? AND skill_id = ? LIMIT 1',
      [roleKey, SKILL_ID],
    );

    if (!existing.length || existing[0].values.length === 0) {
      db.run(
        `INSERT INTO skill_role_configs
         (id, role_key, skill_id, skill_name, prefix, enabled, config_json, installed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          roleKey,
          SKILL_ID,
          SKILL_NAME,
          `${roleKey}_`,
          '{}',
          now,
          now,
        ],
      );
      insertedBindings.push(roleKey);
      continue;
    }

    const bindingId = String(existing[0].values[0]?.[0] ?? '');
    db.run(
      `UPDATE skill_role_configs
       SET skill_name = ?, prefix = ?, enabled = 1, updated_at = ?
       WHERE id = ?`,
      [
        SKILL_NAME,
        `${roleKey}_`,
        now,
        bindingId,
      ],
    );
    updatedBindings.push(roleKey);
  }

  if (insertedBindings.length > 0 || updatedBindings.length > 0) {
    store.getSaveFunction()();
  }

  const runtimeSkillsRoot = path.join(userDataPath, 'SKILLs');
  const runtimeSkillManager = {
    getSkillsRoot: () => runtimeSkillsRoot,
    listSkills: () => listRuntimeSkills(runtimeSkillsRoot),
  };
  const appConfig = store.get('app_config') as Record<string, unknown> | undefined;
  const mcpStore = {
    getRuntimeEnabledServers: (roleKey: AgentRoleKey) => {
      const result = db.exec(
        `SELECT id, name, transport_type, agent_role_key
         FROM mcp_servers
         WHERE enabled = 1 AND (agent_role_key = ? OR agent_role_key = ?)
         ORDER BY created_at ASC`,
        [roleKey, 'all'],
      );

      if (!result.length || !result[0].values.length) {
        return [];
      }

      return result[0].values.map((row: unknown[]) => ({
        id: String(row[0] ?? ''),
        name: String(row[1] ?? ''),
        transportType: String(row[2] ?? 'stdio'),
        agentRoleKey: String(row[3] ?? 'all'),
      }));
    },
  };

  cleanupRoleSkillRuntimeState(userDataPath, store as any, runtimeSkillManager);
  syncRoleSkillIndexes(userDataPath, store as any, runtimeSkillManager);
  syncRoleSettingsViews(userDataPath, appConfig as any);
  syncRoleCapabilitySnapshots(userDataPath, store as any, runtimeSkillManager, mcpStore as any);

  process.stdout.write(JSON.stringify({
    skillId: SKILL_ID,
    skillName: SKILL_NAME,
    runtimeDir,
    targetRoles: TARGET_ROLES,
    insertedBindings,
    updatedBindings,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
