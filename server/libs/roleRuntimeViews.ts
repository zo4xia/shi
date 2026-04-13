import fs from 'fs';
import path from 'path';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  type AgentRoleKey,
  type AppConfigLike,
  resolveAgentRolesFromConfig,
} from '../../src/shared/agentRoleConfig';
import {
  NATIVE_CAPABILITY_LABELS,
  resolveNativeCapabilitiesConfigFromAppConfig,
} from '../../src/shared/nativeCapabilities/config';
import type { SkillManager } from '../../src/main/skillManager';
import type { McpStore } from '../../src/main/mcpStore';
import {
  ensureRoleRuntimeDirs,
  getRoleRoot,
  getRoleSkillConfigsRoot,
  getRoleSkillSecretsRoot,
  getRoleSkillsIndexPath,
  type RoleSkillIndexFile,
} from './roleSkillFiles';
import { probeOfficeFoundation } from './officeFoundation';

export type RoleSettingsViewFile = {
  version: 1;
  role: AgentRoleKey;
  generatedAt: number;
  sources: {
    runtimeRoot: string;
    appConfigStore: string;
    appConfigPath: string;
  };
  directories: {
    roleRoot: string;
    notesRoot: string;
    settingsPath: string;
    skillIndexPath: string;
    skillConfigsRoot: string;
    skillSecretsRoot: string;
  };
  rules: {
    truthRule: string;
    notesRule: string;
  };
  settings: {
    key: AgentRoleKey;
    label: string;
    enabled: boolean;
    apiUrl: string;
    apiFormat: string;
    modelId: string;
    supportsImage: boolean;
    apiKeyConfigured: boolean;
    ready: boolean;
    nativeCapabilities: Array<{
      id: string;
      title: string;
      enabled: boolean;
      priority: number;
      available?: boolean;
      detail?: string;
      detectedPath?: string | null;
      source?: string;
    }>;
  };
};

export type RoleCapabilitySnapshotFile = {
  version: 1;
  role: AgentRoleKey;
  generatedAt: number;
  paths: {
    runtimeRoot: string;
    roleRoot: string;
    capabilitySnapshotPath: string;
    skillsIndexPath: string;
    skillConfigsRoot: string;
    skillSecretsRoot: string;
    runtimeSkillsRoot: string;
    projectSkillsRoot: string;
  };
  rules: {
    truthRule: string;
    warehouseRule: string;
    visibilityRule: string;
    warehouseOnlyRule?: string;
  };
  summary: {
    availableSkillCount: number;
    runtimeMcpCount: number;
    nativeCapabilityCount: number;
    unboundWorkspaceSkillCount: number;
    warningCount: number;
    syncStatus: 'ok' | 'warning';
  };
  runtimeNativeCapabilities: Array<{
    id: string;
    title: string;
    enabled: boolean;
    priority: number;
    available?: boolean;
    detail?: string;
    detectedPath?: string | null;
    source?: string;
  }>;
  availableSkills: Array<{
    id: string;
    name: string;
    scope: string;
    sourcePath: string;
    configPath: string;
    secretPath: string;
  }>;
  roleBoundSkills: Array<{
    id: string;
    name: string;
    scope: string;
    sourcePath: string;
    configPath: string;
    secretPath: string;
  }>;
  globalAvailableSkills: Array<{
    id: string;
    name: string;
    scope: string;
    sourcePath: string;
    configPath: string;
    secretPath: string;
  }>;
  runtimeMcpTools: Array<{
    id: string;
    name: string;
    transportType: string;
    scope: string;
  }>;
  invalidBindings: Array<{
    skillId: string;
    skillName: string;
    scope: string;
    reason: string;
  }>;
  unboundWorkspaceSkills: Array<{
    id: string;
    name: string;
    enabled: boolean;
    sourcePath: string;
  }>;
  warnings: string[];
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getRoleNotesRoot(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleRoot(userDataPath, roleKey), 'notes');
}

function getRoleSettingsViewPath(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleRoot(userDataPath, roleKey), 'role-settings.json');
}

