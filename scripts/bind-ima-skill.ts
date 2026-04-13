import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SqliteStoreModule from '../server/sqliteStore.web.ts';
import * as RoleSkillFilesModule from '../server/libs/roleSkillFiles.ts';
import * as RoleRuntimeViewsModule from '../server/libs/roleRuntimeViews.ts';
import { AGENT_ROLE_ORDER, type AgentRoleKey } from '../src/shared/agentRoleConfig.ts';

const SKILL_ID = 'ima-note';
const SKILL_NAME = 'ima-note';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RuntimeSkillRecord = {
  id: string;
  name: string;
  enabled: boolean;
  skillPath: string;
};

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

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getRoleSecretPath(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(userDataPath, 'roles', roleKey, 'skill-secrets', `${SKILL_ID}.json`);
}

function getSharedSecretPath(userDataPath: string): string {
  return path.join(userDataPath, 'shared-skill-secrets', `${SKILL_ID}.json`);
}

function readExistingImaSecret(userDataPath: string): string | null {
  const sharedSecretPath = getSharedSecretPath(userDataPath);
  if (fs.existsSync(sharedSecretPath)) {
    return fs.readFileSync(sharedSecretPath, 'utf8');
  }

  for (const roleKey of AGENT_ROLE_ORDER) {
    const secretPath = getRoleSecretPath(userDataPath, roleKey);
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf8');
    }
  }
  return null;
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

  const projectRoot = path.resolve(__dirname, '..');
  const userDataPath = path.join(projectRoot, '.uclaw', 'web');
  const skillsRoot = path.join(userDataPath, 'SKILLs');
  const skillRoot = path.join(skillsRoot, SKILL_ID);
  if (!fs.existsSync(path.join(skillRoot, 'SKILL.md'))) {
    throw new Error(`Skill not found in runtime: ${skillRoot}`);
  }

  const store = await SqliteStore.create(userDataPath);
  const db = store.getDatabase();
  const now = Date.now();
  const insertedBindings: string[] = [];
  const existingBindings: string[] = [];

  for (const roleKey of AGENT_ROLE_ORDER) {
    const existing = db.exec(
      'SELECT id FROM skill_role_configs WHERE role_key = ? AND skill_id = ?',
      [roleKey, SKILL_ID],
    );
    if (existing.length > 0 && existing[0].values.length > 0) {
      existingBindings.push(roleKey);
      continue;
    }

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
  }

  if (insertedBindings.length > 0) {
    store.getSaveFunction()();
  }

  const seedSecret = readExistingImaSecret(userDataPath);
  const copiedSecrets: string[] = [];
  if (seedSecret) {
    ensureDir(path.dirname(getSharedSecretPath(userDataPath)));
    fs.writeFileSync(getSharedSecretPath(userDataPath), seedSecret, 'utf8');

    for (const roleKey of AGENT_ROLE_ORDER) {
      const secretPath = getRoleSecretPath(userDataPath, roleKey);
      if (fs.existsSync(secretPath)) {
        continue;
      }
      ensureDir(path.dirname(secretPath));
      fs.writeFileSync(secretPath, seedSecret, 'utf8');
      copiedSecrets.push(roleKey);
    }
  }

  const runtimeSkillManager = {
    getSkillsRoot: () => skillsRoot,
    listSkills: () => listRuntimeSkills(skillsRoot),
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
    insertedBindings,
    existingBindings,
    copiedSecrets,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
