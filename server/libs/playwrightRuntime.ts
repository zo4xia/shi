import fs from 'fs';
import path from 'path';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';

type PlaywrightProbeResult = {
  projectRoot: string;
  browsersPath: string;
  browsersPathExists: boolean;
  installedEntries: string[];
  mcpCliPath: string;
  mcpCliExists: boolean;
  playwrightCliPath: string;
  playwrightCliExists: boolean;
  headlessDefault: boolean;
  executablePath?: string;
  executableExists?: boolean;
  launchOk: boolean;
  launchError?: string;
};

function resolveCandidatePath(relativePath: string): string {
  return path.join(getProjectRoot(), relativePath);
}

export function resolvePlaywrightBrowsersPath(): string {
  return resolveCandidatePath('.playwright-browsers');
}

export function resolvePlaywrightMcpCliPath(): string {
  const candidates = [
    resolveCandidatePath(path.join('node_modules', '@playwright', 'mcp', 'cli.js')),
    path.resolve(process.cwd(), 'node_modules', '@playwright', 'mcp', 'cli.js'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

export function resolvePlaywrightCliPath(): string {
  const candidates = [
    resolveCandidatePath(path.join('node_modules', 'playwright', 'cli.js')),
    path.resolve(process.cwd(), 'node_modules', 'playwright', 'cli.js'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

export function shouldRunBuiltinPlaywrightHeadless(): boolean {
  const explicit = String(process.env.UCLAW_PLAYWRIGHT_HEADLESS || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(explicit)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(explicit)) {
    return false;
  }
  return process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}

export function buildBuiltinPlaywrightArgs(): string[] {
  const cliPath = resolvePlaywrightMcpCliPath();
  const args = cliPath ? [cliPath] : [];
  if (shouldRunBuiltinPlaywrightHeadless()) {
    args.push('--headless');
  }
  return args;
}

function listInstalledEntries(browsersPath: string): string[] {
  if (!fs.existsSync(browsersPath) || !fs.statSync(browsersPath).isDirectory()) {
    return [];
  }
  return fs.readdirSync(browsersPath).sort((a, b) => a.localeCompare(b, 'en'));
}

function formatProbeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function probePlaywrightRuntime(): Promise<PlaywrightProbeResult> {
  const projectRoot = getProjectRoot();
  const browsersPath = resolvePlaywrightBrowsersPath();
  const mcpCliPath = resolvePlaywrightMcpCliPath();
  const playwrightCliPath = resolvePlaywrightCliPath();
  const probe: PlaywrightProbeResult = {
    projectRoot,
    browsersPath,
    browsersPathExists: fs.existsSync(browsersPath),
    installedEntries: listInstalledEntries(browsersPath),
    mcpCliPath,
    mcpCliExists: Boolean(mcpCliPath && fs.existsSync(mcpCliPath)),
    playwrightCliPath,
    playwrightCliExists: Boolean(playwrightCliPath && fs.existsSync(playwrightCliPath)),
    headlessDefault: shouldRunBuiltinPlaywrightHeadless(),
    launchOk: false,
  };

  const previousBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  try {
    const playwright = await import('playwright');
    const executablePath = playwright.chromium.executablePath();
    probe.executablePath = executablePath;
    probe.executableExists = Boolean(executablePath && fs.existsSync(executablePath));

    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('about:blank', { waitUntil: 'load', timeout: 10_000 });
    await page.close();
    await browser.close();
    probe.launchOk = true;
  } catch (error) {
    probe.launchOk = false;
    probe.launchError = formatProbeError(error);
  } finally {
    if (previousBrowsersPath === undefined) {
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    } else {
      process.env.PLAYWRIGHT_BROWSERS_PATH = previousBrowsersPath;
    }
  }

  return probe;
}
