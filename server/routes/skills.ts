import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { RequestContext } from '../src/index';
import { broadcastToAll } from '../websocket';
import { ensureRoleRuntimeDirs, syncRoleSkillIndexes } from '../libs/roleSkillFiles';
import { syncRoleCapabilitySnapshots } from '../libs/roleRuntimeViews';

type UploadedSkillPayload =
  | {
      kind: 'zip';
      fileName: string;
      dataUrl: string;
      displayName?: string;
    }
  | {
      kind: 'file';
      fileName: string;
      dataUrl: string;
      displayName?: string;
    }
  | {
      kind: 'folder';
      folderName: string;
      files: Array<{ relativePath: string; dataUrl: string }>;
      displayName?: string;
    };

function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeCategory(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid uploaded file payload');
  }
  return Buffer.from(match[1], 'base64');
}

function sanitizeUploadedName(value: string, fallback: string): string {
  const base = path.basename(value || fallback).replace(/[\\/:*?"<>|]+/g, '-').trim();
  return base || fallback;
}

function normalizeRelativeUploadPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid uploaded folder structure');
  }
  return segments.join('/');
}

export function materializeUploadedSkillSource(tempRoot: string, payload: UploadedSkillPayload): string {
  if (payload.kind === 'zip' || payload.kind === 'file') {
    const fileName = sanitizeUploadedName(payload.fileName, payload.kind === 'zip' ? 'skill.zip' : 'SKILL.md');
    const targetPath = path.join(tempRoot, fileName);
    fs.writeFileSync(targetPath, decodeDataUrl(payload.dataUrl));
    return targetPath;
  }

  const folderName = sanitizeUploadedName(payload.folderName, 'skill-folder');
  const rootDir = path.join(tempRoot, folderName);
  fs.mkdirSync(rootDir, { recursive: true });

  for (const file of payload.files) {
    const normalizedRelativePath = normalizeRelativeUploadPath(file.relativePath);
    const trimmedRelativePath = normalizedRelativePath.startsWith(`${folderName}/`)
      ? normalizedRelativePath.slice(folderName.length + 1)
      : normalizedRelativePath;
    const finalRelativePath = normalizeRelativeUploadPath(trimmedRelativePath || path.basename(normalizedRelativePath));
    const targetPath = path.join(rootDir, finalRelativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, decodeDataUrl(file.dataUrl));
  }

  return rootDir;
}

