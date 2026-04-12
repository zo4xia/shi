import { Skill, MarketplaceSkill, MarketTag, LocalizedText, UploadedSkillPayload } from '../types/skill';

// {路标} FLOW-SERVICE-SKILL
// {FLOW} SKILL-SERVICE-TRUNK: 前端技能主链分三段——技能仓库、角色绑定、角色运行态；排错时不要把三层混成一层。

export interface SkillRoleConfigEntry {
  id: string;
  roleKey: string;
  skillId: string;
  skillName: string;
  prefix: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: number;
  updatedAt: number;
}

export interface RoleSkillSecretsMeta {
  path?: string;
  fields: string[];
  hasSecrets: boolean;
}

export interface RoleSkillIndexEntry {
  id: string;
  name: string;
  scope: string;
  enabled: boolean;
  sourcePath: string;
  sourceDir: string;
  configPath: string;
  secretPath: string;
  installedAt: number;
  updatedAt: number;
}

export interface RoleSkillIndexFile {
  version: number;
  role: string;
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
}

export interface RoleCapabilityBoundSkillEntry {
  id: string;
  name: string;
  scope: string;
  sourcePath: string;
  configPath: string;
  secretPath: string;
}

export interface RoleCapabilitySnapshotFile {
  version: number;
  role: string;
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
  }>;
  availableSkills: RoleCapabilityBoundSkillEntry[];
  roleBoundSkills: RoleCapabilityBoundSkillEntry[];
  globalAvailableSkills: RoleCapabilityBoundSkillEntry[];
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
}

export interface RoleRuntimePayload {
  success: boolean;
  roleKey: string;
  paths?: {
    roleRoot: string;
    settingsPath: string;
    capabilitySnapshotPath: string;
    skillsIndexPath: string;
    skillConfigsRoot: string;
    skillSecretsRoot: string;
    notesRoot: string;
    roleNotesPath: string;
    pitfallsPath: string;
  };
  settingsView?: unknown;
  notes?: {
    roleNotes: string;
    pitfalls: string;
  };
  capabilitySnapshot?: RoleCapabilitySnapshotFile;
  health?: {
    ready: boolean;
    enabled: boolean;
    apiKeyConfigured: boolean;
    capabilitySyncStatus: 'ok' | 'warning';
    capabilityWarnings: string[];
    runtimeFileWarnings: string[];
    runtimeFileChecks: unknown[];
    invalidSkillBindings: unknown[];
    truthSources: {
      roleSettings: string;
      roleSettingsPath: string;
      skillsIndex: string;
      capabilitySnapshot: string;
    };
  };
  summary?: {
    sessionsTotal?: number;
    runningSessions?: number;
    lastSessionAt?: number | null;
    tasksTotal?: number;
    enabledTasks?: number;
    runningTasks?: number;
    taskErrors?: number;
    skillBindings: number;
    mcpBindings: number;
    invalidSkillBindings: number;
    memories?: number;
    capabilityWarnings: number;
    runtimeFileWarnings?: number;
  };
}

export function resolveLocalizedText(text: string | LocalizedText): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  const lang = 'zh';
  return text[lang] || text.en || '';
}

type EmailConnectivityCheck = {
  code: 'imap_connection' | 'smtp_connection';
  level: 'pass' | 'fail';
  message: string;
  durationMs: number;
};

type EmailConnectivityTestResult = {
  testedAt: number;
  verdict: 'pass' | 'fail';
  checks: EmailConnectivityCheck[];
};

