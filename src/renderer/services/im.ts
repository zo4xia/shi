import { localStore } from './store';
import { store } from '../store';
import { hydrateIMState, setIMLoading, setPlatformStatus } from '../store/slices/imSlice';
import {
  buildIMConnectivityResult,
  createDefaultIMConfig,
  createDefaultIMStatus,
  hasRequiredIMCredentials,
  mergeIMConfig,
  type IMConnectivityTestResult,
  type IMGatewayConfig,
  type IMPlatform,
} from '../types/im';

const IM_CONFIG_STORAGE_KEY = 'im_config';

// {路标} FLOW-FRONTEND-IM
// {FLOW} IM-BYPASS-FACADE: IM 服务当前不完全走 window.electron 兼容壳，而是本地存储 + 直连 /api/im/feishu/* 的混合链。

type IMServiceResult<T = void> = {
  success: boolean;
  value?: T;
  error?: string;
};

let initialized = false;
let cachedConfig = createDefaultIMConfig();

type FeishuGatewayStatusResponse = {
  success?: boolean;
  status?: {
    connected?: boolean;
    appId?: string | null;
    botName?: string | null;
    error?: string | null;
  };
  gateways?: Array<{
    connected?: boolean;
    appId?: string | null;
    botName?: string | null;
    error?: string | null;
  }>;
  error?: string;
};

const syncStoreConfig = () => {
  store.dispatch(hydrateIMState({ config: cachedConfig }));
};

const buildHydratedStatusFromConfig = () => {
  const status = createDefaultIMStatus();
  return status;
};

const getEnabledFeishuApps = (config: IMGatewayConfig) => {
  return config.feishu.apps.filter((app) => app.enabled && app.appId && app.appSecret);
};

const resolveFeishuGatewayStatuses = (payload: FeishuGatewayStatusResponse): Array<NonNullable<FeishuGatewayStatusResponse['status']>> => {
  if (Array.isArray(payload?.gateways) && payload.gateways.length > 0) {
    return payload.gateways;
  }
  return payload?.status ? [payload.status] : [];
};

const syncFeishuRuntimeStatus = async (): Promise<void> => {
  try {
    const response = await fetch('/api/im/feishu/gateway/status');
    const payload = await response.json() as FeishuGatewayStatusResponse;
    const gatewayStatuses = resolveFeishuGatewayStatuses(payload);
    const connectedGatewayStatuses = gatewayStatuses.filter((status) => Boolean(status?.connected));
    const primaryStatus = connectedGatewayStatuses[0] ?? gatewayStatuses[0] ?? null;
    const aggregatedError = connectedGatewayStatuses.length > 0
      ? null
      : gatewayStatuses.find((status) => status?.error)?.error ?? payload?.error ?? null;
    const botAccount = connectedGatewayStatuses.length > 1
      ? `${connectedGatewayStatuses.length} 个飞书应用在线`
      : primaryStatus?.botName ?? null;

    store.dispatch(setPlatformStatus({
      platform: 'feishu',
      status: {
        connected: connectedGatewayStatuses.length > 0 || Boolean(primaryStatus?.connected),
        starting: false,
        error: aggregatedError,
        lastError: aggregatedError,
        botAccount,
        botId: primaryStatus?.appId ?? null,
      },
    }));
  } catch {
    // Backend may be unavailable during early bootstrap; keep status unknown/offline.
  }
};

// {埋点} 💾 IM持久化 (ID: im-persist-001) localStore.setItem('im_config', cachedConfig)
const persistConfig = async () => {
  await localStore.setItem(IM_CONFIG_STORAGE_KEY, cachedConfig);
};

const setPlatformError = (platform: IMPlatform, message: string | null) => {
  store.dispatch(setPlatformStatus({
    platform,
    status: {
      connected: false,
      starting: false,
      error: message,
      lastError: message,
    },
  }));
};

const withLoading = async <T>(task: () => Promise<T>): Promise<T> => {
  store.dispatch(setIMLoading(true));
  try {
    return await task();
  } finally {
    store.dispatch(setIMLoading(false));
  }
};

// {埋点} 💾 IM初始化 (ID: im-init-002) localStore.getItem('im_config') → mergeIMConfig → hydrateIMState
const ensureInitialized = async () => {
  if (initialized) {
    return;
  }

  const storedConfig = await localStore.getItem<Partial<IMGatewayConfig>>(IM_CONFIG_STORAGE_KEY);
  cachedConfig = mergeIMConfig(createDefaultIMConfig(), storedConfig ?? undefined);
  initialized = true;
  store.dispatch(hydrateIMState({
    config: cachedConfig,
    status: buildHydratedStatusFromConfig(),
    isLoading: false,
  }));
  await syncFeishuRuntimeStatus();
};

// {埋点} 💾 IM配置更新 (ID: im-update-001) mergeIMConfig → persistConfig → syncStoreConfig
const updateCachedConfig = async (update?: Partial<IMGatewayConfig> | null) => {
  cachedConfig = mergeIMConfig(cachedConfig, update ?? undefined);
  await persistConfig();
  syncStoreConfig();
};

const getStoredState = async <TPlatform extends IMPlatform>(platform: TPlatform): Promise<IMServiceResult<IMGatewayConfig[TPlatform]>> => {
  await ensureInitialized();
  return { success: true, value: cachedConfig[platform] };
};