export function syncRoleSettingsView(
  userDataPath: string,
  roleKey: AgentRoleKey,
  appConfig?: AppConfigLike | null,
): { roleKey: AgentRoleKey; path: string; payload: RoleSettingsViewFile } {
  // {路标} FLOW-RUNTIME-SETTINGS-VIEW
  // {FLOW} RUNTIME-SETTINGS-VIEW: 从 app_config 生成 roles/<role>/role-settings.json，只读视图，不是原始真相源。
  ensureRoleRuntimeDirs(userDataPath);
  ensureRoleNotesScaffold(userDataPath, roleKey);

  const roles = resolveAgentRolesFromConfig(appConfig);
  const nativeCapabilities = resolveNativeCapabilitiesConfigFromAppConfig(appConfig);
  const roleRoot = getRoleRoot(userDataPath, roleKey);
  const notesRoot = getRoleNotesRoot(userDataPath, roleKey);
  const settingsPath = getRoleSettingsViewPath(userDataPath, roleKey);
  const role = roles[roleKey];
  const officeProbe = probeOfficeFoundation(nativeCapabilities['office-native-addon']);
  const payload: RoleSettingsViewFile = {
    version: 1,
    role: roleKey,
    generatedAt: Date.now(),
    sources: {
      runtimeRoot: path.resolve(userDataPath),
      appConfigStore: 'uclaw.sqlite -> kv(key=\'app_config\')',
      appConfigPath: `app_config.agentRoles.${roleKey}`,
    },
    directories: {
      roleRoot,
      notesRoot,
      settingsPath,
      skillIndexPath: path.join(roleRoot, 'skills.json'),
      skillConfigsRoot: path.join(roleRoot, 'skill-configs'),
      skillSecretsRoot: path.join(roleRoot, 'skill-secrets'),
    },
    rules: {
      truthRule: '这个文件是角色设定只读视图，帮助排查与定位；真实设定当前仍以数据库 kv(app_config) 为准。',
      notesRule: 'notes/ 目录用于角色笔记与踩坑记录，不应冒充运行时真相。',
    },
    settings: {
      key: role.key,
      label: role.label,
      enabled: role.enabled,
      apiUrl: role.apiUrl,
      apiFormat: role.apiFormat,
      modelId: role.modelId,
      supportsImage: role.supportsImage,
      apiKeyConfigured: Boolean(role.apiKey),
      ready: Boolean(role.enabled && role.apiUrl && role.modelId),
      nativeCapabilities: Object.entries(nativeCapabilities).map(([id, entry]) => ({
        id,
        title: NATIVE_CAPABILITY_LABELS[id as keyof typeof NATIVE_CAPABILITY_LABELS]?.title ?? id,
        enabled: Boolean(entry.enabled && entry.roles[roleKey]),
        priority: entry.priority,
        available: id === 'office-native-addon' ? officeProbe.available : true,
        detail: id === 'office-native-addon' ? officeProbe.message : undefined,
        detectedPath: id === 'office-native-addon' ? officeProbe.resolvedPath : undefined,
        source: id === 'office-native-addon' ? officeProbe.source : undefined,
      })),
    },
  };

  fs.writeFileSync(settingsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { roleKey, path: settingsPath, payload };
}

export function getRoleCapabilitySnapshotPath(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleRoot(userDataPath, roleKey), 'role-capabilities.json');
}

export function getRoleNotesPath(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleNotesRoot(userDataPath, roleKey), 'role-notes.md');
}

export function getRolePitfallsPath(userDataPath: string, roleKey: AgentRoleKey): string {
  return path.join(getRoleNotesRoot(userDataPath, roleKey), 'pitfalls.md');
}

function buildRoleNotesReadme(roleKey: AgentRoleKey): string {
  return [
    `# ${AGENT_ROLE_LABELS[roleKey]} Notes`,
    '',
    '用途：',
    '- 放这个角色自己的说明、踩坑笔记、待核验事项。',
    '- 这里是项目内角色目录，不再把这类内容散落到项目外部运行路径。',
    '',
    '规则：',
    '- 这里是角色笔记目录，不是运行时真相源。',
    '- 真正运行时的角色模型/API设定仍以 uclaw.sqlite -> kv(app_config).agentRoles 为准。',
    '- 真正运行时的角色技能可见性仍以 skills.json 为准。',
    '',
  ].join('\n');
}

