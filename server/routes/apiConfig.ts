/**
 * {标记} 功能: API配置管理路由
 * {标记} 来源: web架构迁移 + 二开改造
 * {标记} 用途: REST接口暴露4身份Agent配置、模型验证、设置保存
 * {标记} 端点: GET/PUT /api/api-config / GET /api/api-config/check
 * {标记} 集成: Settings.tsx 保存逻辑 / 运行时 API 配置读取链
 * {标记} 状态: 源代码完整✅ / 但身份切换逻辑缺失❌
 */

import { Router, Request, Response } from 'express';
import type { RequestContext } from '../src/index';
import type { CoworkApiConfig } from '../../src/main/libs/coworkConfigStore';
import { resolveCurrentApiConfig, setStoreGetter } from '../../src/main/libs/claudeSettings';
import { prepareAppConfigForStore, syncAppConfigToEnv } from './store';

type LegacyAppConfig = {
  model?: {
    defaultModel?: string;
    defaultModelProvider?: string;
  };
  providers?: Record<string, {
    enabled?: boolean;
    apiKey?: string;
    baseUrl?: string;
    apiFormat?: 'anthropic' | 'openai' | 'native';
    models?: Array<{ id: string }>;
  }>;
};

const MODEL_PROBE_TIMEOUT_MS = 20_000;

function isVolcengineV3BaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3')
    || normalized.includes('ark.cn-beijing.volces.com/api/coding/v3');
}

function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/v1/messages')) return normalized;
  if (normalized.endsWith('/messages')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/messages`;
  return `${normalized}/v1/messages`;
}

function buildOpenAIChatUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) return '/v1/chat/completions';
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (/\/v\d+$/.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function extractApiErrorSnippet(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error && typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
      return parsed.error.message;
    }
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // ignore JSON parse failures
  }
  return trimmed.slice(0, 300);
}

async function probeResolvedConfigReadiness(config: CoworkApiConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODEL_PROBE_TIMEOUT_MS);

  try {
    const useOpenAICompat = config.apiType === 'openai' || isVolcengineV3BaseUrl(config.baseURL);
    const response = await fetch(useOpenAICompat ? buildOpenAIChatUrl(config.baseURL) : buildAnthropicMessagesUrl(config.baseURL), {
      method: 'POST',
      headers: useOpenAICompat
        ? {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          }
        : {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1,
        temperature: 0,
        messages: [{ role: 'user', content: 'Reply with "ok".' }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errorSnippet = extractApiErrorSnippet(errorText);
      return {
        ok: false,
        error: errorSnippet
          ? `Model validation failed (${response.status}): ${errorSnippet}`
          : `Model validation failed with status ${response.status}.`,
      };
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Model validation timed out after 20s.' };
    }
    return {
      ok: false,
      error: `Model validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function bindStoreGetter(req: Request): void {
  setStoreGetter(() => (req.context as RequestContext).store as any);
}

function toLegacyAppConfig(config: CoworkApiConfig, current: LegacyAppConfig | null): LegacyAppConfig {
  const providerName = config.apiType === 'openai' ? 'openai' : 'anthropic';
  const previousProviders = current?.providers ?? {};
  const previousProvider = previousProviders[providerName] ?? {};

  return {
    ...current,
    model: {
      ...(current?.model ?? {}),
      defaultModel: config.model,
      defaultModelProvider: providerName,
    },
    providers: {
      ...previousProviders,
      [providerName]: {
        ...previousProvider,
        enabled: true,
        apiKey: config.apiKey,
        baseUrl: config.baseURL,
        apiFormat: config.apiType === 'openai' ? 'openai' : 'anthropic',
        models: [{ id: config.model }],
      },
    },
  };
}

export function setupApiConfigRoutes(app: Router) {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    try {
      bindStoreGetter(req);
      const { config } = resolveCurrentApiConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get API config',
      });
    }
  });

  router.get('/check', async (req: Request, res: Response) => {
    try {
      bindStoreGetter(req);
      const probeModel = req.query.probeModel === 'true';
      const resolution = resolveCurrentApiConfig();

      if (probeModel && resolution.config) {
        const probe = await probeResolvedConfigReadiness(resolution.config);
        if (!probe.ok) {
          return res.json({
            hasConfig: false,
            config: resolution.config,
            error: 'error' in probe ? probe.error : 'Unknown error',
          });
        }
      }

      res.json({
        hasConfig: Boolean(resolution.config),
        config: resolution.config,
        ...(resolution.error ? { error: resolution.error } : {}),
      });
    } catch (error) {
      res.status(500).json({
        hasConfig: false,
        config: null,
        error: error instanceof Error ? error.message : 'Failed to check API config',
      });
    }
  });

  router.put('/', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const input = req.body as CoworkApiConfig;

      if (!input?.apiKey || !input?.baseURL || !input?.model) {
        return res.status(400).json({
          success: false,
          error: 'Invalid config: apiKey, baseURL, and model are required',
        });
      }

      const current = store.get<Record<string, unknown>>('app_config') ?? null;
      const draft = toLegacyAppConfig(input, current as LegacyAppConfig | null);
      const next = prepareAppConfigForStore(current, draft, 'api-config.put');
      store.set('app_config', next);
      syncAppConfigToEnv(next);

      bindStoreGetter(req);
      res.json({
        success: true,
        warning: 'Deprecated route: prefer PUT /api/store/app_config for full app config writes.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save API config',
      });
    }
  });

  app.use('/api/api-config', router);
}
