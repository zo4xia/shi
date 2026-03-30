import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { RequestContext } from '../src/index';
import { resolveConversationFileCacheConfig } from '../../src/shared/conversationFileCacheConfig';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import { parseFile } from '../libs/fileParser';

// In web version, these endpoints provide alternatives to Electron's file dialogs
// The frontend will need to implement file selection UI using <input type="file">
// These endpoints provide server-side file operations for saving/uploaded files

const MAX_INLINE_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_PARSE_INLINE_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_PARSE_INLINE_MAX_CHARS = 400_000;
const MAX_PARSE_INLINE_MAX_CHARS = 1_000_000;
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/json': '.json',
  'text/csv': '.csv',
};

const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/g;
type SaveInlineFilePurpose = 'attachment' | 'export';

const sanitizeAttachmentFileName = (value?: string): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return 'attachment';
  const fileName = path.basename(raw);
  const sanitized = fileName.replace(INVALID_FILE_NAME_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || 'attachment';
};

const inferAttachmentExtension = (fileName: string, mimeType?: string): string => {
  const fromName = path.extname(fileName).toLowerCase();
  if (fromName) return fromName;
  if (typeof mimeType === 'string') {
    const normalized = mimeType.toLowerCase().split(';')[0].trim();
    return MIME_EXTENSION_MAP[normalized] ?? '';
  }
  return '';
};

const resolveInlineAttachmentDirs = (
  req: Request,
  userDataPath: string,
  cwd?: string,
  purpose: SaveInlineFilePurpose = 'attachment',
): { primaryDir: string; cacheDir: string | null } => {
  // {BUG} bug-attachment-save-root-001
  // {说明} 分片文件“明明切出来了却找不到”时，先看这里。
  // {波及} 这里决定附件跟工作目录走、跟用户设置目录走，还是漂到 userData 黑箱目录。
  const appConfig = (req.context as RequestContext | undefined)?.store?.get('app_config');
  const conversationFileCache = resolveConversationFileCacheConfig(appConfig as Parameters<typeof resolveConversationFileCacheConfig>[0]);
  const cacheDir = conversationFileCache.directory.trim()
    ? path.join(path.resolve(conversationFileCache.directory.trim()), 'attachments', 'manual')
    : null;
  const coworkConfigWorkingDirectory = (() => {
    try {
      const requestContext = req.context as RequestContext | undefined;
      const raw = requestContext?.coworkStore?.getConfig()?.workingDirectory;
      return typeof raw === 'string' ? raw.trim() : '';
    } catch {
      return '';
    }
  })();
  const workspaceRoot = String(req.app.get('workspace') || getProjectRoot()).trim();

  if (purpose === 'export' && cacheDir) {
    // {标记} P1-FILE-PURPOSE-SPLIT: 导出产物优先落会话缓存目录，和运行态附件分流。
    return { primaryDir: cacheDir, cacheDir };
  }

  const preferredWorkingDirectory = [
    typeof cwd === 'string' ? cwd.trim() : '',
    coworkConfigWorkingDirectory,
  ].find((value) => Boolean(value)) || '';

  if (preferredWorkingDirectory) {
    const resolved = path.resolve(preferredWorkingDirectory);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      // {标记} P1-OPENCLAW-SKILL-COMPAT: 运行态附件主路径仍优先放工作目录，避免打断 skills 读取绝对路径。
      // {标记} P1-ATTACHMENT-WORKDIR-TRUTH: 前端若一时未透传 cwd，后端继续以 coworkConfig.workingDirectory 为兜底真相源。
      return {
        primaryDir: path.join(resolved, '.cowork-temp', 'attachments', 'manual'),
        cacheDir,
      };
    }
  }

  if (cacheDir) {
    // {标记} P1-CONVERSATION-CACHE-DIR: 没有工作目录时，缓存目录接管主落点。
    return { primaryDir: cacheDir, cacheDir };
  }

  if (workspaceRoot) {
    const resolvedWorkspace = path.resolve(workspaceRoot);
    if (fs.existsSync(resolvedWorkspace) && fs.statSync(resolvedWorkspace).isDirectory()) {
      // {标记} P1-ATTACHMENT-WORKSPACE-FALLBACK: 连 coworkConfig 都缺失时，至少回到当前项目根，避免落进用户数据黑箱目录。
      return {
        primaryDir: path.join(resolvedWorkspace, '.cowork-temp', 'attachments', 'manual'),
        cacheDir: null,
      };
    }
  }

  return {
    primaryDir: path.join(userDataPath, 'attachments'),
    cacheDir: null,
  };
};

