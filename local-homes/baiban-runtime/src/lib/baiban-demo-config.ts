export type BaibanDemoConfig = {
  serviceUrl: string
  aliyunApiKey: string
  voice: string
  adjustAgentBaseUrl: string
  adjustAgentApiKey: string
  adjustAgentModel: string
  controlAgentBaseUrl: string
  controlAgentApiKey: string
  controlAgentModel: string
  text: string
  boardLines: string
}

// #配置_本地预设
// 3000 白板首页的客户演示预设都从这里统一落地。
export const BAIBAN_DEMO_CONFIG_STORAGE_KEY = 'baiban-demo-config-v1'

export const DEFAULT_BAIBAN_DEMO_CONFIG: BaibanDemoConfig = {
  serviceUrl: 'http://127.0.0.1:3003',
  aliyunApiKey: 'sk-5451dc5f4a9a4805993f42eb8988d73f',
  voice: 'longanyang',
  adjustAgentBaseUrl: 'https://api.penguinsaichat.dpdns.org/v1',
  adjustAgentApiKey: 'sk-LirGm42ajDl40AW078ilXv4vlVPPwIgyXPq4jHLqL9V7mGjL',
  adjustAgentModel: 'MiniMax-M2.7',
  controlAgentBaseUrl: 'https://api2.penguinsaichat.dpdns.org/v1',
  controlAgentApiKey: 'sk-ZLvmgTekgMlqMiLeX2V3MTsqFQWizERTvjGerJilrnd1ceov',
  controlAgentModel: 'gpt-5.2',
  text:
    '同学们大家好，很高兴为大家解说简算的小技巧，下面看几道题。\n第一题，四百一十八减一百七十减一百一十八。简算，减法性质，四百一十八减一百一十八减一百七十，等于三百减一百七十，等于一百三十。\n第二题，二百八十八减四十四减一百五十六。简算，减法性质，二百八十八减括号四十四加一百五十六括号，等于二百八十八减二百，等于八十八。',
  boardLines: [
    '418-170-118',
    '418-118-170',
    '300-170',
    '130',
    '288-44-156',
    '288-(44+156)',
    '288-200',
    '88',
  ].join('\n'),
}

function ensureString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  return value
}

export function normalizeBaibanDemoConfig(value: unknown): BaibanDemoConfig {
  const raw = (value && typeof value === 'object') ? value as Record<string, unknown> : {}

  return {
    serviceUrl: ensureString(raw.serviceUrl, DEFAULT_BAIBAN_DEMO_CONFIG.serviceUrl),
    aliyunApiKey: ensureString(raw.aliyunApiKey, DEFAULT_BAIBAN_DEMO_CONFIG.aliyunApiKey),
    voice: ensureString(raw.voice, DEFAULT_BAIBAN_DEMO_CONFIG.voice),
    adjustAgentBaseUrl: ensureString(raw.adjustAgentBaseUrl, DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentBaseUrl),
    adjustAgentApiKey: ensureString(raw.adjustAgentApiKey, DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentApiKey),
    adjustAgentModel: ensureString(raw.adjustAgentModel, DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentModel),
    controlAgentBaseUrl: ensureString(raw.controlAgentBaseUrl, DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentBaseUrl),
    controlAgentApiKey: ensureString(raw.controlAgentApiKey, DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentApiKey),
    controlAgentModel: ensureString(raw.controlAgentModel, DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentModel),
    text: ensureString(raw.text, DEFAULT_BAIBAN_DEMO_CONFIG.text),
    boardLines: ensureString(raw.boardLines, DEFAULT_BAIBAN_DEMO_CONFIG.boardLines),
  }
}

export function parseStoredBaibanDemoConfig(raw: string | null): BaibanDemoConfig {
  if (!raw) {
    return DEFAULT_BAIBAN_DEMO_CONFIG
  }

  try {
    return normalizeBaibanDemoConfig(JSON.parse(raw))
  } catch {
    return DEFAULT_BAIBAN_DEMO_CONFIG
  }
}

// #配置_测试key记忆
// 本机 localStorage 只记演示页测试配置，不上云不同步。
export function serializeBaibanDemoConfig(config: BaibanDemoConfig): string {
  return JSON.stringify(config)
}