class SkillService {
  private skills: Skill[] = [];
  private initialized = false;
  private localSkillDescriptions: Map<string, string | LocalizedText> = new Map();
  private marketplaceSkillDescriptions: Map<string, string | LocalizedText> = new Map();

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loadSkills();
    this.initialized = true;
  }

  async loadSkills(): Promise<Skill[]> {
    const skillsApi = window.electron?.skills;
    if (!skillsApi) {
      this.skills = [];
      return this.skills;
    }

    try {
      const result = await skillsApi.list();
      if (result.success && result.skills) {
        this.skills = result.skills;
      } else {
        this.skills = [];
      }
      return this.skills;
    } catch (error) {
      console.error('Failed to load skills:', error);
      this.skills = [];
      return this.skills;
    }
  }

  async setSkillEnabled(id: string, enabled: boolean): Promise<Skill[]> {
    try {
      const result = await window.electron.skills.setEnabled({ id, enabled });
      if (result.success && result.skills) {
        this.skills = result.skills;
        return this.skills;
      }
      throw new Error(result.error || 'Failed to update skill');
    } catch (error) {
      console.error('Failed to update skill:', error);
      throw error;
    }
  }

  async updateSkillMetadata(id: string, input: { category?: string }): Promise<Skill[]> {
    try {
      const result = await window.electron.skills.updateMetadata(id, input);
      if (result.success && result.skills) {
        this.skills = result.skills;
        return this.skills;
      }
      throw new Error(result.error || 'Failed to update skill metadata');
    } catch (error) {
      console.error('Failed to update skill metadata:', error);
      throw error;
    }
  }

  async deleteSkill(id: string): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    try {
      const result = await window.electron.skills.delete(id);
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete skill';
      console.error('Failed to delete skill:', error);
      return { success: false, error: message };
    }
  }

  async downloadSkill(source: string, displayName?: string): Promise<{ success: boolean; skills?: Skill[]; importedSkills?: Skill[]; error?: string }> {
    try {
      const result = await window.electron.skills.download({ source, displayName });
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download skill';
      console.error('Failed to download skill:', error);
      return { success: false, error: message };
    }
  }

  async importUploadedSkill(payload: UploadedSkillPayload): Promise<{ success: boolean; skills?: Skill[]; importedSkills?: Skill[]; error?: string }> {
    try {
      const result = await window.electron.skills.importUpload(payload);
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import uploaded skill';
      console.error('Failed to import uploaded skill:', error);
      return { success: false, error: message };
    }
  }

  async getSkillsRoot(): Promise<string | null> {
    try {
      const result = await window.electron.skills.getRoot();
      if (result.success && result.path) {
        return result.path;
      }
      return null;
    } catch (error) {
      console.error('Failed to get skills root:', error);
      return null;
    }
  }

  onSkillsChanged(callback: () => void): () => void {
    const skillsApi = window.electron?.skills;
    if (!skillsApi) {
      return () => {};
    }
    return skillsApi.onChanged(callback);
  }

  getSkills(): Skill[] {
    return this.skills;
  }

  getEnabledSkills(): Skill[] {
    return this.skills.filter(s => s.enabled);
  }

  getSkillById(id: string): Skill | undefined {
    return this.skills.find(s => s.id === id);
  }

  async getSkillConfig(skillId: string): Promise<Record<string, string>> {
    try {
      const result = await window.electron.skills.getConfig(skillId);
      if (result.success && result.config) {
        return result.config;
      }
      return {};
    } catch (error) {
      console.error('Failed to get skill config:', error);
      return {};
    }
  }

  async setSkillConfig(skillId: string, config: Record<string, string>): Promise<boolean> {
    try {
      const result = await window.electron.skills.setConfig(skillId, config);
      return result.success;
    } catch (error) {
      console.error('Failed to set skill config:', error);
      return false;
    }
  }

  async testEmailConnectivity(
    skillId: string,
    config: Record<string, string>
  ): Promise<EmailConnectivityTestResult | null> {
    try {
      const result = await window.electron.skills.testEmailConnectivity(skillId, config);
      if (result.success && result.result) {
        return result.result;
      }
      return null;
    } catch (error) {
      console.error('Failed to test email connectivity:', error);
      return null;
    }
  }

  async getAutoRoutingPrompt(): Promise<string | null> {
    try {
      const result = await window.electron.skills.autoRoutingPrompt();
      return result.success ? (result.prompt || null) : null;
    } catch (error) {
      console.error('Failed to get auto-routing prompt:', error);
      return null;
    }
  }
  async fetchMarketplaceSkills(): Promise<{ skills: MarketplaceSkill[]; tags: MarketTag[] }> {
    try {
      // Use backend proxy to avoid CORS issues in web build
      const result = await window.electron.skills.fetchMarketplace();
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch marketplace');
      }
      // Backend returns: { success, data: { marketplace, marketTags } }
      // After unwrap in electronShim, result IS the data object directly
      const raw = result as any;
      // unwrap flattens: result = { success, marketplace, marketTags } OR result = { success, data: { marketplace, marketTags } }
      const value = raw?.data?.marketplace ? raw.data : raw;
      const skills: MarketplaceSkill[] = Array.isArray(value?.marketplace) ? value.marketplace : [];
      const tags: MarketTag[] = Array.isArray(value?.marketTags) ? value.marketTags : [];
      // Store marketplace skill descriptions for i18n lookup (keyed by id)
      this.marketplaceSkillDescriptions.clear();
      for (const ms of skills) {
        if (typeof ms.description === 'object') {
          this.marketplaceSkillDescriptions.set(ms.id, ms.description);
        }
      }
      return { skills, tags };
    } catch (error) {
      console.error('Failed to fetch marketplace skills:', error);
      return { skills: [], tags: [] };
    }
  }

  getLocalizedSkillDescription(skillId: string, skillName: string, fallback: string): string {
    const localDesc = this.localSkillDescriptions.get(skillName);
    if (localDesc != null) return resolveLocalizedText(localDesc);
    const marketDesc = this.marketplaceSkillDescriptions.get(skillId);
    if (marketDesc != null) return resolveLocalizedText(marketDesc);
    return fallback;
  }

  // ---- Skill Role Configs (identity-scoped) ----

  async listRoleConfigs(roleKey: string): Promise<SkillRoleConfigEntry[]> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return [];
      const result = await api.list(roleKey);
      return result.success && result.configs ? result.configs : [];
    } catch (error) {
      console.error('Failed to list role configs:', error);
      return [];
    }
  }

  async listAllRoleConfigs(): Promise<SkillRoleConfigEntry[]> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return [];
      const result = await api.listAll();
      return result.success && result.configs ? result.configs : [];
    } catch (error) {
      console.error('Failed to list all role configs:', error);
      return [];
    }
  }

  async installSkillForRole(input: { roleKey: string; skillId: string; skillName: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return { success: false, error: 'API not available' };
      const result = await api.install(input);
      return { success: result.success, error: result.error };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to install skill for role';
      console.error(msg, error);
      return { success: false, error: msg };
    }
  }

  async batchInstallSkillForRoles(data: { skillId: string; skillName: string; roleKeys: string[] }): Promise<{ success: boolean; error?: string }> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return { success: false, error: 'API not available' };
      const result = await api.batchInstall(data);
      return { success: result.success, error: result.error };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to batch install skill';
      console.error(msg, error);
      return { success: false, error: msg };
    }
  }

  async removeRoleConfig(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return { success: false, error: 'API not available' };
      return await api.remove(id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to remove role config';
      console.error(msg, error);
      return { success: false, error: msg };
    }
  }

  async updateRoleConfig(id: string, data: { enabled?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return { success: false, error: 'API not available' };
      return await api.update(id, data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update role config';
      console.error(msg, error);
      return { success: false, error: msg };
    }
  }

  async getRoleSkillIndex(roleKey: string): Promise<RoleSkillIndexFile | null> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return null;
      const result = await api.getRoleIndex(roleKey);
      return result.success ? ((result.index as RoleSkillIndexFile | undefined) ?? null) : null;
    } catch (error) {
      console.error('Failed to get role skill index:', error);
      return null;
    }
  }

  async getRoleSkillConfig(roleKey: string, skillId: string): Promise<Record<string, string>> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return {};
      const result = await api.getRoleSkillConfig(roleKey, skillId);
      return result.success && result.config ? result.config : {};
    } catch (error) {
      console.error('Failed to get role skill config:', error);
      return {};
    }
  }

  async setRoleSkillConfig(roleKey: string, skillId: string, config: Record<string, string>): Promise<boolean> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return false;
      const result = await api.setRoleSkillConfig(roleKey, skillId, config);
      return result.success;
    } catch (error) {
      console.error('Failed to set role skill config:', error);
      return false;
    }
  }

  async getRoleSkillSecretsMeta(roleKey: string, skillId: string): Promise<RoleSkillSecretsMeta | null> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return null;
      const result = await api.getRoleSkillSecretMeta(roleKey, skillId);
      if (!result.success) return null;
      return {
        path: result.path,
        fields: result.fields ?? [],
        hasSecrets: Boolean(result.hasSecrets),
      };
    } catch (error) {
      console.error('Failed to get role skill secret meta:', error);
      return null;
    }
  }

  async setRoleSkillSecrets(roleKey: string, skillId: string, secrets: Record<string, string>): Promise<boolean> {
    try {
      const api = window.electron?.skillRoleConfigs;
      if (!api) return false;
      const result = await api.setRoleSkillSecrets(roleKey, skillId, secrets);
      return result.success;
    } catch (error) {
      console.error('Failed to set role skill secrets:', error);
      return false;
    }
  }

  async getRoleRuntime(roleKey: string): Promise<RoleRuntimePayload | null> {
    // {路标} FLOW-SERVICE-SKILL-RUNTIME
    // {FLOW} SKILL-RUNTIME-SNAPSHOT: 角色运行态快照当前直接走 /api/role-runtime/:roleKey，不经过 window.electron.skillRoleConfigs。
    // {标记} ROLE-RUNTIME-RENDER-SOURCE: 前端房间/技能/MCP 相关展示统一从 /api/role-runtime/:roleKey 取数，不要各自拼第二套来源。
    try {
      const response = await fetch(`/api/role-runtime/${encodeURIComponent(roleKey)}`);
      const raw = await response.text();
      if (!response.ok) {
        if (raw.trim()) {
          console.warn(`Failed to get role runtime (${response.status}):`, raw.slice(0, 300));
        }
        return null;
      }
      if (!raw.trim()) {
        return null;
      }
      const payload = JSON.parse(raw);
      if (!payload?.success) {
        return null;
      }
      return payload as RoleRuntimePayload;
    } catch (error) {
      console.error('Failed to get role runtime:', error);
      return null;
    }
  }
}

export const skillService = new SkillService();
