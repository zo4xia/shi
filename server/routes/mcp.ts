import { Router, Request, Response } from 'express';
import type { RequestContext } from '../src/index';
import { probePlaywrightRuntime } from '../libs/playwrightRuntime';
import { syncRoleCapabilitySnapshots } from '../libs/roleRuntimeViews';
import { broadcastToAll } from '../websocket';

export function setupMcpRoutes(app: Router) {
  const router = Router();
  const MCP_MARKETPLACE_FROZEN = true;

  const syncCapabilitySnapshots = (req: Request): void => {
    const userDataPath = String(req.app.get('userDataPath') || '');
    if (!userDataPath) return;
    const { store, skillManager, mcpStore } = req.context as RequestContext;
    syncRoleCapabilitySnapshots(userDataPath, store, skillManager, mcpStore);
  };

  // GET /api/mcp - List all MCP servers
  // {路标} FLOW-ROUTE-MCP
  router.get('/', (req: Request, res: Response) => {
    try {
      const { mcpStore } = req.context as RequestContext;
      const servers = mcpStore.listServers();
      res.json({ success: true, servers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list MCP servers',
      });
    }
  });

  router.get('/playwright-health', async (req: Request, res: Response) => {
    try {
      const { mcpStore } = req.context as RequestContext;
      const servers = mcpStore.listServers();
      const playwrightServer = servers.find((server) => (
        server.registryId === 'playwright' || server.name === 'Playwright Browser'
      )) || null;
      const health = await probePlaywrightRuntime();
      res.json({
        success: true,
        playwrightServer,
        health,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to inspect Playwright runtime',
      });
    }
  });

  // POST /api/mcp - Create a new MCP server
  // {路标} FLOW-ROUTE-MCP
  router.post('/', (req: Request, res: Response) => {
    try {
      const { mcpStore } = req.context as RequestContext;
      const data = req.body;
      mcpStore.createServer(data as any);
      syncCapabilitySnapshots(req);
      const servers = mcpStore.listServers();
      broadcastToAll({
        type: 'mcp:changed',
        data: { servers },
      });
      res.json({ success: true, servers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create MCP server',
      });
    }
  });

  // PUT /api/mcp/:id - Update an MCP server
  // {路标} FLOW-ROUTE-MCP
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const { mcpStore } = req.context as RequestContext;
      mcpStore.updateServer(req.params.id, req.body as any);
      syncCapabilitySnapshots(req);
      const servers = mcpStore.listServers();
      broadcastToAll({
        type: 'mcp:changed',
        data: { servers },
      });
      res.json({ success: true, servers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update MCP server',
      });
    }
  });

  // DELETE /api/mcp/:id - Delete an MCP server
  // {路标} FLOW-ROUTE-MCP
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { mcpStore } = req.context as RequestContext;
      mcpStore.deleteServer(req.params.id);
      syncCapabilitySnapshots(req);
      const servers = mcpStore.listServers();
      broadcastToAll({
        type: 'mcp:changed',
        data: { servers },
      });
      res.json({ success: true, servers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete MCP server',
      });
    }
  });

  // POST /api/mcp/:id/enabled - Set MCP server enabled state
  // {路标} FLOW-ROUTE-MCP
  router.post('/:id/enabled', (req: Request, res: Response) => {
    try {
      const { mcpStore } = req.context as RequestContext;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter: enabled (boolean) required',
        });
      }

      mcpStore.setEnabled(req.params.id, enabled);
      syncCapabilitySnapshots(req);
      const servers = mcpStore.listServers();
      broadcastToAll({
        type: 'mcp:changed',
        data: { servers },
      });
      res.json({ success: true, servers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update MCP server',
      });
    }
  });

  // GET /api/mcp/marketplace - Fetch MCP marketplace
  // {路标} FLOW-ROUTE-MCP
  router.get('/marketplace', async (_req: Request, res: Response) => {
    if (MCP_MARKETPLACE_FROZEN) {
      return res.json({
        success: true,
        data: {
          servers: [],
          categories: [],
          frozen: true,
          message: 'MCP 市场已冰封，等待后续替换为新的远程市场。',
        },
      });
    }

    try {
      // {标记} 开发环境也使用生产 API
      const url = 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/prod/mcp-marketplace';

      const https = await import('https');
      const data = await new Promise<string>((resolve, reject) => {
        const httpsRequest = https.get(url, { timeout: 10000 }, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            response.resume();
            return;
          }
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => { body += chunk; });
          response.on('end', () => resolve(body));
          response.on('error', reject);
        });
        httpsRequest.on('error', reject);
        httpsRequest.on('timeout', () => { httpsRequest.destroy(); reject(new Error('Request timeout')); });
      });

      const json = JSON.parse(data);
      const value = json?.data?.value;
      if (!value) {
        return res.status(500).json({ success: false, error: 'Invalid response: missing data.value' });
      }

      const marketplace = typeof value === 'string' ? JSON.parse(value) : value;
      res.json({ success: true, data: marketplace });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch marketplace',
      });
    }
  });

  // {路标} FLOW-MOUNT-MCP
  app.use('/api/mcp', router);
}