const setStoredState = async <TPlatform extends IMPlatform>(
  platform: TPlatform,
  value: Partial<IMGatewayConfig[TPlatform]>
): Promise<IMServiceResult<IMGatewayConfig[TPlatform]>> => {
  await updateCachedConfig({ [platform]: value } as Partial<IMGatewayConfig>);
  return { success: true, value: cachedConfig[platform] };
};

export const imService = {
  async init(): Promise<boolean> {
    await withLoading(async () => {
      await ensureInitialized();
    });
    return true;
  },

  destroy(): void {
    initialized = false;
    store.dispatch(setIMLoading(false));
  },

  async updateConfig(update: Partial<IMGatewayConfig>): Promise<IMServiceResult<IMGatewayConfig>> {
    await withLoading(async () => {
      await ensureInitialized();
      await updateCachedConfig(update);
    });
    return { success: true, value: cachedConfig };
  },

  async startGateway(platform: IMPlatform): Promise<boolean> {
    return withLoading(async () => {
      await ensureInitialized();

      if (!hasRequiredIMCredentials(platform, cachedConfig)) {
        setPlatformError(platform, '请先填写完整的频道凭证。');
        return false;
      }

      store.dispatch(setPlatformStatus({
        platform,
        status: {
          connected: false,
          starting: platform === 'feishu',
          error: null,
          lastError: null,
        },
      }));

      if (platform === 'feishu') {
        const enabledApps = getEnabledFeishuApps(cachedConfig);
        if (enabledApps.length === 0) {
          setPlatformError(platform, '请先启用至少一个飞书应用。');
          return false;
        }

        try {
          const response = await fetch('/api/im/feishu/gateway/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apps: enabledApps.map((app) => ({
                appId: app.appId,
                appSecret: app.appSecret,
                agentRoleKey: app.agentRoleKey,
              })),
              domain: 'feishu',
              debug: true,
            }),
          });
          const payload = await response.json() as FeishuGatewayStatusResponse;
          if (!response.ok || payload?.success === false) {
            throw new Error(payload?.error || '飞书网关启动失败');
          }
        } catch (error) {
          setPlatformError(platform, error instanceof Error ? error.message : '飞书网关启动失败');
          return false;
        }

        await syncFeishuRuntimeStatus();
      }

      return true;
    });
  },

  async stopGateway(platform: IMPlatform): Promise<boolean> {
    return withLoading(async () => {
      await ensureInitialized();
      if (platform === 'feishu') {
        try {
          await fetch('/api/im/feishu/gateway/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        } catch {
          // Keep UI honest-offline even if backend stop request failed.
        }
        await syncFeishuRuntimeStatus();
      }
      store.dispatch(setPlatformStatus({
        platform,
        status: {
          connected: false,
          starting: false,
        },
      }));
      return true;
    });
  },

  async testGateway(
    platform: IMPlatform,
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult | null> {
    return withLoading(async () => {
      await ensureInitialized();
      const effectiveConfig = mergeIMConfig(cachedConfig, configOverride ?? undefined);
      const runtimeConnected = store.getState().im.status[platform]?.connected ?? false;
      const result = buildIMConnectivityResult(platform, effectiveConfig, runtimeConnected);

      if (result.verdict === 'fail') {
        const message = result.checks.find((check) => check.level === 'fail')?.message ?? '频道配置不完整。';
        setPlatformError(platform, message);
      } else {
        store.dispatch(setPlatformStatus({
          platform,
          status: {
            error: null,
            lastError: null,
          },
        }));
        if (platform === 'feishu') {
          await syncFeishuRuntimeStatus();
        }
      }

      return result;
    });
  },

  async refreshRuntimeStatus(platform: IMPlatform): Promise<void> {
    await ensureInitialized();
    if (platform === 'feishu') {
      await syncFeishuRuntimeStatus();
    }
  },

  async getDingTalkConfig() {
    return getStoredState('dingtalk');
  },
  async setDingTalkConfig(value: Partial<IMGatewayConfig['dingtalk']>) {
    return setStoredState('dingtalk', value);
  },
  async getFeishuConfig() {
    return getStoredState('feishu');
  },
  async setFeishuConfig(value: Partial<IMGatewayConfig['feishu']>) {
    return setStoredState('feishu', value);
  },
  async getQQConfig() {
    return getStoredState('qq');
  },
  async setQQConfig(value: Partial<IMGatewayConfig['qq']>) {
    return setStoredState('qq', value);
  },
  async getTelegramConfig() {
    return getStoredState('telegram');
  },
  async setTelegramConfig(value: Partial<IMGatewayConfig['telegram']>) {
    return setStoredState('telegram', value);
  },
  async getDiscordConfig() {
    return getStoredState('discord');
  },
  async setDiscordConfig(value: Partial<IMGatewayConfig['discord']>) {
    return setStoredState('discord', value);
  },
  async getNimConfig() {
    return getStoredState('nim');
  },
  async setNimConfig(value: Partial<IMGatewayConfig['nim']>) {
    return setStoredState('nim', value);
  },
  async getXiaomifengConfig() {
    return getStoredState('xiaomifeng');
  },
  async setXiaomifengConfig(value: Partial<IMGatewayConfig['xiaomifeng']>) {
    return setStoredState('xiaomifeng', value);
  },
  async getWecomConfig() {
    return getStoredState('wecom');
  },
  async setWecomConfig(value: Partial<IMGatewayConfig['wecom']>) {
    return setStoredState('wecom', value);
  },
  async testConnectivity(platform: IMPlatform) {
    const result = await this.testGateway(platform);
    return result
      ? { success: result.verdict !== 'fail', value: result }
      : { success: false, error: 'No test result.' };
  },
};
