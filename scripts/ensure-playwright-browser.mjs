import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const browsersPath = path.join(projectRoot, '.playwright-browsers');
const playwrightCliPath = path.join(projectRoot, 'node_modules', 'playwright', 'cli.js');
const withDeps = process.argv.includes('--with-deps');

if (!fs.existsSync(playwrightCliPath)) {
  console.error(`[playwright-install] Missing CLI: ${playwrightCliPath}`);
  process.exit(1);
}

const installArgs = [playwrightCliPath, 'install'];
if (withDeps) {
  installArgs.push('--with-deps');
}
installArgs.push('chromium');

console.log(`[playwright-install] projectRoot=${projectRoot}`);
console.log(`[playwright-install] browsersPath=${browsersPath}`);
console.log(`[playwright-install] command=node ${installArgs.join(' ')}`);

const installExitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, installArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    },
  });
  child.on('error', reject);
  child.on('close', (code) => resolve(code ?? 1));
});

if (installExitCode !== 0) {
  process.exit(Number(installExitCode) || 1);
}

try {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  const playwright = await import('playwright');
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank', { waitUntil: 'load', timeout: 10_000 });
  await page.close();
  await browser.close();
  console.log('[playwright-install] headless chromium launch check passed');
} catch (error) {
  console.error('[playwright-install] chromium launch check failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
