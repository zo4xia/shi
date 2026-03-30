import { join } from 'path';
import type { SqliteStore } from '../sqliteStore';
import type { CoworkApiConfig } from './coworkConfigStore';
import {
  configureCoworkOpenAICompatProxy,
  type OpenAICompatProxyTarget,
  getCoworkOpenAICompatProxyBaseURL,
  getCoworkOpenAICompatProxyStatus,
} from './coworkOpenAICompatProxy';
import { normalizeProviderApiFormat, type AnthropicApiFormat } from './coworkFormatTransform';
import { AGENT_ROLE_ORDER, pickNextApiKey } from '../../shared/agentRoleConfig';
import { getBundledNodeModuleEntry } from './runtimeLayout';
import {
  ENV_ALIAS_PAIRS,
  readEnvAliasPair,
  readEnvAliasPairWithSuffix,
} from '../../shared/envAliases';

const ZHIPU_CODING_PLAN_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4';
// Qwen Coding Plan 专属端点 (OpenAI 兼容和 Anthropic 兼容)
const QWEN_CODING_PLAN_OPENAI_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
const QWEN_CODING_PLAN_ANTHROPIC_BASE_URL = 'https://coding.dashscope.aliyuncs.com/apps/anthropic';
// Volcengine Coding Plan 专属端点 (OpenAI 兼容和 Anthropic 兼容)
const VOLCENGINE_CODING_PLAN_OPENAI_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3';
const VOLCENGINE_CODING_PLAN_ANTHROPIC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding';
// Moonshot/Kimi Coding Plan 专属端点 (OpenAI 兼容和 Anthropic 兼容)
const MOONSHOT_CODING_PLAN_OPENAI_BASE_URL = 'https://api.kimi.com/coding/v1';
const MOONSHOT_CODING_PLAN_ANTHROPIC_BASE_URL = 'https://api.kimi.com/coding';

type ProviderModel = {
  id: string;
};

type ProviderConfig = {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  apiFormat?: 'anthropic' | 'openai' | 'native';
  codingPlanEnabled?: boolean;
  models?: ProviderModel[];
};

type AgentRoleConfig = {
  enabled?: boolean;
  apiKey?: string;
  apiUrl?: string;
  modelId?: string;
  apiFormat?: 'anthropic' | 'openai';
};

type AppConfig = {
  model?: {
    defaultModel?: string;
    defaultModelProvider?: string;
  };
  providers?: Record<string, ProviderConfig>;
  agentRoles?: Record<string, AgentRoleConfig>;
};

export type ApiConfigResolution = {
  config: CoworkApiConfig | null;
  error?: string;
};

type ResolveApiConfigOptions = {
  dbOnly?: boolean;
};

// Store getter function injected from main.ts
let storeGetter: (() => SqliteStore | null) | null = null;

export function setStoreGetter(getter: () => SqliteStore | null): void {
  storeGetter = getter;
}

const getStore = (): SqliteStore | null => {
  if (!storeGetter) {
    return null;
  }
  return storeGetter();
};

export function getClaudeCodePath(): string {
  return getBundledNodeModuleEntry('@anthropic-ai', 'claude-agent-sdk', 'cli.js');
}

type MatchedProvider = {
  providerName: string;
  providerConfig: ProviderConfig;
  modelId: string;
  apiFormat: AnthropicApiFormat;
  baseURL: string;
};

function getEffectiveProviderApiFormat(providerName: string, apiFormat: unknown): AnthropicApiFormat {
  if (
    providerName === 'openai'
    || providerName === 'gemini'
    || providerName === 'stepfun'
    || providerName === 'youdaozhiyun'
    || providerName === 'youdao_zhiyun'
    || providerName === 'volcengine'
  ) {
    return 'openai';
  }
  if (providerName === 'anthropic') {
    return 'anthropic';
  }
  return normalizeProviderApiFormat(apiFormat);
}

function isVolcengineV3BaseUrl(baseURL: string | undefined): boolean {
  const normalized = baseURL?.trim().replace(/\/+$/, '').toLowerCase() ?? '';
  return normalized.includes('ark.cn-beijing.volces.com/api/v3')
    || normalized.includes('ark.cn-beijing.volces.com/api/coding/v3');
}

function providerRequiresApiKey(providerName: string): boolean {
  return providerName !== 'ollama';
}

