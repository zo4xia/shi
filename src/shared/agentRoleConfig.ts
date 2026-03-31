/**
 * {标记} 功能: 4身份Agent配置系统
 * {标记} 来源: 二开需求总表#2.2
 * {标记} 用途: 统一选模型为选身份，支持organizer/writer/designer/analyst四个固定角色槽位
 * {标记} 集成: Settings.tsx#2700-2764 / CoworkRunner / IM路由
 * {标记} 状态: 源代码完整✅ / 共享线程逻辑缺失❌ / 跨渠道一体化缺失❌
 */

import type { SkillsMcpAssistantHelpersConfig } from './skillsMcpAssistantConfig';
import type { NativeCapabilitiesConfig } from './nativeCapabilities/config';

export type CompatibleApiFormat = 'anthropic' | 'openai';
export type DesignerImageApiType = 'generic' | 'images' | 'seedream2' | 'sora' | 'veo' | 'google';
export type SupportedDesignerImageApiType = 'generic' | 'images' | 'google';
export type AgentRoleKey = 'organizer' | 'writer' | 'designer' | 'analyst';

export interface AgentRoleConfigEntry {
  key: AgentRoleKey;
  label: string;
  avatar?: string;
  description: string;
  recommendation: string;
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiFormat: CompatibleApiFormat;
  imageApiType: DesignerImageApiType;
  supportsImage: boolean;
  enabled: boolean;
}

export type AgentRoleConfigMap = Record<AgentRoleKey, AgentRoleConfigEntry>;

export type AppConfigLike = {
  api?: {
    key?: string;
    baseUrl?: string;
  };
  model?: {
    defaultModel?: string;
    defaultModelProvider?: string;
  };
  providers?: Record<string, {
    enabled?: boolean;
    apiKey?: string;
    baseUrl?: string;
    apiFormat?: CompatibleApiFormat;
    models?: Array<{
      id: string;
      name?: string;
      supportsImage?: boolean;
    }>;
  }>;
  agentRoles?: Partial<Record<AgentRoleKey, Partial<AgentRoleConfigEntry>>>;
  conversationFileCache?: {
    directory?: string;
    autoBackupDaily?: boolean;
  };
  dailyMemory?: {
    enabled?: boolean;
    apiUrl?: string;
    apiKey?: string;
    modelId?: string;
    apiFormat?: CompatibleApiFormat;
  };
  helpers?: SkillsMcpAssistantHelpersConfig;
  nativeCapabilities?: Partial<NativeCapabilitiesConfig>;
};

export const AGENT_ROLE_ORDER: AgentRoleKey[] = ['organizer', 'writer', 'designer', 'analyst'];

const AGENT_ROLE_META: Record<AgentRoleKey, Pick<AgentRoleConfigEntry, 'label' | 'description' | 'recommendation' | 'supportsImage'>> = {
  organizer: {
    label: '浏览器助手',
    description: '擅长使用工具，信息收集等，全面小帮手',
    recommendation: '必须支持tool能力',
    supportsImage: false,
  },
  writer: {
    label: '文字撰写员',
    description: '负责文稿撰写、整理、润色',
    recommendation: '推荐善于写作、总结、改写',
    supportsImage: false,
  },
  designer: {
    label: '美术编辑师',
    description: '负责视觉理解、图片整理、图文表达',
    recommendation: '当前主链建议使用支持图片输入理解的模型；图片或视频生成需额外能力',
    supportsImage: true,
  },
  analyst: {
    label: '数据分析师',
    description: '负责结构化分析、对比、推演',
    recommendation: '推荐善于分析、推理、表格处理',
    supportsImage: false,
  },
};

/** 角色完整标签 (从 AGENT_ROLE_META 动态生成) */
export const AGENT_ROLE_LABELS: Record<AgentRoleKey, string> = AGENT_ROLE_ORDER.reduce((m, k) => {
  m[k] = AGENT_ROLE_META[k].label;
  return m;
}, {} as Record<AgentRoleKey, string>);

/** 角色短标签 — 用于 badge / pill 等空间紧凑的场景 */
export const AGENT_ROLE_SHORT_LABELS: Record<string, string> = {
  organizer: '浏览器',
  writer: '撰写',
  designer: '设计',
  analyst: '分析',
  all: '全部',
};

/** 角色图标 */
export const AGENT_ROLE_ICONS: Record<AgentRoleKey, string> = {
  organizer: '🌐',
  writer: '✍️',
  designer: '🎨',
  analyst: '📊',
};

export const DESIGNER_IMAGE_API_TYPE_OPTIONS: Array<{ value: SupportedDesignerImageApiType; label: string }> = [
  { value: 'generic', label: '通用 Chat Completions (/v1/chat/completions)' },
  { value: 'images', label: 'Images API (/v1/images/generations)' },
  { value: 'google', label: 'Google Generate Content' },
];

export const CONFIRMED_DESIGNER_IMAGE_MODEL_HINTS: Array<{
  apiType: SupportedDesignerImageApiType;
  label: string;
}> = [
  { apiType: 'generic', label: 'gpt-image-1-all' },
  { apiType: 'images', label: 'qwen-image-max' },
  { apiType: 'images', label: 'gpt-image-1.5' },
  { apiType: 'images', label: 'doubao-seedream-*' },
];

