import { randomInt } from 'crypto';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import type { RequestContext } from '../src/index';
import { resolveEnvSyncTargetPath } from './store';

const TRIAL_ACCESS_STATE_KEY = 'trial_access_daily_key_v1';
const DEFAULT_TRIAL_ACCESS_TIMEZONE = 'Asia/Shanghai';

type TrialAccessState = {
  day: string;
  code: string;
  generatedAt: string;
  webhookSentAt?: string | null;
  lastVerifiedAt?: string | null;
};

const isTrialAccessEnabled = (): boolean => {
  const raw = String(process.env.UCLAW_TRIAL_ACCESS_ENABLED || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const getTrialAccessTimezone = (): string => (
  String(process.env.UCLAW_TRIAL_ACCESS_TIMEZONE || DEFAULT_TRIAL_ACCESS_TIMEZONE).trim() || DEFAULT_TRIAL_ACCESS_TIMEZONE
);

const getTrialAccessWebhookUrl = (): string => (
  String(process.env.UCLAW_TRIAL_ACCESS_WEBHOOK_URL || '').trim()
);

const getCurrentTrialAccessDay = (): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: getTrialAccessTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
};

const generateTrialAccessCode = (length = 8): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }
  return code;
};

const pushTrialAccessWebhook = async (state: TrialAccessState, req?: Request): Promise<boolean> => {
  const webhookUrl = getTrialAccessWebhookUrl();
  if (!webhookUrl) {
    console.warn('[trial-access] Webhook URL missing; skip notification');
    return false;
  }

  const protocol = req?.protocol || 'http';
  const host = req?.get('host') || '';
  const accessUrl = host ? `${protocol}://${host}` : '';
  const payload = {
    event: 'uclaw_trial_access_daily_code',
    day: state.day,
    code: state.code,
    generatedAt: state.generatedAt,
    timezone: getTrialAccessTimezone(),
    app: 'UCLAW',
    accessUrl,
    text: `UCLAW 客户体验版 24小时密钥\n日期: ${state.day}\n密钥: ${state.code}${accessUrl ? `\n入口: ${accessUrl}` : ''}`,
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook push failed: HTTP ${response.status}`);
  }

  return true;
};

const ensureTrialAccessState = async (store: RequestContext['store'], req?: Request): Promise<TrialAccessState> => {
  const currentDay = getCurrentTrialAccessDay();
  const current = store.get<TrialAccessState>(TRIAL_ACCESS_STATE_KEY) ?? null;

  if (current?.day === currentDay && current.code?.trim()) {
    if (!current.webhookSentAt) {
      try {
        const sent = await pushTrialAccessWebhook(current, req);
        if (sent) {
          const nextState: TrialAccessState = {
            ...current,
            webhookSentAt: new Date().toISOString(),
          };
          store.set(TRIAL_ACCESS_STATE_KEY, nextState);
          return nextState;
        }
      } catch (error) {
        console.error('[trial-access] Failed to resend webhook:', error);
      }
    }
    return current;
  }

  const nextState: TrialAccessState = {
    day: currentDay,
    code: generateTrialAccessCode(),
    generatedAt: new Date().toISOString(),
    webhookSentAt: null,
    lastVerifiedAt: null,
  };
  store.set(TRIAL_ACCESS_STATE_KEY, nextState);

  try {
    const sent = await pushTrialAccessWebhook(nextState, req);
    if (sent) {
      nextState.webhookSentAt = new Date().toISOString();
      store.set(TRIAL_ACCESS_STATE_KEY, nextState);
    }
  } catch (error) {
    console.error('[trial-access] Failed to push webhook:', error);
  }

  return nextState;
};

export function setupAppRoutes(app: Router) {
  const router = Router();

  // GET /api/app/version - Get app version
  router.get('/version', (req: Request, res: Response) => {
    const version = process.env.npm_package_version || '0.0.0';
    res.json({ version });
  });

  // GET /api/app/locale - Get system locale
  router.get('/locale', (req: Request, res: Response) => {
    const locale = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || 'en-US';
    res.json({ locale: locale.split('.')[0].replace('_', '-') });
  });

  // GET /api/app/autoLaunch - Get auto-launch status
  router.get('/autoLaunch', async (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const enabled = store.get<boolean>('auto_launch_enabled') ?? false;
      res.json({ enabled });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get auto-launch status',
      });
    }
  });

  // PUT /api/app/autoLaunch - Set auto-launch status
  router.put('/autoLaunch', async (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter: enabled (boolean) required',
        });
      }

      // In web version, we just store the preference
      // Auto-launch on startup is platform-specific and not applicable
      store.set('auto_launch_enabled', enabled);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set auto-launch',
      });
    }
  });

  // GET /api/app/info - Get app information
  router.get('/info', (req: Request, res: Response) => {
    res.json({
      name: 'UCLAW',
      version: process.env.npm_package_version || '0.0.0',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // GET /api/app/workspace - Get workspace path
  router.get('/workspace', (req: Request, res: Response) => {
    const workspace = req.app.get('workspace') || getProjectRoot();
    res.json({ path: workspace });
  });

  // GET /api/app/runtimePaths - Get runtime paths that affect config writes
  router.get('/runtimePaths', (req: Request, res: Response) => {
    const workspace = String(req.app.get('workspace') || getProjectRoot());
    const envSyncTargetPath = resolveEnvSyncTargetPath();
    res.json({
      workspacePath: workspace,
      envSyncTargetPath,
      envSyncTargetExists: fs.existsSync(envSyncTargetPath),
    });
  });

  router.get('/trialAccess/status', async (req: Request, res: Response) => {
    try {
      const enabled = isTrialAccessEnabled();
      if (!enabled) {
        return res.json({
          enabled: false,
          currentDay: getCurrentTrialAccessDay(),
        });
      }

      const { store } = req.context as RequestContext;
      const state = await ensureTrialAccessState(store, req);
      res.json({
        enabled: true,
        currentDay: state.day,
        timezone: getTrialAccessTimezone(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get trial access status',
      });
    }
  });

  router.post('/trialAccess/verify', async (req: Request, res: Response) => {
    try {
      const enabled = isTrialAccessEnabled();
      if (!enabled) {
        return res.json({
          success: true,
          enabled: false,
          currentDay: getCurrentTrialAccessDay(),
        });
      }

      const { code } = req.body as { code?: string };
      const normalizedCode = String(code || '').trim().toUpperCase();
      if (!normalizedCode) {
        return res.status(400).json({
          success: false,
          error: '请输入24小时密钥',
        });
      }

      const { store } = req.context as RequestContext;
      const state = await ensureTrialAccessState(store, req);
      if (normalizedCode !== state.code) {
        return res.status(401).json({
          success: false,
          error: '密钥不正确，请联系夏夏领取今天的24小时密钥',
        });
      }

      const nextState: TrialAccessState = {
        ...state,
        lastVerifiedAt: new Date().toISOString(),
      };
      store.set(TRIAL_ACCESS_STATE_KEY, nextState);

      return res.json({
        success: true,
        enabled: true,
        currentDay: nextState.day,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify trial access code',
      });
    }
  });

  // Note: App update routes (appUpdate:download, appUpdate:install) are Electron-specific
  // and not applicable to web version. These endpoints return 404 or appropriate message.

  app.use('/api/app', router);
}
