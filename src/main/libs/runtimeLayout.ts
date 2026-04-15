import { existsSync } from 'fs';
import path from 'path';
import { app } from '../electron';
import { ENV_ALIAS_PAIRS, readEnvAliasPair } from '../../shared/envAliases';
import { getProjectRoot } from '../../shared/runtimeDataPaths';

function normalizeDevAppRoot(appPath: string): string {
  const normalized = appPath.replace(/\\/g, '/').replace(/\/+$/, '');

  if (normalized.endsWith('/dist-electron/main')) {
    return path.resolve(appPath, '..', '..');
  }

  if (normalized.endsWith('/dist-electron')) {
    return path.resolve(appPath, '..');
  }

  if (normalized.endsWith('/dist')) {
    return path.resolve(appPath, '..');
  }

  return appPath;
}

export function isBundledRuntime(): boolean {
  return Boolean(app.isPackaged);
}

export function getRuntimeAppRoot(): string {
  const configuredRoot = readEnvAliasPair(ENV_ALIAS_PAIRS.appRoot);
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const appPath = app.getAppPath();
  return isBundledRuntime() ? appPath : normalizeDevAppRoot(appPath);
}

export function getRuntimeResourcesRoot(): string {
  if (isBundledRuntime()) {
    return process.resourcesPath || path.join(getRuntimeAppRoot(), 'resources');
  }

  const configuredRoot = readEnvAliasPair(ENV_ALIAS_PAIRS.resourcesRoot);
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const candidates = [
    path.join(getRuntimeAppRoot(), 'resources'),
    path.join(getProjectRoot(), 'resources'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function getBundledNodeModulesRoot(): string {
  if (isBundledRuntime()) {
    return path.join(getRuntimeResourcesRoot(), 'app.asar.unpacked', 'node_modules');
  }

  const candidates = [
    path.join(getRuntimeAppRoot(), 'node_modules'),
    path.join(getProjectRoot(), 'node_modules'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function getBundledNodeModuleEntry(...segments: string[]): string {
  return path.join(getBundledNodeModulesRoot(), ...segments);
}

export function getRuntimeAppPath(...segments: string[]): string {
  return path.join(getRuntimeAppRoot(), ...segments);
}

export function getRuntimeResourcePath(...segments: string[]): string {
  return path.join(getRuntimeResourcesRoot(), ...segments);
}