function buildResolvedConfigFromTarget(input: {
  sourceKey: string;
  baseURL?: string;
  apiKey?: string;
  modelId?: string;
  apiFormat?: 'anthropic' | 'openai';
  target: OpenAICompatProxyTarget;
}): ApiConfigResolution {
  const baseURL = input.baseURL?.trim();
  const modelId = input.modelId?.trim();
  const apiFormat = input.apiFormat === 'anthropic' && !isVolcengineV3BaseUrl(baseURL)
    ? 'anthropic'
    : 'openai';
  const resolvedApiKey = input.apiKey?.trim() || '';

  if (!baseURL || !modelId) {
    return {
      config: null,
      error: `Runtime config for ${input.sourceKey} is incomplete.`,
    };
  }

  if (apiFormat === 'anthropic') {
    return {
      config: {
        apiKey: resolvedApiKey,
        baseURL,
        model: modelId,
        apiType: 'anthropic',
      },
    };
  }

  const proxyStatus = getCoworkOpenAICompatProxyStatus();
  if (!proxyStatus.running) {
    return {
      config: null,
      error: 'OpenAI compatibility proxy is not running.',
    };
  }

  configureCoworkOpenAICompatProxy({
    baseURL,
    apiKey: resolvedApiKey || undefined,
    model: modelId,
    provider: input.sourceKey,
  });

  const proxyBaseURL = getCoworkOpenAICompatProxyBaseURL(input.target);
  if (!proxyBaseURL) {
    return {
      config: null,
      error: 'OpenAI compatibility proxy base URL is unavailable.',
    };
  }

  return {
    config: {
      apiKey: resolvedApiKey || 'lobsterai-openai-compat',
      baseURL: proxyBaseURL,
      model: modelId,
      apiType: 'openai',
    },
  };
}

function resolveAgentRoleConfig(
  appConfig: AppConfig,
  target: OpenAICompatProxyTarget,
  agentRoleKey?: string,
): ApiConfigResolution | null {
  const requestedRoleKey = agentRoleKey?.trim();
  const preferredRoleKey = appConfig.model?.defaultModelProvider?.trim();
  const fallbackRoleKey = AGENT_ROLE_ORDER.find((roleKey) => {
    const role = appConfig.agentRoles?.[roleKey];
    return Boolean(role?.enabled && role.apiUrl?.trim() && role.modelId?.trim());
  });
  const candidateRoleKeys = [requestedRoleKey, preferredRoleKey, fallbackRoleKey]
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

  for (const roleKey of candidateRoleKeys) {
    const role = appConfig.agentRoles?.[roleKey];
    if (!role?.enabled) {
      continue;
    }
    if (!role.apiUrl?.trim() || !role.modelId?.trim()) {
      continue;
    }
    const rotatedApiKey = pickNextApiKey(role.apiKey?.trim() || '', `agent-role:${roleKey}`) || role.apiKey?.trim() || '';
    return buildResolvedConfigFromTarget({
      sourceKey: roleKey,
      baseURL: role.apiUrl,
      apiKey: rotatedApiKey,
      modelId: role.modelId,
      apiFormat: role.apiFormat,
      target,
    });
  }

  return null;
}

function resolveMatchedProvider(appConfig: AppConfig): { matched: MatchedProvider | null; error?: string } {
  const providers = appConfig.providers ?? {};

  const resolveFallbackModel = (): string | undefined => {
    for (const provider of Object.values(providers)) {
      if (!provider?.enabled || !provider.models || provider.models.length === 0) {
        continue;
      }
      return provider.models[0].id;
    }
    return undefined;
  };

  const modelId = appConfig.model?.defaultModel || resolveFallbackModel();
  if (!modelId) {
    return { matched: null, error: 'No available model configured in enabled providers.' };
  }

  let providerEntry: [string, ProviderConfig] | undefined;
  const preferredProviderName = appConfig.model?.defaultModelProvider?.trim();
  if (preferredProviderName) {
    const preferredProvider = providers[preferredProviderName];
    if (
      preferredProvider?.enabled
      && preferredProvider.models?.some((model) => model.id === modelId)
    ) {
      providerEntry = [preferredProviderName, preferredProvider];
    }
  }

  if (!providerEntry && !preferredProviderName) {
    providerEntry = Object.entries(providers).find(([, provider]) => {
      if (!provider?.enabled || !provider.models) {
        return false;
      }
      return provider.models.some((model) => model.id === modelId);
    });
  }

  if (!providerEntry) {
    return { matched: null, error: `No enabled provider found for model: ${modelId}` };
  }

  const [providerName, providerConfig] = providerEntry;
  let apiFormat = getEffectiveProviderApiFormat(providerName, providerConfig.apiFormat);
  let baseURL = providerConfig.baseUrl?.trim();

  // Handle Zhipu GLM Coding Plan endpoint switch
  if (providerName === 'zhipu' && providerConfig.codingPlanEnabled) {
    baseURL = ZHIPU_CODING_PLAN_BASE_URL;
    apiFormat = 'openai';
  }

  // Handle Qwen Coding Plan endpoint switch
  // Coding Plan supports both OpenAI and Anthropic compatible formats
  if (providerName === 'qwen' && providerConfig.codingPlanEnabled) {
    if (apiFormat === 'anthropic') {
      baseURL = QWEN_CODING_PLAN_ANTHROPIC_BASE_URL;
    } else {
      baseURL = QWEN_CODING_PLAN_OPENAI_BASE_URL;
      apiFormat = 'openai';
    }
  }

  // Handle Volcengine Coding Plan endpoint switch
  // Coding Plan supports both OpenAI and Anthropic compatible formats
  if (providerName === 'volcengine' && providerConfig.codingPlanEnabled) {
    if (apiFormat === 'anthropic') {
      baseURL = VOLCENGINE_CODING_PLAN_ANTHROPIC_BASE_URL;
    } else {
      baseURL = VOLCENGINE_CODING_PLAN_OPENAI_BASE_URL;
      apiFormat = 'openai';
    }
  }

  // Handle Moonshot/Kimi Coding Plan endpoint switch
  // Coding Plan supports both OpenAI and Anthropic compatible formats
  if (providerName === 'moonshot' && providerConfig.codingPlanEnabled) {
    if (apiFormat === 'anthropic') {
      baseURL = MOONSHOT_CODING_PLAN_ANTHROPIC_BASE_URL;
    } else {
      baseURL = MOONSHOT_CODING_PLAN_OPENAI_BASE_URL;
      apiFormat = 'openai';
    }
  }

  if (!baseURL) {
    return { matched: null, error: `Provider ${providerName} is missing base URL.` };
  }

  if (apiFormat === 'anthropic' && providerRequiresApiKey(providerName) && !providerConfig.apiKey?.trim()) {
    return { matched: null, error: `Provider ${providerName} requires API key for Anthropic-compatible mode.` };
  }

  return {
    matched: {
      providerName,
      providerConfig,
      modelId,
      apiFormat,
      baseURL,
    },
  };
}

