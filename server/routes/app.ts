import fs from 'fs';
import { Router, Request, Response } from 'express';
import type { RequestContext } from '../src/index';
import { resolveEnvSyncTargetPath } from './store';

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
    const workspace = req.app.get('workspace') || process.env.HOME || '';
    res.json({ path: workspace });
  });

  // GET /api/app/runtimePaths - Get runtime paths that affect config writes
  router.get('/runtimePaths', (req: Request, res: Response) => {
    const workspace = String(req.app.get('workspace') || process.env.HOME || '');
    const envSyncTargetPath = resolveEnvSyncTargetPath();
    res.json({
      workspacePath: workspace,
      envSyncTargetPath,
      envSyncTargetExists: fs.existsSync(envSyncTargetPath),
    });
  });

  // Note: App update routes (appUpdate:download, appUpdate:install) are Electron-specific
  // and not applicable to web version. These endpoints return 404 or appropriate message.

  app.use('/api/app', router);
}