export function setupDialogRoutes(app: Router) {
  const router = Router();
  const getWorkspaceRoot = (req: Request): string => String(req.app.get('workspace') || getProjectRoot());

  // GET /api/dialog/browse - 浏览目录，返回子文件夹列表
  router.get('/browse', async (req: Request, res: Response) => {
    try {
      const { path: dirPath } = req.query;
      // 默认从用户主目录开始
      const targetPath = (typeof dirPath === 'string' && dirPath.trim())
        ? path.resolve(dirPath.trim())
        : process.env.USERPROFILE || process.env.HOME || getWorkspaceRoot(req);

      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
        return res.json({ success: false, error: '路径不存在或不是文件夹' });
      }

      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
      const folders = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));

      // 计算父目录
      const parentPath = path.dirname(targetPath);
      const hasParent = parentPath !== targetPath; // 根目录时 dirname === 自身

      res.json({
        success: true,
        current: targetPath,
        parent: hasParent ? parentPath : null,
        folders,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '浏览目录失败',
      });
    }
  });

  // GET /api/dialog/drives - Windows 盘符列表
  router.get('/drives', async (_req: Request, res: Response) => {
    try {
      if (process.platform !== 'win32') {
        return res.json({ success: true, drives: ['/'] });
      }
      // 检测 A-Z 盘符
      const drives: string[] = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const drivePath = `${letter}:\\`;
        try {
          if (fs.existsSync(drivePath)) drives.push(drivePath);
        } catch { /* skip */ }
      }
      res.json({ success: true, drives });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取盘符失败',
      });
    }
  });

  // GET /api/dialog/resolve-dir - 根据目录名和可选的子文件列表推断绝对路径
  router.get('/resolve-dir', async (req: Request, res: Response) => {
    try {
      const dirName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
      const childNames = typeof req.query.children === 'string' ? req.query.children.split(',').filter(Boolean) : [];
      if (!dirName) {
        return res.status(400).json({ success: false, error: 'Missing name' });
      }

      // 在常见位置搜索匹配的目录
      const home = process.env.USERPROFILE || process.env.HOME || '';
      const searchRoots = [
        home,
        path.join(home, 'Desktop'),
        path.join(home, 'Documents'),
        path.join(home, 'Downloads'),
        path.join(home, 'Projects'),
        getWorkspaceRoot(req),
      ].filter(Boolean);

      for (const root of searchRoots) {
        const candidate = path.join(root, dirName);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            // 如果提供了子文件名，验证匹配度
            if (childNames.length > 0) {
              const entries = fs.readdirSync(candidate);
              const matchCount = childNames.filter(c => entries.includes(c)).length;
              if (matchCount < Math.min(childNames.length, 3)) continue; // 匹配度太低，跳过
            }
            return res.json({ success: true, path: candidate });
          }
        } catch { /* skip */ }
      }

      res.json({ success: false, error: '未找到匹配的目录' });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : '搜索失败' });
    }
  });

  // GET /api/dialog/directory - Get working directory info
  // In web version, this returns info about a directory path for validation
  router.get('/directory', async (req: Request, res: Response) => {
    try {
      const { path: dirPath } = req.query;

      if (!dirPath || typeof dirPath !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing query parameter: path',
        });
      }

      const resolvedPath = path.resolve(dirPath);
      const exists = fs.existsSync(resolvedPath);
      const isDirectory = exists ? fs.statSync(resolvedPath).isDirectory() : false;

      res.json({
        success: true,
        path: resolvedPath,
        exists,
        isDirectory,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check directory',
      });
    }
  });

  // POST /api/dialog/saveInlineFile - Save an uploaded file to disk
  router.post('/saveInlineFile', async (req: Request, res: Response) => {
    try {
      const { dataBase64, fileName, mimeType, cwd, purpose } = req.body;
      const userDataPath = req.app.get('userDataPath') as string;

      const dataBase64Str = typeof dataBase64 === 'string' ? dataBase64.trim() : '';
      if (!dataBase64Str) {
        return res.status(400).json({
          success: false,
          error: 'Missing file data',
        });
      }

      const buffer = Buffer.from(dataBase64Str, 'base64');
      if (!buffer.length) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file data',
        });
      }

      if (buffer.length > MAX_INLINE_ATTACHMENT_BYTES) {
        return res.status(413).json({
          success: false,
          error: `File too large (max ${Math.floor(MAX_INLINE_ATTACHMENT_BYTES / (1024 * 1024))}MB)`,
        });
      }

      const normalizedPurpose: SaveInlineFilePurpose = purpose === 'export' ? 'export' : 'attachment';
      const { primaryDir, cacheDir } = resolveInlineAttachmentDirs(req, userDataPath, cwd, normalizedPurpose);
      await fs.promises.mkdir(primaryDir, { recursive: true });
      if (cacheDir && cacheDir !== primaryDir) {
        await fs.promises.mkdir(cacheDir, { recursive: true });
      }

      const safeFileName = sanitizeAttachmentFileName(fileName);
      const extension = inferAttachmentExtension(safeFileName, mimeType);
      const baseName = extension ? safeFileName.slice(0, -extension.length) : safeFileName;
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const finalName = `${baseName || 'attachment'}-${uniqueSuffix}${extension}`;
      const outputPath = path.join(primaryDir, finalName);

      await fs.promises.writeFile(outputPath, buffer);
      if (cacheDir && cacheDir !== primaryDir) {
        const cachePath = path.join(cacheDir, finalName);
        await fs.promises.writeFile(cachePath, buffer);
      }
      res.json({ success: true, path: outputPath });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file',
      });
    }
  });

  // POST /api/dialog/parseInlineFile - Parse a local file into plain text for frontend chunking
  router.post('/parseInlineFile', async (req: Request, res: Response) => {
    try {
      const rawPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
      const requestedMaxChars = typeof req.body?.maxCharacters === 'number'
        ? Math.floor(req.body.maxCharacters)
        : DEFAULT_PARSE_INLINE_MAX_CHARS;

      if (!rawPath) {
        return res.status(400).json({
          success: false,
          error: 'Missing file path',
        });
      }

      const resolvedPath = path.resolve(rawPath);
      const stat = await fs.promises.stat(resolvedPath);

      if (!stat.isFile()) {
        return res.status(400).json({
          success: false,
          error: 'Not a file',
        });
      }

      if (stat.size > MAX_PARSE_INLINE_FILE_BYTES) {
        return res.status(413).json({
          success: false,
          error: `File too large (max ${Math.floor(MAX_PARSE_INLINE_FILE_BYTES / (1024 * 1024))}MB)`,
        });
      }

      const maxCharacters = Math.min(
        Math.max(1, requestedMaxChars),
        MAX_PARSE_INLINE_MAX_CHARS,
      );
      const buffer = await fs.promises.readFile(resolvedPath);
      const fileName = path.basename(resolvedPath) || resolvedPath;
      const parsed = await parseFile(fileName, buffer, { maxTextLength: maxCharacters });

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error || 'Failed to parse file',
          fileType: parsed.fileType,
        });
      }

      res.json({
        success: true,
        path: resolvedPath,
        fileName,
        fileType: parsed.fileType,
        text: parsed.text,
        truncated: Boolean(parsed.truncated),
        originalLength: parsed.originalLength ?? parsed.text.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse file',
      });
    }
  });

  // GET /api/dialog/readFileAsDataUrl - Read a file and return as data URL
  router.get('/readFileAsDataUrl', async (req: Request, res: Response) => {
    try {
      const { path: filePath } = req.query;

      if (typeof filePath !== 'string' || !filePath.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Missing query parameter: path',
        });
      }

      const MAX_READ_AS_DATA_URL_BYTES = 20 * 1024 * 1024;
      const MIME_BY_EXT: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
      };

      const resolvedPath = path.resolve(filePath.trim());
      const stat = await fs.promises.stat(resolvedPath);

      if (!stat.isFile()) {
        return res.status(400).json({
          success: false,
          error: 'Not a file',
        });
      }

      if (stat.size > MAX_READ_AS_DATA_URL_BYTES) {
        return res.status(413).json({
          success: false,
          error: `File too large (max ${Math.floor(MAX_READ_AS_DATA_URL_BYTES / (1024 * 1024))}MB)`,
        });
      }

      const buffer = await fs.promises.readFile(resolvedPath);
      const ext = path.extname(resolvedPath).toLowerCase();
      const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
      const base64 = buffer.toString('base64');

      res.json({
        success: true,
        dataUrl: `data:${mimeType};base64,${base64}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      });
    }
  });

  // Note: dialog:selectDirectory and dialog:selectFile are Electron-specific
  // In web version, use HTML file input elements:
  // <input type="file" webkitdirectory directory> for directory selection
  // <input type="file"> for file selection

  app.use('/api/dialog', router);
}