export function resolveCurrentApiConfig(
  target: OpenAICompatProxyTarget = 'local',
  agentRoleKey?: string,
  options?: ResolveApiConfigOptions,
): ApiConfigResolution {
  // {标记} NO-TOUCH-API-TRUTH
  // 运行时配置真相源优先使用数据库 app_config。
  // .env 只作为兜底入口，不允许反过来覆盖设置页已保存的运行态配置。
  const sqliteStore = getStore();
  if (sqliteStore) {
    const appConfig = sqliteStore.get<AppConfig>('app_config');
    if (appConfig) {
      const roleResolution = resolveAgentRoleConfig(appConfig, target, agentRoleKey);
      if (roleResolution) {
        return roleResolution;
      }

      const { matched, error } = resolveMatchedProvider(appConfig);
      if (matched) {
        const resolvedApiKey = matched.providerConfig.apiKey?.trim() || '';
        const rotatedApiKey = pickNextApiKey(resolvedApiKey, matched.providerName) || resolvedApiKey;
        const effectiveApiKey = matched.providerName === 'ollama'
          && matched.apiFormat === 'anthropic'
          && !rotatedApiKey
          ? 'sk-ollama-local'
          : rotatedApiKey;

        return buildResolvedConfigFromTarget({
          sourceKey: matched.providerName,
          baseURL: matched.baseURL,
          apiKey: effectiveApiKey,
          modelId: matched.modelId,
          apiFormat: matched.apiFormat,
          target,
        });
      }

      if (error) {
        return {
          config: null,
          error,
        };
      }
    }
  }

  if (options?.dbOnly) {
    return {
      config: null,
      error: 'Application config not found in database. 请先在设置页面保存当前角色的 API 配置。',
    };
  }

  // {降级} 数据库没有可用配置时，才使用 .env 兜底
  const suffix = agentRoleKey ? '_' + agentRoleKey.toUpperCase() : '';
  const envBaseURL = (suffix && readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.apiBaseUrl, suffix))
    || readEnvAliasPair(ENV_ALIAS_PAIRS.apiBaseUrl);
  const envApiKey = (suffix && readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.apiKey, suffix))
    || readEnvAliasPair(ENV_ALIAS_PAIRS.apiKey);
  const envModel = (suffix && readEnvAliasPairWithSuffix(ENV_ALIAS_PAIRS.defaultModel, suffix))
    || readEnvAliasPair(ENV_ALIAS_PAIRS.defaultModel);

  if (envBaseURL && envApiKey && envModel) {
    const rotatedEnvApiKey = pickNextApiKey(
      envApiKey,
      `env:${agentRoleKey?.trim() || 'default'}`
    ) || envApiKey;
    console.log(`[ApiConfig] 使用 .env 兜底配置: model=${envModel}, baseURL=${envBaseURL}`);
    return {
      config: {
        apiKey: rotatedEnvApiKey,
        baseURL: envBaseURL,
        model: envModel,
        apiType: 'openai',
      },
    };
  }

  return {
    config: null,
    error: 'Application config not found. 请在设置页面配置 API；只有数据库配置不可用时才会回退到 .env。',
  };
}

export function getCurrentApiConfig(target: OpenAICompatProxyTarget = 'local', agentRoleKey?: string): CoworkApiConfig | null {
  return resolveCurrentApiConfig(target, agentRoleKey).config;
}

export function buildEnvForConfig(config: CoworkApiConfig): Record<string, string> {
  const baseEnv = { ...process.env } as Record<string, string>;

  baseEnv.ANTHROPIC_AUTH_TOKEN = config.apiKey;
  baseEnv.ANTHROPIC_API_KEY = config.apiKey;
  baseEnv.ANTHROPIC_BASE_URL = config.baseURL;
  baseEnv.ANTHROPIC_MODEL = config.model;

  return baseEnv;
}
