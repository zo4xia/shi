import { AppConfig, CONFIG_KEYS, defaultConfig } from '../config';
import {
  normalizeSkillsMcpAssistantByRole,
  type SkillsMcpAssistantHelpersConfig,
} from '../../shared/skillsMcpAssistantConfig';
import { normalizeNativeCapabilitiesConfig } from '../../shared/nativeCapabilities/config';
import { localStore } from './store';

const getFixedProviderApiFormat = (providerKey: string): 'anthropic' | 'openai' | null => {
  if (
    providerKey === 'openai'
    || providerKey === 'gemini'
    || providerKey === 'stepfun'
    || providerKey === 'youdaozhiyun'
    || providerKey === 'youdao_zhiyun'
    || providerKey === 'volcengine'
  ) {
    return 'openai';
  }
  if (providerKey === 'anthropic') {
    return 'anthropic';
  }
  return null;
};

const normalizeProviderBaseUrl = (providerKey: string, baseUrl: unknown): string => {
  if (typeof baseUrl !== 'string') {
    return '';
  }

  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (providerKey !== 'gemini') {
    return normalized;
  }

  if (!normalized || !normalized.includes('generativelanguage.googleapis.com')) {
    return normalized;
  }

  if (normalized.endsWith('/v1beta/openai') || normalized.endsWith('/v1/openai')) {
    return normalized;
  }
  if (normalized.endsWith('/v1beta')) {
    return `${normalized}/openai`;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized.slice(0, -3)}v1beta/openai`;
  }

  return 'https://generativelanguage.googleapis.com/v1beta/openai';
};

const normalizeProviderApiFormat = (providerKey: string, apiFormat: unknown): 'anthropic' | 'openai' => {
  const fixed = getFixedProviderApiFormat(providerKey);
  if (fixed) {
    return fixed;
  }
  if (apiFormat === 'openai') {
    return 'openai';
  }
  return 'anthropic';
};

const normalizeProvidersConfig = (providers: AppConfig['providers']): AppConfig['providers'] => {
  if (!providers) {
    return providers;
  }

  return Object.fromEntries(
    Object.entries(providers).map(([providerKey, providerConfig]) => [
      providerKey,
      {
        ...providerConfig,
        baseUrl: normalizeProviderBaseUrl(providerKey, providerConfig.baseUrl),
        apiFormat: normalizeProviderApiFormat(providerKey, providerConfig.apiFormat),
      },
    ])
  ) as AppConfig['providers'];
};

const ensureEnabledProvider = (config: AppConfig): AppConfig => {
  const providers = normalizeProvidersConfig(config.providers) ?? defaultConfig.providers;
  return {
    ...config,
    providers,
  };
};

const normalizeHelpersConfig = (
  helpers: SkillsMcpAssistantHelpersConfig | undefined | null
): AppConfig['helpers'] => ({
  skillsMcpAssistantByRole: normalizeSkillsMcpAssistantByRole(helpers),
});

class ConfigService {
  private config: AppConfig = defaultConfig;

  private async loadStoredConfigStrict(): Promise<AppConfig | null> {
    const storeApi = window.electron?.store;
    if (!storeApi) {
      return localStore.getItem<AppConfig>(CONFIG_KEYS.APP_CONFIG);
    }

    const raw = await storeApi.get(CONFIG_KEYS.APP_CONFIG);
    if (raw && typeof raw === 'object' && 'success' in raw) {
      const result = raw as {
        success: boolean;
        value?: AppConfig;
        error?: string;
      };
      if (!result.success) {
        throw new Error(result.error || 'Failed to read app config from store');
      }
      return result.value ?? null;
    }

    return (raw as AppConfig | null) ?? null;
  }

  // {埋点} 💾 配置恢复 (ID: settings-load-001) localStore.getItem(APP_CONFIG) → mergeConfig → ensureEnabledProvider
  async init() {
    try {
      const storedConfig = await this.loadStoredConfigStrict();
      if (storedConfig) {
        const mergedProviders = storedConfig.providers
          ? Object.fromEntries(
              Object.entries({
                ...(defaultConfig.providers ?? {}),
                ...storedConfig.providers,
              }).map(([providerKey, providerConfig]) => [
                providerKey,
                (() => {
                  const mergedProvider = {
                    ...(defaultConfig.providers as Record<string, any>)?.[providerKey],
                    ...providerConfig,
                  };
                  return {
                    ...mergedProvider,
                    baseUrl: normalizeProviderBaseUrl(providerKey, mergedProvider.baseUrl),
                    apiFormat: normalizeProviderApiFormat(providerKey, mergedProvider.apiFormat),
                  };
                })(),
              ])
            )
          : defaultConfig.providers;

        this.config = ensureEnabledProvider({
          ...defaultConfig,
          ...storedConfig,
          api: {
            ...defaultConfig.api,
            ...storedConfig.api,
          },
          model: {
            ...defaultConfig.model,
            ...storedConfig.model,
          },
          app: {
            ...defaultConfig.app,
            ...storedConfig.app,
          },
          links: {
            ...(defaultConfig.links ?? {}),
            ...(storedConfig.links ?? {}),
          },
          shortcuts: {
            ...defaultConfig.shortcuts!,
            ...(storedConfig.shortcuts ?? {}),
          } as AppConfig['shortcuts'],
          dailyMemory: {
            ...(defaultConfig.dailyMemory ?? {}),
            ...(storedConfig.dailyMemory ?? {}),
          },
          helpers: normalizeHelpersConfig({
            ...(defaultConfig.helpers ?? {}),
            ...(storedConfig.helpers ?? {}),
          }),
          nativeCapabilities: normalizeNativeCapabilitiesConfig(storedConfig.nativeCapabilities),
          providers: mergedProviders as AppConfig['providers'],
        });

        // {标记} 不要在初始化时保存，避免触发无限循环
        // await localStore.setItem(CONFIG_KEYS.APP_CONFIG, this.config);

        return;
      }

      this.config = ensureEnabledProvider(defaultConfig);
      // {标记} 只在首次初始化时保存默认配置
      await localStore.setItem(CONFIG_KEYS.APP_CONFIG, this.config);
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error instanceof Error ? error : new Error('Failed to load config');
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  // {埋点} 💾 配置持久化 (ID: settings-save-002) mergeConfig → localStore.setItem(APP_CONFIG)
  async updateConfig(newConfig: Partial<AppConfig>) {
    const normalizedProviders = normalizeProvidersConfig(newConfig.providers as AppConfig['providers'] | undefined);
    const normalizedHelpers = newConfig.helpers
      ? normalizeHelpersConfig({
          ...(this.config.helpers ?? {}),
          ...newConfig.helpers,
        })
      : this.config.helpers;
    this.config = {
      ...this.config,
      ...newConfig,
      app: {
        ...this.config.app,
        ...(newConfig.app ?? {}),
      },
      links: {
        ...(this.config.links ?? {}),
        ...(newConfig.links ?? {}),
      },
      shortcuts: {
        ...(this.config.shortcuts ?? {}),
        ...(newConfig.shortcuts ?? {}),
      } as AppConfig['shortcuts'],
      dailyMemory: {
        ...(this.config.dailyMemory ?? {}),
        ...(newConfig.dailyMemory ?? {}),
      },
      ...(normalizedHelpers ? { helpers: normalizedHelpers } : {}),
      nativeCapabilities: normalizeNativeCapabilitiesConfig(newConfig.nativeCapabilities ?? this.config.nativeCapabilities),
      ...(normalizedProviders ? { providers: normalizedProviders } : {}),
    };
    await localStore.setItem(CONFIG_KEYS.APP_CONFIG, this.config);
  }

  getApiConfig() {
    return {
      apiKey: this.config.api.key,
      baseUrl: this.config.api.baseUrl,
    };
  }
}

export const configService = new ConfigService(); 
