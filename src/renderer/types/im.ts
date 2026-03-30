export const IM_PLATFORMS = [
  'dingtalk',
  'feishu',
  'qq',
  'telegram',
  'discord',
  'nim',
  'xiaomifeng',
  'wecom',
  'wechatbot',
] as const;

export type IMPlatform = (typeof IM_PLATFORMS)[number];

export interface DingTalkConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

// {标记} 飞书单个应用配置
export interface FeishuApp {
  id: string;                    // 应用唯一 ID
  name: string;                  // 应用名称
  appId: string;                 // 飞书 App ID
  appSecret: string;             // 飞书 App Secret
  agentRoleKey: string;          // 内部角色/模型槽位绑定 (organizer/writer/designer/analyst)
  enabled: boolean;              // 是否启用
  createdAt: number;             // 创建时间
}

// {标记} 飞书配置（支持多应用）
export interface FeishuConfig {
  enabled: boolean;              // 总开关
  apps: FeishuApp[];             // 多个应用
}

export interface QQConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  allowedUserIds: string[];
}

export interface DiscordConfig {
  enabled: boolean;
  botToken: string;
}

export interface NimConfig {
  enabled: boolean;
  appKey: string;
  account: string;
  token: string;
  accountWhitelist: string;
  teamPolicy: 'disabled' | 'open' | 'allowlist';
  teamAllowlist: string;
  qchatEnabled: boolean;
  qchatServerIds: string;
}

export interface XiaomifengConfig {
  enabled: boolean;
  clientId: string;
  secret: string;
}

export interface WecomConfig {
  enabled: boolean;
  botId: string;
  secret: string;
}

export interface ImaConfig {
  clientId: string;
  apiKey: string;
}

export interface WechatBotConfig {
  enabled: boolean;
  bridgeMode: 'official-relay';
  agentRoleKey: string;
  botAccountId: string;
  linkedUserId: string;
  baseUrl: string;
  botToken: string;
  syncBotReplies: boolean;
}

export interface IMGatewayConfig {
  dingtalk: DingTalkConfig;
  feishu: FeishuConfig;
  qq: QQConfig;
  telegram: TelegramConfig;
  discord: DiscordConfig;
  nim: NimConfig;
  xiaomifeng: XiaomifengConfig;
  wecom: WecomConfig;
  wechatbot: WechatBotConfig;
  ima: ImaConfig;
}

export interface IMPlatformStatus {
  connected: boolean;
  starting: boolean;
  error: string | null;
  lastError: string | null;
  botUsername?: string | null;
  botAccount?: string | null;
  botId?: string | null;
}

export type IMGatewayStatusMap = Record<IMPlatform, IMPlatformStatus>;

export interface IMState {
  config: IMGatewayConfig;
  status: IMGatewayStatusMap;
  isLoading: boolean;
}

export interface IMConnectivityCheck {
  code: string;
  level: 'pass' | 'info' | 'warn' | 'fail';
  message: string;
  suggestion?: string;
}

export interface IMConnectivityTestResult {
  platform: IMPlatform;
  verdict: 'pass' | 'warn' | 'fail';
  testedAt: number;
  checks: IMConnectivityCheck[];
}

const createDefaultPlatformStatus = (): IMPlatformStatus => ({
  connected: false,
  starting: false,
  error: null,
  lastError: null,
  botUsername: null,
  botAccount: null,
  botId: null,
});

export const createDefaultIMConfig = (): IMGatewayConfig => ({
  dingtalk: { enabled: false, clientId: '', clientSecret: '' },
  feishu: { enabled: false, apps: [] },
  qq: { enabled: false, appId: '', appSecret: '' },
  telegram: { enabled: false, botToken: '', allowedUserIds: [] },
  discord: { enabled: false, botToken: '' },
  nim: {
    enabled: false,
    appKey: '',
    account: '',
    token: '',
    accountWhitelist: '',
    teamPolicy: 'disabled',
    teamAllowlist: '',
    qchatEnabled: false,
    qchatServerIds: '',
  },
  xiaomifeng: { enabled: false, clientId: '', secret: '' },
  wecom: { enabled: false, botId: '', secret: '' },
  wechatbot: {
    enabled: false,
    bridgeMode: 'official-relay',
    agentRoleKey: '',
    botAccountId: '',
    linkedUserId: '',
    baseUrl: '',
    botToken: '',
    syncBotReplies: true,
  },
  ima: { clientId: '', apiKey: '' },
});

export const createDefaultIMStatus = (): IMGatewayStatusMap => ({
  dingtalk: createDefaultPlatformStatus(),
  feishu: createDefaultPlatformStatus(),
  qq: createDefaultPlatformStatus(),
  telegram: createDefaultPlatformStatus(),
  discord: createDefaultPlatformStatus(),
  nim: createDefaultPlatformStatus(),
  xiaomifeng: createDefaultPlatformStatus(),
  wecom: createDefaultPlatformStatus(),
  wechatbot: createDefaultPlatformStatus(),
});

export const createDefaultIMState = (): IMState => ({
  config: createDefaultIMConfig(),
  status: createDefaultIMStatus(),
  isLoading: false,
});

