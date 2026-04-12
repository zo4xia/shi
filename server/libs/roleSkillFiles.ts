import fs from 'fs';
import path from 'path';
import type { SkillManager } from '../../src/main/skillManager';
import { AGENT_ROLE_ORDER, type AgentRoleKey } from '../../src/shared/agentRoleConfig';

type SkillBindingRow = {
  id: string;
  roleKey: string;
  skillId: string;
  skillName: string;
  prefix: string;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
};

type InstalledSkillRecord = {
  id: string;
  name: string;
  enabled: boolean;
  skillPath: string;
};

export type RoleSkillIndexEntry = {
  id: string;
  name: string;
  scope: 'all' | AgentRoleKey;
  enabled: boolean;
  sourcePath: string;
  sourceDir: string;
  configPath: string;
  secretPath: string;
  installedAt: number;
  updatedAt: number;
};

export type RoleSkillIndexFile = {
  version: 1;
  role: AgentRoleKey;
  generatedAt: number;
  directories: {
    roleRoot: string;
    configRoot: string;
    secretsRoot: string;
  };
  rules: {
    visibleIndex: string;
    configRule: string;
    secretRule: string;
  };
  skills: RoleSkillIndexEntry[];
};

type StoreLike = {
  getDatabase(): {
    exec: (sql: string, params?: Array<string | number>) => any[];
    run: (sql: string, params?: Array<string | number>) => void;
  };
  getSaveFunction(): () => void;
};

type CleanupSummary = {
  removedBindings: Array<{ id: string; roleKey: string; skillId: string }>;
  removedConfigFiles: string[];
  removedSecretFiles: string[];
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getRolesRoot(userDataPath: string): string {
  return path.join(path.resolve(userDataPath), 'roles');
}

export function getRoleRoot(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRolesRoot(userDataPath), roleKey);
}

export function getRoleSkillsIndexPath(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleRoot(userDataPath, roleKey), 'skills.json');
}

export function getRoleSkillConfigsRoot(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleRoot(userDataPath, roleKey), 'skill-configs');
}

export function getRoleSkillSecretsRoot(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleRoot(userDataPath, roleKey), 'skill-secrets');
}

export function getRoleSkillConfigPath(userDataPath: string, roleKey: AgentRoleKey, skillId: string): string {
  return path.join(getRoleSkillConfigsRoot(userDataPath, roleKey), `${skillId}.json`);
}

export function getRoleSkillSecretPath(userDataPath: string, roleKey: AgentRoleKey, skillId: string): string {
  return path.join(getRoleSkillSecretsRoot(userDataPath, roleKey), `${skillId}.json`);
}

export function ensureRoleRuntimeDirs(userDataPath: string): void {
  ensureDir(getRolesRoot(userDataPath));
  for (const roleKey of AGENT_ROLE_ORDER) {
    ensureDir(getRoleRoot(userDataPath, roleKey));
    ensureDir(getRoleSkillConfigsRoot(userDataPath, roleKey));
    ensureDir(getRoleSkillSecretsRoot(userDataPath, roleKey));
  }
}

function loadSkillBindings(store: Pick<StoreLike, 'getDatabase'>, options?: { enabledOnly?: boolean }): SkillBindingRow[] {
  // {FLOW} ROLE-SKILL-BINDINGS: skill_role_configs 是角色技能绑定主数据；后续 roles/<role>/skills.json 由这里投影生成。
  const whereClause = options?.enabledOnly ? 'WHERE enabled = 1' : '';
  const result = store.getDatabase().exec(
    `SELECT id, role_key, skill_id, skill_name, prefix, enabled, installed_at, updated_at
     FROM skill_role_configs
     ${whereClause}
     ORDER BY installed_at ASC`
  );

  if (!result.length || !result[0].values.length) {
    return [];
  }

  return result[0].values.map((row) => ({
    id: String(row[0] ?? ''),
    roleKey: String(row[1] ?? ''),
    skillId: String(row[2] ?? ''),
    skillName: String(row[3] ?? ''),
    prefix: String(row[4] ?? ''),
    enabled: Number(row[5] ?? 0) === 1,
    installedAt: Number(row[6] ?? 0),
    updatedAt: Number(row[7] ?? 0),
  }));
}

function buildInstalledSkillMap(skillManager: Pick<SkillManager, 'listSkills' | 'getSkillsRoot'>): Map<string, InstalledSkillRecord> {
  return new Map(
    skillManager.listSkills().map((skill) => [
      skill.id,
      {
        id: skill.id,
        name: skill.name,
        enabled: skill.enabled,
        skillPath: skill.skillPath,
      },
    ])
  );
}

function removeFileIfExists(filePath: string, removed: string[]): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return;
  }
  fs.unlinkSync(filePath);
  removed.push(filePath);
}

function cleanupRoleArtifactDir(dirPath: string, allowedSkillIds: Set<string>, removed: string[]): void {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }
    const skillId = path.basename(entry.name, '.json');
    if (allowedSkillIds.has(skillId)) {
      continue;
    }
    removeFileIfExists(path.join(dirPath, entry.name), removed);
  }
}