export function setupSkillsRoutes(app: Router) {
  const router = Router();
  const SKILL_MARKETPLACE_FROZEN = true;

  function syncRoleIndexes(req: Request): void {
    // {路标} FLOW-SKILLS-SYNC-RUNTIME
    // {FLOW} SKILLS-WAREHOUSE-SIDE-EFFECT: 技能仓库层一旦改动，需要立即重建 roles/*/skills.json 与 capability snapshot。
    const userDataPath = String(req.app.get('userDataPath') || '');
    if (!userDataPath) return;
    const { store, skillManager, mcpStore } = req.context as RequestContext;
    ensureRoleRuntimeDirs(userDataPath);
    syncRoleSkillIndexes(userDataPath, store, skillManager);
    syncRoleCapabilitySnapshots(userDataPath, store, skillManager, mcpStore);
  }

  // {路标} FLOW-ROUTE-SKILLS
  // GET /api/skills - List all skills
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const skills = skillManager.listSkills();
      res.json({ success: true, skills });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load skills',
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILLS
  // POST /api/skills/enabled - Set skill enabled state
  router.post('/enabled', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const { id, enabled } = req.body;

      if (typeof id !== 'string' || typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameters: id (string) and enabled (boolean) required',
        });
      }

      const skills = skillManager.setSkillEnabled(id, enabled);
      syncRoleIndexes(req);
      // Emit skills changed event via WebSocket
      broadcastToAll({
        type: 'skills:changed',
        data: { skills },
      });
      res.json({ success: true, skills });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update skill',
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILLS
  // PUT /api/skills/:id/metadata - Update local skill metadata overrides
  router.put('/:id/metadata', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const category = normalizeCategory(req.body?.category);
      const skill = skillManager.listSkills().find((item) => item.id === req.params.id);

      if (!skill) {
        return res.status(404).json({
          success: false,
          error: 'Skill not found',
        });
      }

      const skills = skillManager.setSkillCategory(req.params.id, category);
      broadcastToAll({
        type: 'skills:changed',
        data: { skills },
      });
      res.json({ success: true, skills });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update skill metadata',
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILLS
  // DELETE /api/skills/:id - Delete a skill
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { skillManager, store } = req.context as RequestContext;
      const deletedSkill = skillManager.listSkills().find((skill) => skill.id === req.params.id) ?? null;
      const skills = skillManager.deleteSkill(req.params.id);
      try {
        const db = store.getDatabase();
        db.run(
          'DELETE FROM skill_role_configs WHERE skill_id = ? OR skill_name = ? OR skill_name = ?',
          [req.params.id, deletedSkill?.name ?? req.params.id, deletedSkill?.displayName ?? deletedSkill?.name ?? req.params.id],
        );
        store.getSaveFunction()();
      } catch (cleanupError) {
        console.warn('[skills] Failed to cleanup skill_role_configs after delete:', cleanupError);
      }
      syncRoleIndexes(req);
      broadcastToAll({
        type: 'skills:changed',
        data: { skills },
      });
      res.json({ success: true, skills });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete skill',
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILLS
  // POST /api/skills/download - Download a skill from source
  router.post('/download', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const { source, displayName } = req.body;

      if (typeof source !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid parameter: source (string) required',
        });
      }

      const result = await skillManager.downloadSkill(source);
      const normalizedDisplayName = normalizeDisplayName(displayName);
      if (result.success && normalizedDisplayName && result.importedSkills?.length) {
        for (const skill of result.importedSkills) {
          skillManager.setSkillDisplayName(skill.id, normalizedDisplayName);
        }
        const refreshedSkills = skillManager.listSkills();
        result.skills = refreshedSkills;
        result.importedSkills = refreshedSkills.filter((skill) => result.importedSkills?.some((item) => item.id === skill.id));
      }
      if (result.success) {
        syncRoleIndexes(req);
      }
      if (result.success && result.skills) {
        broadcastToAll({
          type: 'skills:changed',
          data: { skills: result.skills },
        });
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download skill',
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILLS
  // POST /api/skills/import-upload - Import browser-uploaded skill file/folder
  router.post('/import-upload', async (req: Request, res: Response) => {
    let tempRoot: string | null = null;
    try {
      const { skillManager } = req.context as RequestContext;
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-skill-upload-'));
      const payload = req.body as UploadedSkillPayload;
      const sourcePath = materializeUploadedSkillSource(tempRoot, payload);
      const result = await skillManager.downloadSkill(sourcePath, { strictSingleSkill: true });
      const normalizedDisplayName = normalizeDisplayName(payload.displayName);
      if (result.success && normalizedDisplayName && result.importedSkills?.length) {
        for (const skill of result.importedSkills) {
          skillManager.setSkillDisplayName(skill.id, normalizedDisplayName);
        }
        const refreshedSkills = skillManager.listSkills();
        result.skills = refreshedSkills;
        result.importedSkills = refreshedSkills.filter((skill) => result.importedSkills?.some((item) => item.id === skill.id));
      }
      if (result.success) {
        syncRoleIndexes(req);
      }
      if (result.success && result.skills) {
        broadcastToAll({
          type: 'skills:changed',
          data: { skills: result.skills },
        });
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import uploaded skill',
      });
    } finally {
      if (tempRoot) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  // GET /api/skills/marketplace - Fetch from GitHub claude-skill-registry
  const REGISTRY_URL = 'https://raw.githubusercontent.com/majiayu000/claude-skill-registry/main/registry.json';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour (GitHub在中国慢，延长缓存)
  let registryCache: { data: unknown; fetchedAt: number } | null = null;

  const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
    development: { en: 'Development', zh: '开发' },
    documents: { en: 'Documents', zh: '文档' },
    data: { en: 'Data', zh: '数据' },
    design: { en: 'Design', zh: '设计' },
    productivity: { en: 'Productivity', zh: '效率' },
    testing: { en: 'Testing', zh: '测试' },
    marketing: { en: 'Marketing', zh: '营销' },
    product: { en: 'Product', zh: '产品' },
  };

  function deriveSkillName(entry: { name?: string; path?: string; repo?: string }): string {
    if (entry.name) return entry.name;
    if (entry.path) {
      const segments = entry.path.split('/').filter((s: string) => s && s !== 'SKILL.md' && s !== '.claude' && s !== '.agents' && s !== 'skills');
      if (segments.length > 0) return segments[segments.length - 1];
    }
    if (entry.repo) return entry.repo.split('/').pop() || 'unknown';
    return 'unknown';
  }

  function transformRegistryEntry(entry: any): any {
    const skillName = deriveSkillName(entry);
    const repo = entry.repo || '';
    const tags = [entry.category, ...(entry.tags || [])].filter(Boolean);
    const skillPath = entry.path || '';
    // Use HEAD ref so it resolves to default branch
    const downloadUrl = repo && skillPath
      ? `https://raw.githubusercontent.com/${repo}/HEAD/${skillPath}`
      : '';
    return {
      id: repo ? `${repo}/${skillName}` : skillName,
      name: skillName,
      description: entry.description || '',
      tags,
      url: downloadUrl,
      version: '1.0.0',
      source: {
        from: entry.source || 'GitHub',
        url: repo ? `https://github.com/${repo}` : '',
        author: repo ? repo.split('/')[0] : '',
      },
      stars: entry.stars || 0,
      repo,
      category: entry.category || '',
      featured: entry.featured || false,
    };
  }

  router.get('/marketplace', async (_req: Request, res: Response) => {
    if (SKILL_MARKETPLACE_FROZEN) {
      return res.json({
        success: true,
        data: {
          marketplace: [],
          marketTags: [],
          frozen: true,
          message: '技能市场已冰封，等待后续替换为新的远程市场。',
        },
      });
    }

    try {
      const now = Date.now();
      if (registryCache && (now - registryCache.fetchedAt) < CACHE_TTL) {
        return res.json(registryCache.data);
      }

      const https = await import('https');
      const raw = await new Promise<string>((resolve, reject) => {
        const httpsReq = https.get(REGISTRY_URL, { timeout: 5000 }, (response) => {
          // Follow redirects (GitHub raw sometimes 301/302)
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            https.get(response.headers.location, { timeout: 5000 }, (r2) => {
              let body = '';
              r2.setEncoding('utf8');
              r2.on('data', (chunk: string) => { body += chunk; });
              r2.on('end', () => resolve(body));
              r2.on('error', reject);
            }).on('error', reject);
            return;
          }
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
        httpsReq.on('error', reject);
        httpsReq.on('timeout', () => { httpsReq.destroy(); reject(new Error('Request timeout')); });
      });

      const registry = JSON.parse(raw);
      const skills: any[] = Array.isArray(registry.skills) ? registry.skills : [];

      const marketplace = skills
        .filter((s: any) => s.repo && s.path)
        .map(transformRegistryEntry);

      const marketTags = Object.entries(CATEGORY_LABELS).map(([id, labels]) => ({
        id,
        en: labels.en,
        zh: labels.zh,
      }));

      const result = {
        success: true,
        data: { marketplace, marketTags },
      };

      registryCache = { data: result, fetchedAt: now };
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch skill marketplace',
      });
    }
  });

  // GET /api/skills/root - Get skills root directory path
  router.get('/root', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const root = skillManager.getSkillsRoot();
      res.json({ success: true, path: root });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve skills root',
      });
    }
  });

  // GET /api/skills/autoRoutingPrompt - Get auto-routing prompt
  router.get('/autoRoutingPrompt', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const prompt = skillManager.buildAutoRoutingPrompt();
      res.json({ success: true, prompt });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build auto-routing prompt',
      });
    }
  });

  // GET /api/skills/:skillId/config - Get skill config
  router.get('/:skillId/config', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const result = skillManager.getSkillConfig(req.params.skillId);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get skill config',
      });
    }
  });

  // PUT /api/skills/:skillId/config - Set skill config
  router.put('/:skillId/config', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const config = req.body;
      const result = skillManager.setSkillConfig(req.params.skillId, config);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set skill config',
      });
    }
  });

  // POST /api/skills/:skillId/testEmail - Test email connectivity
  router.post('/:skillId/testEmail', async (req: Request, res: Response) => {
    try {
      const { skillManager } = req.context as RequestContext;
      const config = req.body;
      const result = await skillManager.testEmailConnectivity(req.params.skillId, config);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test email connectivity',
      });
    }
  });

  // {路标} FLOW-MOUNT-SKILLS
  app.use('/api/skills', router);
}