export const normalizeIMConfig = (config?: Partial<IMGatewayConfig> | null): IMGatewayConfig => {
  const defaults = createDefaultIMConfig();

  if (!config) {
    return defaults;
  }

  // {标记} 迁移旧的飞书单应用配置到新的多应用格式
  const feishuConfig = config.feishu as any;
  let normalizedFeishu = defaults.feishu;

  if (feishuConfig) {
    // 如果是新格式（有 apps 数组）
    if (Array.isArray(feishuConfig.apps)) {
      normalizedFeishu = {
        enabled: feishuConfig.enabled ?? false,
        apps: feishuConfig.apps,
      };
    }
    // 如果是旧格式（有 appId 和 appSecret）- 只迁移一次
    else if (feishuConfig.appId && feishuConfig.appSecret) {
      normalizedFeishu = {
        enabled: feishuConfig.enabled ?? false,
        apps: [{
          id: 'migrated-default',  // {标记} 使用固定 ID，避免每次生成新 ID
          name: '默认应用',
          appId: feishuConfig.appId,
          appSecret: feishuConfig.appSecret,
          agentRoleKey: 'organizer',
          enabled: true,
          createdAt: Date.now(),
        }],
      };
    }
  }

  return {
    dingtalk: { ...defaults.dingtalk, ...(config.dingtalk ?? {}) },
    feishu: normalizedFeishu,
    qq: { ...defaults.qq, ...(config.qq ?? {}) },
    telegram: {
      ...defaults.telegram,
      ...(config.telegram ?? {}),
      allowedUserIds: Array.isArray(config.telegram?.allowedUserIds)
        ? config.telegram.allowedUserIds.filter((value): value is string => typeof value === 'string')
        : defaults.telegram.allowedUserIds,
    },
    discord: { ...defaults.discord, ...(config.discord ?? {}) },
    nim: { ...defaults.nim, ...(config.nim ?? {}) },
    xiaomifeng: { ...defaults.xiaomifeng, ...(config.xiaomifeng ?? {}) },
    wecom: { ...defaults.wecom, ...(config.wecom ?? {}) },
    wechatbot: { ...defaults.wechatbot, ...(config.wechatbot ?? {}) },
    ima: { ...defaults.ima, ...(config.ima ?? {}) },
  };
};

export const mergeIMConfig = (
  current: IMGatewayConfig,
  update?: Partial<IMGatewayConfig> | null
): IMGatewayConfig => {
  if (!update) {
    return normalizeIMConfig(current);
  }

  return normalizeIMConfig({
    dingtalk: { ...current.dingtalk, ...(update.dingtalk ?? {}) },
    feishu: { ...current.feishu, ...(update.feishu ?? {}) },
    qq: { ...current.qq, ...(update.qq ?? {}) },
    telegram: { ...current.telegram, ...(update.telegram ?? {}) },
    discord: { ...current.discord, ...(update.discord ?? {}) },
    nim: { ...current.nim, ...(update.nim ?? {}) },
    xiaomifeng: { ...current.xiaomifeng, ...(update.xiaomifeng ?? {}) },
    wecom: { ...current.wecom, ...(update.wecom ?? {}) },
    wechatbot: { ...current.wechatbot, ...(update.wechatbot ?? {}) },
    ima: { ...current.ima, ...(update.ima ?? {}) },
  });
};

export const hasRequiredIMCredentials = (platform: IMPlatform, config: IMGatewayConfig): boolean => {
  switch (platform) {
    case 'dingtalk':
      return Boolean(config.dingtalk.clientId && config.dingtalk.clientSecret);
    case 'feishu':
      return config.feishu.apps.some(app => app.enabled && Boolean(app.appId && app.appSecret));
    case 'qq':
      return Boolean(config.qq.appId && config.qq.appSecret);
    case 'telegram':
      return Boolean(config.telegram.botToken);
    case 'discord':
      return Boolean(config.discord.botToken);
    case 'nim':
      return Boolean(config.nim.appKey && config.nim.account && config.nim.token);
    case 'xiaomifeng':
      return Boolean(config.xiaomifeng.clientId && config.xiaomifeng.secret);
    case 'wecom':
      return Boolean(config.wecom.botId && config.wecom.secret);
    case 'wechatbot':
      return Boolean(config.wechatbot.botAccountId && config.wechatbot.botToken && config.wechatbot.agentRoleKey);
    default:
      return false;
  }
};

export const buildIMConnectivityResult = (
  platform: IMPlatform,
  config: IMGatewayConfig,
  runtimeConnected = false
): IMConnectivityTestResult => {
  const credentialsReady = hasRequiredIMCredentials(platform, config);
  const enabled = config[platform].enabled;

  const checks: IMConnectivityCheck[] = [
    {
      code: 'config_present',
      level: credentialsReady ? 'pass' : 'fail',
      message: credentialsReady ? '已检测到完整频道配置。' : '缺少必填配置，请先填写所需凭证。',
    },
    {
      code: 'auth_check',
      level: credentialsReady ? 'pass' : 'fail',
      message: credentialsReady ? '当前配置已通过基础格式检查。' : '当前配置无法通过基础格式检查。',
    },
    {
      code: 'gateway_running',
      level: runtimeConnected || enabled ? 'pass' : credentialsReady ? 'info' : 'warn',
      message: runtimeConnected || enabled
        ? runtimeConnected
          ? '已检测到运行中的渠道状态。'
          : '频道已启用，等待运行态回报。'
        : credentialsReady
          ? '配置已保存，启用后将等待运行态回报。'
          : '完成配置后再启用频道。',
    },
  ];

  return {
    platform,
    verdict: !credentialsReady ? 'fail' : runtimeConnected || enabled ? 'pass' : 'warn',
    testedAt: Date.now(),
    checks,
  };
};