export function cleanupRoleSkillRuntimeState(
  userDataPath: string,
  store: StoreLike,
  skillManager: Pick<SkillManager, 'listSkills' | 'getSkillsRoot'>
): CleanupSummary {
  // {FLOW} ROLE-SKILL-RUNTIME-CLEANUP: 先按运行时真实仓库清洗失效 binding，再清理 role 目录下遗留 config/secrets 噪音文件。
  ensureRoleRuntimeDirs(userDataPath);

  const db = store.getDatabase();
  const allBindings = loadSkillBindings(store);
  const installedSkillMap = buildInstalledSkillMap(skillManager);
  const removedBindings: CleanupSummary['removedBindings'] = [];

  for (const binding of allBindings) {
    if (installedSkillMap.has(binding.skillId)) {
      continue;
    }
    db.run('DELETE FROM skill_role_configs WHERE id = ?', [binding.id]);
    removedBindings.push({
      id: binding.id,
      roleKey: binding.roleKey,
      skillId: binding.skillId,
    });
  }

  if (removedBindings.length > 0) {
    store.getSaveFunction()();
  }

  const remainingBindings = removedBindings.length > 0 ? loadSkillBindings(store) : allBindings;
  const validBindings = remainingBindings.filter((binding) => binding.enabled && installedSkillMap.has(binding.skillId));
  const removedConfigFiles: string[] = [];
  const removedSecretFiles: string[] = [];

  for (const roleKey of AGENT_ROLE_ORDER) {
    const allowedSkillIds = new Set(
      validBindings
        .filter((binding) => binding.roleKey === 'all' || binding.roleKey === roleKey)
        .map((binding) => binding.skillId)
    );

    cleanupRoleArtifactDir(getRoleSkillConfigsRoot(userDataPath, roleKey), allowedSkillIds, removedConfigFiles);
    cleanupRoleArtifactDir(getRoleSkillSecretsRoot(userDataPath, roleKey), allowedSkillIds, removedSecretFiles);
  }

  return {
    removedBindings,
    removedConfigFiles,
    removedSecretFiles,
  };
}

function resolveBoundSkillsForRole(
  roleKey: AgentRoleKey,
  bindings: SkillBindingRow[],
  installedSkillMap: Map<string, InstalledSkillRecord>,
  userDataPath: string
): RoleSkillIndexEntry[] {
  const merged = new Map<string, RoleSkillIndexEntry>();

  for (const binding of bindings) {
    if (binding.roleKey !== 'all' && binding.roleKey !== roleKey) {
      continue;
    }

    const installed = installedSkillMap.get(binding.skillId);
    if (!installed || !installed.enabled) {
      continue;
    }

    const runtimeSourcePath = path.join(path.resolve(userDataPath), 'SKILLs', binding.skillId, 'SKILL.md');
    const sourcePath = fs.existsSync(runtimeSourcePath)
      ? runtimeSourcePath
      : (installed.skillPath || runtimeSourcePath);
    merged.set(binding.skillId, {
      id: binding.skillId,
      name: binding.skillName || installed.name || binding.skillId,
      scope: binding.roleKey === 'all' ? 'all' : roleKey,
      enabled: true,
      sourcePath,
      sourceDir: path.dirname(sourcePath),
      configPath: getRoleSkillConfigPath(userDataPath, roleKey, binding.skillId),
      secretPath: getRoleSkillSecretPath(userDataPath, roleKey, binding.skillId),
      installedAt: binding.installedAt,
      updatedAt: binding.updatedAt,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === roleKey ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export function syncRoleSkillIndexes(
  userDataPath: string,
  store: StoreLike,
  skillManager: Pick<SkillManager, 'listSkills' | 'getSkillsRoot'>
): Array<{ roleKey: AgentRoleKey; path: string; skills: number }> {
  // {FLOW} ROLE-SKILL-INDEX-TRUTH: roles/<role>/skills.json 是角色技能可见性真相索引；来源 = skill_role_configs + 运行时 SKILLs 仓库。
  // {标记} ROLE-INDEX-TRUTH: 小 agent 房间里“这个角色现在看得见哪些技能”，最终以 roles/<role>/skills.json 为准。
  ensureRoleRuntimeDirs(userDataPath);

  cleanupRoleSkillRuntimeState(userDataPath, store, skillManager);

  const bindings = loadSkillBindings(store, { enabledOnly: true });
  const installedSkillMap = buildInstalledSkillMap(skillManager);
  const results: Array<{ roleKey: AgentRoleKey; path: string; skills: number }> = [];

  for (const roleKey of AGENT_ROLE_ORDER) {
    const roleRoot = getRoleRoot(userDataPath, roleKey);
    const configRoot = getRoleSkillConfigsRoot(userDataPath, roleKey);
    const secretsRoot = getRoleSkillSecretsRoot(userDataPath, roleKey);
    const filePath = getRoleSkillsIndexPath(userDataPath, roleKey);
    const payload: RoleSkillIndexFile = {
      version: 1,
      role: roleKey,
      generatedAt: Date.now(),
      directories: {
        roleRoot,
        configRoot,
        secretsRoot,
      },
      rules: {
        visibleIndex: '这个文件只记录当前角色可见、可用的技能索引，不保存密钥明文。',
        configRule: '普通技能配置写入 skill-configs/<skillId>.json。',
        secretRule: '密钥与敏感配置写入 skill-secrets/<skillId>.json，不应进入普通聊天记录。',
      },
      skills: resolveBoundSkillsForRole(roleKey, bindings, installedSkillMap, userDataPath),
    };

    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    results.push({
      roleKey,
      path: filePath,
      skills: payload.skills.length,
    });
  }

  return results;
}