export function resolveSupportedDesignerImageApiType(
  value: string | null | undefined
): SupportedDesignerImageApiType {
  if (value === 'images') {
    return 'images';
  }
  if (value === 'google') {
    return 'google';
  }
  return 'generic';
}

export function getDesignerImageApiTypeOptions(
  currentValue?: string | null
): Array<{ value: string; label: string }> {
  const options = DESIGNER_IMAGE_API_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  if (!currentValue?.trim()) {
    return options;
  }

  const normalizedValue = currentValue.trim();
  if (options.some((option) => option.value === normalizedValue)) {
    return options;
  }

  return [
    ...options,
    { value: normalizedValue, label: `${normalizedValue}（旧值，可疑1）` },
  ];
}

const roleProviderKeys = new Set<AgentRoleKey>(AGENT_ROLE_ORDER);

export function splitApiKeys(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const sharedApiKeyCursor = new Map<string, number>();

export function pickNextApiKey(raw: string, slotKey: string, cursorStore: Map<string, number> = sharedApiKeyCursor): string {
  const keys = splitApiKeys(raw);
  if (keys.length === 0) {
    return '';
  }
  const currentIndex = cursorStore.get(slotKey) ?? 0;
  const selected = keys[currentIndex % keys.length];
  cursorStore.set(slotKey, (currentIndex + 1) % keys.length);
  return selected;
}

export function createDefaultAgentRoles(): AgentRoleConfigMap {
  return AGENT_ROLE_ORDER.reduce((result, key) => {
    const meta = AGENT_ROLE_META[key];
    result[key] = {
      key,
      label: meta.label,
      avatar: AGENT_ROLE_ICONS[key],
      description: meta.description,
      recommendation: meta.recommendation,
      apiUrl: '',
      apiKey: '',
      modelId: '',
      apiFormat: 'openai',
      imageApiType: 'generic',
      supportsImage: meta.supportsImage,
      enabled: false,
    };
    return result;
  }, {} as AgentRoleConfigMap);
}

export function normalizeAgentRolesForSave(roles: AgentRoleConfigMap): AgentRoleConfigMap {
  return AGENT_ROLE_ORDER.reduce((result, key) => {
    const role = roles[key];
    result[key] = {
      ...role,
      label: role.label.trim() || AGENT_ROLE_LABELS[key],
      avatar: role.avatar?.trim() || AGENT_ROLE_ICONS[key],
      apiUrl: role.apiUrl.trim().replace(/\/+$/, ''),
      apiKey: role.apiKey.trim(),
      modelId: role.modelId.trim(),
    };
    return result;
  }, {} as AgentRoleConfigMap);
}

export function findPrimaryAgentRole(
  roles: AgentRoleConfigMap,
  preferredKey?: AgentRoleKey
): AgentRoleConfigEntry | null {
  const normalizedRoles = normalizeAgentRolesForSave(roles);
  const configuredRole = AGENT_ROLE_ORDER
    .map((key) => normalizedRoles[key])
    .find((role) => role.enabled && Boolean(role.apiUrl) && Boolean(role.modelId));

  if (configuredRole) {
    return configuredRole;
  }

  if (preferredKey) {
    const preferredRole = normalizedRoles[preferredKey];
    if (preferredRole && (preferredRole.apiUrl || preferredRole.apiKey || preferredRole.modelId)) {
      return preferredRole;
    }
    return null;
  }

  const firstRole = normalizedRoles[AGENT_ROLE_ORDER[0]];
  if (firstRole && (firstRole.apiUrl || firstRole.apiKey || firstRole.modelId)) {
    return firstRole;
  }
  return null;
}

function inferApiFormat(config: AppConfigLike): CompatibleApiFormat {
  const preferredProvider = config.model?.defaultModelProvider;
  const explicitFormat = preferredProvider ? config.providers?.[preferredProvider]?.apiFormat : undefined;
  if (explicitFormat === 'anthropic') {
    return 'anthropic';
  }
  return explicitFormat === 'openai' ? 'openai' : 'openai';
}

function getSeedProvider(config: AppConfigLike): {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiFormat: CompatibleApiFormat;
  enabled: boolean;
  supportsImage: boolean;
} {
  const preferredProvider = config.model?.defaultModelProvider;
  const providerConfig = preferredProvider ? config.providers?.[preferredProvider] : undefined;
  const providerModel = providerConfig?.models?.find((model) => model.id === config.model?.defaultModel) ?? providerConfig?.models?.[0];
  const apiUrl = providerConfig?.baseUrl ?? config.api?.baseUrl ?? '';
  const apiKey = providerConfig?.apiKey ?? config.api?.key ?? '';
  const modelId = providerModel?.id ?? config.model?.defaultModel ?? '';
  const apiFormat = providerConfig?.apiFormat ?? inferApiFormat(config);
  return {
    apiUrl,
    apiKey,
    modelId,
    apiFormat,
    enabled: Boolean(apiUrl && modelId),
    supportsImage: Boolean(providerModel?.supportsImage),
  };
}

export function resolveAgentRolesFromConfig(config?: AppConfigLike | null): AgentRoleConfigMap {
  const defaults = createDefaultAgentRoles();
  if (!config) {
    return defaults;
  }

  const seed = getSeedProvider(config);
  for (const key of AGENT_ROLE_ORDER) {
    defaults[key] = {
      ...defaults[key],
      apiUrl: seed.apiUrl,
      apiKey: seed.apiKey,
      modelId: seed.modelId,
      apiFormat: seed.apiFormat,
      enabled: seed.enabled,
      supportsImage: key === 'designer' ? true : seed.supportsImage,
    };
  }

  for (const key of AGENT_ROLE_ORDER) {
    const providerConfig = config.providers?.[key];
    if (providerConfig) {
      defaults[key] = {
        ...defaults[key],
        apiUrl: providerConfig.baseUrl ?? defaults[key].apiUrl,
        apiKey: providerConfig.apiKey ?? defaults[key].apiKey,
        modelId: providerConfig.models?.[0]?.id ?? defaults[key].modelId,
        apiFormat: providerConfig.apiFormat ?? defaults[key].apiFormat,
        supportsImage: providerConfig.models?.[0]?.supportsImage ?? defaults[key].supportsImage,
        enabled: providerConfig.enabled ?? defaults[key].enabled,
      };
    }

    const explicitRole = config.agentRoles?.[key];
    if (explicitRole) {
      defaults[key] = {
        ...defaults[key],
        ...explicitRole,
        key,
        label: explicitRole.label ?? defaults[key].label,
        avatar: explicitRole.avatar ?? defaults[key].avatar,
        description: defaults[key].description,
        recommendation: defaults[key].recommendation,
        apiUrl: explicitRole.apiUrl ?? defaults[key].apiUrl,
        apiKey: explicitRole.apiKey ?? defaults[key].apiKey,
        modelId: explicitRole.modelId ?? defaults[key].modelId,
        apiFormat: explicitRole.apiFormat ?? defaults[key].apiFormat,
        imageApiType: explicitRole.imageApiType ?? defaults[key].imageApiType,
        supportsImage: explicitRole.supportsImage ?? defaults[key].supportsImage,
        enabled: explicitRole.enabled ?? defaults[key].enabled,
      };
    }
  }

  return defaults;
}

export function buildProviderConfigsFromAgentRoles(roles: AgentRoleConfigMap): Record<string, {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiFormat: CompatibleApiFormat;
  models: Array<{ id: string; name: string; supportsImage?: boolean }>;
}> {
  const normalizedRoles = normalizeAgentRolesForSave(roles);

  return AGENT_ROLE_ORDER.reduce((result, key) => {
    const role = normalizedRoles[key];
    result[key] = {
      enabled: role.enabled && Boolean(role.apiUrl.trim()) && Boolean(role.modelId.trim()),
      apiKey: role.apiKey,
      baseUrl: role.apiUrl.trim(),
      apiFormat: role.apiFormat,
      models: role.modelId.trim()
        ? [{ id: role.modelId.trim(), name: role.label, supportsImage: role.supportsImage }]
        : [],
    };
    return result;
  }, {} as Record<string, {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    apiFormat: CompatibleApiFormat;
    models: Array<{ id: string; name: string; supportsImage?: boolean }>;
  }>);
}

export function buildAvailableModelsFromAgentRoles(roles: AgentRoleConfigMap): Array<{
  id: string;
  name: string;
  provider?: string;
  providerKey?: string;
  supportsImage?: boolean;
}> {
  const normalizedRoles = normalizeAgentRolesForSave(roles);

  return AGENT_ROLE_ORDER
    .map((key) => normalizedRoles[key])
    .filter((role) => role.enabled && Boolean(role.modelId.trim()))
    .map((role) => ({
      id: role.modelId.trim(),
      name: role.label,
      provider: role.modelId.trim(),
      providerKey: role.key,
      supportsImage: role.supportsImage,
    }));
}

export function isAgentRoleProviderKey(value: string | undefined | null): value is AgentRoleKey {
  return Boolean(value && roleProviderKeys.has(value as AgentRoleKey));
}

export function getAgentRoleDisplayLabel(
  roleKey: AgentRoleKey,
  roles?: Partial<Record<AgentRoleKey, Partial<AgentRoleConfigEntry>>> | null,
): string {
  const explicitLabel = typeof roles?.[roleKey]?.label === 'string' ? roles[roleKey]!.label!.trim() : '';
  return explicitLabel || AGENT_ROLE_LABELS[roleKey];
}

export function getAgentRoleDisplayAvatar(
  roleKey: AgentRoleKey,
  roles?: Partial<Record<AgentRoleKey, Partial<AgentRoleConfigEntry>>> | null,
): string {
  const explicitAvatar = typeof roles?.[roleKey]?.avatar === 'string' ? roles[roleKey]!.avatar!.trim() : '';
  return explicitAvatar || AGENT_ROLE_ICONS[roleKey];
}
