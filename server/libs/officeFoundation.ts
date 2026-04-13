import fs from 'fs';
import path from 'path';
import type { NativeCapabilityEntryConfig } from '../../src/shared/nativeCapabilities/config';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';

export type OfficeFoundationProbeResult = {
  available: boolean;
  resolvedPath: string | null;
  source: 'configured' | 'project-runtime' | 'project-tools' | 'localappdata' | 'none';
  checkedPaths: string[];
  message: string;
};

function buildCandidatePaths(entry?: NativeCapabilityEntryConfig): Array<{
  path: string;
  source: OfficeFoundationProbeResult['source'];
}> {
  const candidates: Array<{ path: string; source: OfficeFoundationProbeResult['source'] }> = [];
  const configuredPath = String(entry?.discovery?.binaryPath || '').trim();
  const projectRoot = getProjectRoot();

  const explicitCandidate = configuredPath
    ? path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(projectRoot, configuredPath)
    : '';
  if (explicitCandidate) {
    candidates.push({ path: explicitCandidate, source: 'configured' });
  }

  if (entry?.discovery?.searchCommonInstallDirs !== false) {
    candidates.push({
      path: path.join(projectRoot, '.uclaw', 'web', 'vendor', 'officecli', 'officecli.exe'),
      source: 'project-runtime',
    });
    candidates.push({
      path: path.join(projectRoot, 'tools', 'officecli', 'officecli.exe'),
      source: 'project-tools',
    });

    const localAppData = String(process.env.LOCALAPPDATA || '').trim();
    if (localAppData) {
      candidates.push({
        path: path.join(localAppData, 'OfficeCli', 'officecli.exe'),
        source: 'localappdata',
      });
    }
  }

  const deduped = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = path.normalize(candidate.path);
    if (deduped.has(normalized)) {
      return false;
    }
    deduped.add(normalized);
    return true;
  });
}

export function probeOfficeFoundation(entry?: NativeCapabilityEntryConfig): OfficeFoundationProbeResult {
  const candidates = buildCandidatePaths(entry);
  const checkedPaths = candidates.map((candidate) => candidate.path);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate.path) && fs.statSync(candidate.path).isFile()) {
        return {
          available: true,
          resolvedPath: candidate.path,
          source: candidate.source,
          checkedPaths,
          message: `已发现 Office 可执行文件：${candidate.path}`,
        };
      }
    } catch {
      // ignore probe errors and continue to next candidate
    }
  }

  return {
    available: false,
    resolvedPath: null,
    source: 'none',
    checkedPaths,
    message: checkedPaths.length > 0
      ? '未发现可用的 Office 可执行文件；当前不会伪装成已接入。'
      : '当前没有配置 Office 可执行文件路径，也没有启用常见目录探测。',
  };
}
