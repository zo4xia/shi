import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assignEnvAlias, ENV_ALIAS_PAIRS, readEnvAliasPair } from './envAliases';

export const PROJECT_RUNTIME_DIRNAME = '.uclaw';
export const WEB_RUNTIME_SUBDIR = 'web';

let globalProjectRoot: string | null = null;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Terminology guardrail:
// - projectRoot/workspace: project code root
// - runtimeRoot: project-scoped runtime container, usually <projectRoot>/.uclaw
// - userDataPath: web runtime data root, usually <runtimeRoot>/web
// - workingDirectory: task/session execution cwd, not the same thing as userDataPath

function looksLikeProjectRoot(candidatePath: string): boolean {
  return fs.existsSync(path.join(candidatePath, 'package.json'))
    && fs.existsSync(path.join(candidatePath, 'server'));
}

function looksLikeWebMainlineRoot(candidatePath: string): boolean {
  return looksLikeProjectRoot(candidatePath)
    && fs.existsSync(path.join(candidatePath, 'vite.config.web.ts'));
}

function findProjectRootFrom(startPath?: string): string | null {
  if (!startPath?.trim()) {
    return null;
  }

  let current = path.resolve(startPath);
  try {
    if (fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch {
    return null;
  }

  let fallbackProjectRoot: string | null = null;

  for (let depth = 0; depth < 10; depth += 1) {
    if (looksLikeWebMainlineRoot(current)) {
      return current;
    }
    if (!fallbackProjectRoot && looksLikeProjectRoot(current)) {
      fallbackProjectRoot = current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return fallbackProjectRoot;
}

function resolveConfiguredProjectRoot(): string {
  const envRoot = readEnvAliasPair(ENV_ALIAS_PAIRS.workspace)
    || readEnvAliasPair(ENV_ALIAS_PAIRS.appRoot);
  if (envRoot) {
    return path.resolve(envRoot);
  }

  const processWithResources = process as NodeJS.Process & { resourcesPath?: string };
  const inferredRoot = findProjectRootFrom(processWithResources.resourcesPath)
    || findProjectRootFrom(process.argv[1])
    || findProjectRootFrom(moduleDir)
    || path.resolve(moduleDir, '..', '..');
  return path.resolve(inferredRoot);
}

export function setProjectRoot(projectRoot?: string): string {
  const resolvedRoot = path.resolve(projectRoot?.trim() || resolveConfiguredProjectRoot());
  globalProjectRoot = resolvedRoot;
  assignEnvAlias(process.env, ENV_ALIAS_PAIRS.appRoot, resolvedRoot);
  assignEnvAlias(process.env, ENV_ALIAS_PAIRS.workspace, resolvedRoot);
  return resolvedRoot;
}

export function getProjectRoot(): string {
  return globalProjectRoot || resolveConfiguredProjectRoot();
}

export function getDefaultRuntimeRoot(projectRoot = getProjectRoot()): string {
  return path.join(projectRoot, PROJECT_RUNTIME_DIRNAME);
}

function isInsideProjectRoot(candidatePath: string, projectRoot: string): boolean {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedProjectRoot
    || resolvedCandidate.startsWith(`${resolvedProjectRoot}${path.sep}`);
}

function resolveProjectScopedPath(
  candidatePath: string | undefined,
  projectRoot = getProjectRoot(),
  fallbackPath: string,
): string {
  if (!candidatePath?.trim()) {
    return fallbackPath;
  }

  const rawCandidate = candidatePath.trim();
  const resolvedCandidate = path.isAbsolute(rawCandidate)
    ? path.resolve(rawCandidate)
    : path.resolve(projectRoot, rawCandidate);

  if (isInsideProjectRoot(resolvedCandidate, projectRoot)) {
    return resolvedCandidate;
  }

  console.warn(`[runtime-path] Ignored external runtime path outside project root: ${resolvedCandidate}`);
  return fallbackPath;
}

export function resolveRuntimeRoot(projectRoot = getProjectRoot()): string {
  const defaultRuntimeRoot = getDefaultRuntimeRoot(projectRoot);
  return resolveProjectScopedPath(
    readEnvAliasPair(ENV_ALIAS_PAIRS.dataPath, process.env),
    projectRoot,
    defaultRuntimeRoot,
  );
}

export function resolveRuntimeUserDataPath(customDataDir?: string, projectRoot = getProjectRoot()): string {
  const defaultUserDataPath = path.join(resolveRuntimeRoot(projectRoot), WEB_RUNTIME_SUBDIR);
  return resolveProjectScopedPath(customDataDir, projectRoot, defaultUserDataPath);
}

export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
