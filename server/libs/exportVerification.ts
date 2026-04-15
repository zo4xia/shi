import fs from 'fs';
import path from 'path';
import { resolveConversationFileCacheConfig } from '../../src/shared/conversationFileCacheConfig';

export type ExportSnapshotEntry = {
  relativePath: string;
  absolutePath: string;
  size: number;
  modifiedAt: number;
};

export type ExportVerificationResult = {
  requested: boolean;
  verified: boolean;
  configured: boolean;
  message: string;
  entries: Array<{
    source: 'export' | 'legacy-export';
    relativePath: string;
    absolutePath: string;
    size: number;
    modifiedAt: number;
  }>;
};

export type ExportStatusPayload = {
  configured: boolean;
  roots: {
    primary: string | null;
    legacy: string | null;
  };
  entries: Array<{
    source: 'export' | 'legacy-export';
    relativePath: string;
    absolutePath: string;
    size: number;
    modifiedAt: number;
  }>;
};

export function looksLikeExportIntent(prompt: string): boolean {
  return /(导出|export|保存到你自己的 export 区|write.*export|save.*export)/i.test(String(prompt || ''));
}

export function resolveExportRoots(
  appConfig: Parameters<typeof resolveConversationFileCacheConfig>[0],
  roleKey: string
): {
  primary: string | null;
  legacy: string | null;
} {
  const conversationFileCache = resolveConversationFileCacheConfig(appConfig);
  const configuredRoot = conversationFileCache.directory.trim();
  if (!configuredRoot) {
    return {
      primary: null,
      legacy: null,
    };
  }

  const resolvedRoot = path.resolve(configuredRoot);
  return {
    primary: path.join(resolvedRoot, roleKey, 'exports'),
    legacy: path.join(resolvedRoot, roleKey, 'attachments', 'exports'),
  };
}

export function collectExportSnapshot(rootPath: string | null): Map<string, ExportSnapshotEntry> {
  const snapshot = new Map<string, ExportSnapshotEntry>();
  if (!rootPath || !fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return snapshot;
  }

  const walk = (currentPath: string) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stats = fs.statSync(absolutePath);
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, '/');
      snapshot.set(relativePath, {
        relativePath,
        absolutePath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
      });
    }
  };

  walk(rootPath);
  return snapshot;
}

export function collectNewExportEntries(
  before: Map<string, ExportSnapshotEntry>,
  after: Map<string, ExportSnapshotEntry>
): ExportSnapshotEntry[] {
  return Array.from(after.values())
    .filter((entry) => {
      const previous = before.get(entry.relativePath);
      if (!previous) {
        return true;
      }
      return previous.size !== entry.size || previous.modifiedAt !== entry.modifiedAt;
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function buildExportStatusPayload(params: {
  roots: { primary: string | null; legacy: string | null };
  limit?: number;
}): ExportStatusPayload {
  const limit = Math.max(1, Math.min(100, Math.floor(params.limit ?? 20)));
  const primaryEntries = Array.from(collectExportSnapshot(params.roots.primary).values())
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, limit)
    .map((entry) => ({ ...entry, source: 'export' as const }));
  const legacyEntries = Array.from(collectExportSnapshot(params.roots.legacy).values())
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, limit)
    .map((entry) => ({ ...entry, source: 'legacy-export' as const }));

  return {
    configured: Boolean(params.roots.primary),
    roots: params.roots,
    entries: [...primaryEntries, ...legacyEntries]
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, limit),
  };
}

export function buildExportVerificationResult(params: {
  exportIntent: boolean;
  roots: { primary: string | null; legacy: string | null };
  newPrimaryEntries: ExportSnapshotEntry[];
  newLegacyEntries: ExportSnapshotEntry[];
}): ExportVerificationResult {
  const { exportIntent, roots, newPrimaryEntries, newLegacyEntries } = params;
  const entries = [
    ...newPrimaryEntries.map((entry) => ({ ...entry, source: 'export' as const })),
    ...newLegacyEntries.map((entry) => ({ ...entry, source: 'legacy-export' as const })),
  ];

  if (entries.length > 0) {
    return {
      requested: exportIntent,
      verified: true,
      configured: true,
      message: [
        '导出核验：这轮已经在服务端看到了新的结果文件。',
        ...entries.slice(0, 8).map((entry) => `- [${entry.source}] ${entry.relativePath}`),
      ].join('\n'),
      entries,
    };
  }

  if (!exportIntent) {
    return {
      requested: false,
      verified: false,
      configured: Boolean(roots.primary),
      message: '',
      entries: [],
    };
  }

  if (!roots.primary) {
    return {
      requested: true,
      verified: false,
      configured: false,
      message: '导出核验：当前还没有配置 export home，所以这轮无法从服务端核验导出结果是否真正落盘。',
      entries: [],
    };
  }

  return {
    requested: true,
    verified: false,
    configured: true,
    message: '导出核验：这轮没有在 export 区发现新的结果文件。',
    entries: [],
  };
}
