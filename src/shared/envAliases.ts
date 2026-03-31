export type EnvAliasPair = {
  primary: string;
  legacy: string;
};

export const ENV_ALIAS_PAIRS = {
  appRoot: { primary: 'UCLAW_APP_ROOT', legacy: 'LOBSTERAI_APP_ROOT' },
  dataPath: { primary: 'UCLAW_DATA_PATH', legacy: 'LOBSTERAI_DATA_PATH' },
  workspace: { primary: 'UCLAW_WORKSPACE', legacy: 'LOBSTERAI_WORKSPACE' },
  resourcesRoot: { primary: 'UCLAW_RESOURCES_ROOT', legacy: 'LOBSTERAI_RESOURCES_ROOT' },
  apiBaseUrl: { primary: 'UCLAW_API_BASE_URL', legacy: 'LOBSTERAI_API_BASE_URL' },
  apiKey: { primary: 'UCLAW_API_KEY', legacy: 'LOBSTERAI_API_KEY' },
  defaultModel: { primary: 'UCLAW_DEFAULT_MODEL', legacy: 'LOBSTERAI_DEFAULT_MODEL' },
  feishuApiBaseUrl: { primary: 'UCLAW_FEISHU_API_BASE_URL', legacy: 'LOBSTERAI_FEISHU_API_BASE_URL' },
  feishuAppId: { primary: 'UCLAW_FEISHU_APP_ID', legacy: 'LOBSTERAI_FEISHU_APP_ID' },
  feishuAppSecret: { primary: 'UCLAW_FEISHU_APP_SECRET', legacy: 'LOBSTERAI_FEISHU_APP_SECRET' },
  feishuAgentRoleKey: { primary: 'UCLAW_FEISHU_AGENT_ROLE_KEY', legacy: 'LOBSTERAI_FEISHU_AGENT_ROLE_KEY' },
  feishuAppName: { primary: 'UCLAW_FEISHU_APP_NAME', legacy: 'LOBSTERAI_FEISHU_APP_NAME' },
  imaOpenapiClientId: { primary: 'IMA_OPENAPI_CLIENTID', legacy: 'UCLAW_IMA_OPENAPI_CLIENTID' },
  imaOpenapiApiKey: { primary: 'IMA_OPENAPI_APIKEY', legacy: 'UCLAW_IMA_OPENAPI_APIKEY' },
  dailyMemoryApiBaseUrl: {
    primary: 'UCLAW_DAILY_MEMORY_API_BASE_URL',
    legacy: 'LOBSTERAI_DAILY_MEMORY_API_BASE_URL',
  },
  dailyMemoryApiKey: {
    primary: 'UCLAW_DAILY_MEMORY_API_KEY',
    legacy: 'LOBSTERAI_DAILY_MEMORY_API_KEY',
  },
  dailyMemoryModel: {
    primary: 'UCLAW_DAILY_MEMORY_MODEL',
    legacy: 'LOBSTERAI_DAILY_MEMORY_MODEL',
  },
  dailyMemoryApiFormat: {
    primary: 'UCLAW_DAILY_MEMORY_API_FORMAT',
    legacy: 'LOBSTERAI_DAILY_MEMORY_API_FORMAT',
  },
  skillsMcpAssistantApiUrl: {
    primary: 'UCLAW_SKILLS_MCP_ASSISTANT_API_URL',
    legacy: 'LOBSTERAI_SKILLS_MCP_ASSISTANT_API_URL',
  },
  skillsMcpAssistantApiKey: {
    primary: 'UCLAW_SKILLS_MCP_ASSISTANT_API_KEY',
    legacy: 'LOBSTERAI_SKILLS_MCP_ASSISTANT_API_KEY',
  },
} as const satisfies Record<string, EnvAliasPair>;

type EnvSource = Record<string, string | undefined>;

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getEnvAliasKeys(primaryKey: string, legacyKeys: string[] = []): string[] {
  return [primaryKey, ...legacyKeys].filter((key, index, keys) => Boolean(key) && keys.indexOf(key) === index);
}

export function getEnvAliasKeysForPair(pair: EnvAliasPair, suffix = ''): string[] {
  return getEnvAliasKeys(`${pair.primary}${suffix}`, [`${pair.legacy}${suffix}`]);
}

export function readEnvAlias(primaryKey: string, legacyKeys: string[] = [], env: EnvSource = process.env): string | undefined {
  for (const key of getEnvAliasKeys(primaryKey, legacyKeys)) {
    const value = normalizeEnvValue(env[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function readEnvAliasPair(pair: EnvAliasPair, env: EnvSource = process.env): string | undefined {
  return readEnvAlias(pair.primary, [pair.legacy], env);
}

export function readEnvAliasPairWithSuffix(
  pair: EnvAliasPair,
  suffix = '',
  env: EnvSource = process.env,
): string | undefined {
  return readEnvAlias(`${pair.primary}${suffix}`, [`${pair.legacy}${suffix}`], env);
}

export function assignEnvAlias(target: EnvSource, pair: EnvAliasPair, value: string, suffix = ''): void {
  for (const key of getEnvAliasKeysForPair(pair, suffix)) {
    target[key] = value;
  }
}