function ensureRoleNotesScaffold(userDataPath: string, roleKey: AgentRoleKey): void {
  const notesRoot = getRoleNotesRoot(userDataPath, roleKey);
  ensureDir(notesRoot);
  const readmePath = path.join(notesRoot, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, buildRoleNotesReadme(roleKey), 'utf8');
  }
  const roleNotesPath = getRoleNotesPath(userDataPath, roleKey);
  if (!fs.existsSync(roleNotesPath)) {
    fs.writeFileSync(roleNotesPath, '', 'utf8');
  }
  const pitfallsPath = getRolePitfallsPath(userDataPath, roleKey);
  if (!fs.existsSync(pitfallsPath)) {
    fs.writeFileSync(pitfallsPath, '', 'utf8');
  }
}

function readCount(result: any[]): number {
  return Number(result?.[0]?.values?.[0]?.[0] ?? 0);
}

function readAppConfigFromStore(
  store: {
    getDatabase(): { exec: (sql: string, params?: Array<string | number>) => any[] };
  }
): AppConfigLike | null {
  try {
    const result = store.getDatabase().exec(`SELECT value FROM kv WHERE key = ? LIMIT 1`, ['app_config']);
    const raw = String(result?.[0]?.values?.[0]?.[0] ?? '').trim();
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as AppConfigLike : null;
  } catch {
    return null;
  }
}

function readSkillBindings(
  store: { getDatabase(): { exec: (sql: string, params?: Array<string | number>) => any[] } },
  roleKey: AgentRoleKey
): Array<{ roleKey: string; skillId: string; skillName: string; enabled: boolean }> {
  const result = store.getDatabase().exec(
    `SELECT role_key, skill_id, skill_name, enabled
     FROM skill_role_configs
     WHERE enabled = 1 AND (role_key = ? OR role_key = ?)
     ORDER BY installed_at ASC`,
    [roleKey, 'all'],
  );

  if (!result.length || !result[0].values.length) {
    return [];
  }

  return result[0].values.map((row) => ({
    roleKey: String(row[0] ?? ''),
    skillId: String(row[1] ?? ''),
    skillName: String(row[2] ?? ''),
    enabled: Number(row[3] ?? 0) === 1,
  }));
}

function readRoleSkillIndex(filePath: string): RoleSkillIndexFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RoleSkillIndexFile;
  } catch {
    return null;
  }
}

