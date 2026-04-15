import { Router, Request, Response } from 'express';
import type { RequestContext } from '../src/index';
import {
  getWechatBotBindingPath,
  getWechatBotCredentialsPath,
  getWechatBotRuntimeDir,
  mergeWechatBotConfigWithRuntime,
  syncWechatBotConfigToRuntime,
} from '../libs/wechatbotBridgeRuntime';
import { resolveRuntimeUserDataPath } from '../../src/shared/runtimeDataPaths';
import {
  createWechatBotQrLoginSession,
  getWechatBotQrLoginSession,
  waitWechatBotQrLoginSession,
} from '../libs/wechatbotQrLogin';
import {
  getWechatBotGatewayStatus,
  startWechatBotGateway,
  stopWechatBotGateway,
} from '../libs/wechatbotGateway';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i;

function isWechatBotQrLoginAllowed(req: Request): boolean {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) {
    return true;
  }
  return LOCALHOST_ORIGIN_RE.test(origin);
}

function buildWechatBotStatus(req: Request) {
  const { store } = req.context as RequestContext;
  const userDataPath = String(req.app.get('userDataPath') || resolveRuntimeUserDataPath());
  const stored = store.get('im_config');
  const config = mergeWechatBotConfigWithRuntime(stored, userDataPath);
  const configured = Boolean(config.botAccountId && config.botToken && config.agentRoleKey);
  const runtimeStatus = getWechatBotGatewayStatus();
  const bridgeReady = configured && runtimeStatus.bridgeReady;
  const connected = configured && runtimeStatus.connected;
  const error = runtimeStatus.lastError
    || (configured
      ? (connected ? null : '个人微信桥接已配置，但当前尚未启动。')
      : '请先完成官方扫码授权并绑定角色。');

  return {
    connected,
    bridgeReady,
    configured,
    enabled: config.enabled,
    bridgeMode: config.bridgeMode,
    accountId: config.botAccountId || null,
    linkedUserId: config.linkedUserId || null,
    agentRoleKey: config.agentRoleKey || null,
    baseUrl: config.baseUrl || null,
    syncBotReplies: config.syncBotReplies,
    runtimeDir: getWechatBotRuntimeDir(userDataPath),
    bindingPath: getWechatBotBindingPath(userDataPath),
    credentialsPath: getWechatBotCredentialsPath(userDataPath),
    credentialsPresent: Boolean(config.botToken),
    startedAt: runtimeStatus.startedAt,
    lastEventAt: runtimeStatus.lastEventAt,
    lastInboundAt: runtimeStatus.lastInboundAt,
    lastOutboundAt: runtimeStatus.lastOutboundAt,
    error,
  };
}

export function setupWechatBotBridgeRoutes(app: Router) {
  const router = Router();

  router.get('/status', (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        status: buildWechatBotStatus(req),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get wechatbot status',
      });
    }
  });

  router.post('/bridge/start', async (req: Request, res: Response) => {
    try {
      const context = req.context as RequestContext | undefined;
      if (!context) {
        throw new Error('request context not available');
      }
      const { store } = context;
      const userDataPath = String(req.app.get('userDataPath') || resolveRuntimeUserDataPath());
      const currentValue = store.get('im_config');
      const wechatbot = mergeWechatBotConfigWithRuntime(currentValue, userDataPath);

      if (!wechatbot.botAccountId || !wechatbot.botToken || !wechatbot.agentRoleKey) {
        return res.status(400).json({
          success: false,
          error: 'wechatbot bridge requires botAccountId, botToken and agentRoleKey',
        });
      }

      syncWechatBotConfigToRuntime({
        ...(currentValue && typeof currentValue === 'object' ? currentValue : {}),
        wechatbot,
      }, userDataPath);

      await startWechatBotGateway({
        config: wechatbot,
        deps: {
          coworkStore: context.coworkStore,
          store: context.store,
          userDataPath,
          workspaceRoot: String(req.app.get('workspace') || getProjectRoot()),
        },
      });

      res.json({
        success: true,
        status: buildWechatBotStatus(req),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start wechatbot bridge',
      });
    }
  });

  router.post('/bridge/stop', async (req: Request, res: Response) => {
    try {
      await stopWechatBotGateway();
      res.json({
        success: true,
        status: buildWechatBotStatus(req),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop wechatbot bridge',
      });
    }
  });

  router.post('/login/start', async (req: Request, res: Response) => {
    try {
      if (!isWechatBotQrLoginAllowed(req)) {
        return res.status(400).json({
          success: false,
          error: '个人微信官方扫码仅支持在本机 127.0.0.1 发起。服务器环境请先在本地完成扫码，再回填 Bot 信息。',
        });
      }

      const { store } = req.context as RequestContext;
      const currentValue = store.get('im_config');
      const wechatbot = mergeWechatBotConfigWithRuntime(currentValue);
      const session = await createWechatBotQrLoginSession(wechatbot.baseUrl || undefined);

      res.json({
        success: true,
        login: {
          sessionId: session.sessionId,
          phase: session.phase,
          qrcodeUrl: session.qrcodeUrl,
          expiresAt: session.expiresAt,
          usageTips: [
            '一期先支持文本与文档类消息。',
            '语音消息请先使用微信侧转文字后再发送给 Bot。',
          ],
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start wechatbot qr login',
      });
    }
  });

  router.post('/login/wait', async (req: Request, res: Response) => {
    try {
      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
      }

      const existing = getWechatBotQrLoginSession(sessionId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: '微信扫码会话不存在或已过期，请重新发起扫码。',
        });
      }

      const session = await waitWechatBotQrLoginSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '微信扫码会话不存在或已过期，请重新发起扫码。',
        });
      }

      res.json({
        success: true,
        login: {
          sessionId: session.sessionId,
          phase: session.phase,
          qrcodeUrl: session.qrcodeUrl,
          expiresAt: session.expiresAt,
          lastError: session.lastError,
          result: session.result,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to wait wechatbot qr login',
      });
    }
  });

  app.use('/api/im/wechatbot', router);
}