export function syncRoleCapabilitySnapshot(
  userDataPath: string,
  roleKey: AgentRoleKey,
  store: {
    getDatabase(): {
      exec: (sql: string, params?: Array<string | number>) => any[];
      run: (sql: string, params?: Array<string | number>) => void;
    };
    getSaveFunction(): () => void;
  },
  skillManager: Pick<SkillManager, 'getSkillsRoot'>,
  mcpStore: Pick<McpStore, 'getRuntimeEnabledServers'>
): { roleKey: AgentRoleKey; path: string; snapshot: RoleCapabilitySnapshotFile } {
  // {路标} FLOW-RUNTIME-CAPABILITY-SNAPSHOT
  // {FLOW} RUNTIME-CAPABILITY-SNAPSHOT: 汇总 skill bindings、skills.json、runtime MCP、native capabilities，生成 role-capabilities.json。
  // {标记} ROLE-CAPABILITY-SNAPSHOT-TRUTH: 小 agent 房间里“当前真的可调用什么”，最终以 role-capabilities.json 的 availableSkills / runtimeMcpTools / runtimeNativeCapabilities 为准。
  ensureRoleRuntimeDirs(userDataPath);
  const roleRoot = getRoleRoot(userDataPath, roleKey);
  const nativeCapabilities = resolveNativeCapabilitiesConfigFromAppConfig(readAppConfigFromStore(store));
  const capabilitySnapshotPath = getRoleCapabilitySnapshotPath(userDataPath, roleKey);
  const skillsIndexPath = getRoleSkillsIndexPath(userDataPath, roleKey);
  const runtimeSkillsRoot = skillManager.getSkillsRoot();
  const projectSkillsRoot = path.join(getProjectRoot(), 'SKILLs');
  const roleIndex = readRoleSkillIndex(skillsIndexPath);
  const configuredBindings = readSkillBindings(store, roleKey);
  const indexedSkills = (roleIndex?.skills ?? []).map((skill) => ({
    id: skill.id,
    name: skill.name,
    scope: skill.scope,
    sourcePath: skill.sourcePath,
    configPath: skill.configPath,
    secretPath: skill.secretPath,
  }));
  const globalAvailableSkills = indexedSkills.filter((skill) => skill.scope === 'all');
  const roleBoundSkills = indexedSkills.filter((skill) => skill.scope !== 'all');
  const availableSkills = [...roleBoundSkills, ...globalAvailableSkills];
  const indexedSkillIds = new Set(indexedSkills.map((skill) => skill.id));
  const runtimeMcpTools = mcpStore.getRuntimeEnabledServers(roleKey).map((server) => ({
    id: server.id,
    name: server.name,
    transportType: server.transportType,
    scope: server.agentRoleKey,
  }));
  const officeProbe = probeOfficeFoundation(nativeCapabilities['office-native-addon']);
  const invalidBindings = roleIndex
    ? configuredBindings
      .filter((binding) => !indexedSkillIds.has(binding.skillId))
      .map((binding) => ({
        skillId: binding.skillId,
        skillName: binding.skillName,
        scope: binding.roleKey,
        reason: '数据库绑定存在，但角色技能索引里没有对应项；需要显式同步绑定链。',
      }))
    : [];
  const unboundWorkspaceSkills: RoleCapabilitySnapshotFile['unboundWorkspaceSkills'] = [];

  const db = store.getDatabase();
  const configuredSkillBindings = configuredBindings.length;

  const warnings: string[] = [];
  if (!roleIndex) {
    warnings.push('角色技能索引文件缺失或无法解析，当前角色可见技能视图不可信。');
  }
  if (configuredSkillBindings > 0 && indexedSkills.length === 0) {
    warnings.push('数据库里存在技能绑定，但角色最终 skills.json 仍为空，说明索引同步链路未落地。');
  }
  for (const binding of invalidBindings) {
    warnings.push(`无效技能绑定：${binding.skillId}（${binding.scope}）在运行时技能仓库中不存在有效 SKILL.md。`);
  }
  for (const skill of indexedSkills) {
    if (!fs.existsSync(skill.sourcePath)) {
      warnings.push(`已绑定技能缺少源文件：${skill.id}`);
    }
  }

  const runtimeNativeCapabilities = Object.entries(nativeCapabilities)
    .filter(([, entry]) => entry.enabled && entry.roles[roleKey])
    .map(([id, entry]) => {
      const isOffice = id === 'office-native-addon';
      const available = isOffice ? officeProbe.available : true;
      if (isOffice && !available) {
        warnings.push(`Office 轻通道已为当前角色启用，但当前没有发现专用 Office 可执行文件。${officeProbe.message}`);
      }
      if (isOffice && available) {
        warnings.push(`Office 轻通道已探测到专用 Office 可执行文件（${officeProbe.resolvedPath}），但当前只完成了安全探测与配置层接入，尚未桥接执行器，因此不会进入 runtimeNativeCapabilities。`);
      }
      return {
        id,
        title: NATIVE_CAPABILITY_LABELS[id as keyof typeof NATIVE_CAPABILITY_LABELS]?.title ?? id,
        enabled: true,
        priority: entry.priority,
        available,
        detail: isOffice ? officeProbe.message : undefined,
        detectedPath: isOffice ? officeProbe.resolvedPath : undefined,
        source: isOffice ? officeProbe.source : undefined,
      };
    })
    .filter((entry) => entry.id !== 'office-native-addon' && entry.available !== false);

  const snapshot: RoleCapabilitySnapshotFile = {
    version: 1,
    role: roleKey,
    generatedAt: Date.now(),
    paths: {
      runtimeRoot: path.resolve(userDataPath),
      roleRoot,
      capabilitySnapshotPath,
      skillsIndexPath,
      skillConfigsRoot: getRoleSkillConfigsRoot(userDataPath, roleKey),
      skillSecretsRoot: getRoleSkillSecretsRoot(userDataPath, roleKey),
      runtimeSkillsRoot,
      projectSkillsRoot,
    },
    rules: {
      // {标记} P0-ROOM-DOORPLATE-TRUTH: 房间门牌里的可调用能力必须唯一、可检索、可复核；不能让仓库候选和当前能力混成一层。
      truthRule: 'agent 只应把 roles/<role>/skills.json / availableSkills 与当前 runtime MCP 列表视为最终可用结果。',
      warehouseRule: 'SKILLs/ 仓库只负责存放候选技能；默认能力快照不会主动扫描仓库候选层。',
      visibilityRule: '目录负责存放，配置负责声明，角色索引负责生效；默认可用 = 角色绑定 + 全局可用(all)。',
      warehouseOnlyRule: '`unboundWorkspaceSkills` 只有在显式诊断链里才应出现；默认运行态能力快照不把仓库候选混进来。',
    },
    summary: {
      availableSkillCount: availableSkills.length,
      runtimeMcpCount: runtimeMcpTools.length,
      nativeCapabilityCount: runtimeNativeCapabilities.length,
      unboundWorkspaceSkillCount: unboundWorkspaceSkills.length,
      warningCount: warnings.length,
      syncStatus: warnings.length > 0 ? 'warning' : 'ok',
    },
    runtimeNativeCapabilities,
    availableSkills,
    roleBoundSkills,
    globalAvailableSkills,
    runtimeMcpTools,
    invalidBindings,
    unboundWorkspaceSkills,
    warnings,
  };

  fs.writeFileSync(capabilitySnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return {
    roleKey,
    path: capabilitySnapshotPath,
    snapshot,
  };
}

export function syncRoleCapabilitySnapshots(
  userDataPath: string,
  store: {
    getDatabase(): {
      exec: (sql: string, params?: Array<string | number>) => any[];
      run: (sql: string, params?: Array<string | number>) => void;
    };
    getSaveFunction(): () => void;
  },
  skillManager: Pick<SkillManager, 'listSkills' | 'getSkillsRoot'>,
  mcpStore: Pick<McpStore, 'getRuntimeEnabledServers'>
): Array<{ roleKey: AgentRoleKey; path: string }> {
  return AGENT_ROLE_ORDER.map((roleKey) => {
    const result = syncRoleCapabilitySnapshot(userDataPath, roleKey, store, skillManager, mcpStore);
    return { roleKey, path: result.path };
  });
}

export function syncRoleSettingsViews(
  userDataPath: string,
  appConfig?: AppConfigLike | null,
): Array<{ roleKey: AgentRoleKey; path: string }> {
  ensureRoleRuntimeDirs(userDataPath);
  const results: Array<{ roleKey: AgentRoleKey; path: string }> = [];

  for (const roleKey of AGENT_ROLE_ORDER) {
    const result = syncRoleSettingsView(userDataPath, roleKey, appConfig);
    results.push({ roleKey: result.roleKey, path: result.path });
  }

  return results;
}

export function readRoleRuntimeNotes(userDataPath: string, roleKey: AgentRoleKey): {
  notesRoot: string;
  roleNotesPath: string;
  pitfallsPath: string;
  roleNotes: string;
  pitfalls: string;
} {
  ensureRoleNotesScaffold(userDataPath, roleKey);
  const notesRoot = getRoleNotesRoot(userDataPath, roleKey);
  const roleNotesPath = getRoleNotesPath(userDataPath, roleKey);
  const pitfallsPath = getRolePitfallsPath(userDataPath, roleKey);
  return {
    notesRoot,
    roleNotesPath,
    pitfallsPath,
    roleNotes: fs.readFileSync(roleNotesPath, 'utf8'),
    pitfalls: fs.readFileSync(pitfallsPath, 'utf8'),
  };
}

export function writeRoleRuntimeNotes(
  userDataPath: string,
  roleKey: AgentRoleKey,
  payload: {
    roleNotes?: string;
    pitfalls?: string;
  },
): {
  notesRoot: string;
  roleNotesPath: string;
  pitfallsPath: string;
} {
  ensureRoleNotesScaffold(userDataPath, roleKey);
  const notesRoot = getRoleNotesRoot(userDataPath, roleKey);
  const roleNotesPath = getRoleNotesPath(userDataPath, roleKey);
  const pitfallsPath = getRolePitfallsPath(userDataPath, roleKey);

  if (typeof payload.roleNotes === 'string') {
    fs.writeFileSync(roleNotesPath, payload.roleNotes, 'utf8');
  }
  if (typeof payload.pitfalls === 'string') {
    fs.writeFileSync(pitfallsPath, payload.pitfalls, 'utf8');
  }

  return {
    notesRoot,
    roleNotesPath,
    pitfallsPath,
  };
}
