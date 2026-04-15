import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reviewBundlesRoot = path.join(projectRoot, 'review-bundles');
const runtimeFocusDir = path.join(reviewBundlesRoot, '2026-04-14_runtime-focus');
const fullSourceDir = path.join(reviewBundlesRoot, '2026-04-14_full-source-package');
const runcheckDir = path.join(reviewBundlesRoot, '2026-04-14_runcheck-sandbox');

const runtimeFocusFiles = [
  'scripts/dev-runner.mjs',
  'server/src/index.ts',
  'server/routes/app.ts',
  'server/routes/dialog.ts',
  'server/routes/room.ts',
  'server/routes/roleRuntime.ts',
  'server/routes/wechatbotBridge.ts',
  'server/libs/attachmentRuntime.ts',
  'server/libs/exportVerification.ts',
  'server/libs/httpSessionExecutor.ts',
  'server/libs/sessionTurnFinalizer.ts',
  'server/libs/playwrightRuntime.ts',
  'src/main/libs/pythonRuntime.ts',
  'src/main/skillManager.ts',
  'src/main/skillServices.ts',
  'src/renderer/services/room.ts',
  'src/renderer/services/skill.ts',
  'src/shared/continuityRules.ts',
  'src/shared/conversationFileCacheConfig.ts',
  'src/shared/runtimeDataPaths.ts',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-08_ROLE_ATTACHMENT_HOME_AND_HISTORY_BOUNDARY.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-13_020500_ROOM_RUNTIME_FIELD_CONTRACT_NOTE.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-13_181500_OFFICECLI_SYSTEM_FOUNDATION_EVAL_NOTE.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-13_191500_PROJECT_ROOT_ANCHOR_NOTE.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-13_200500_OFFICE_AND_ROOT_RECAP_FOOTPRINT.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-13_202500_CONFIG_PANEL_LAYOUT_RULE_NOTE.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-13_221500_SERVER_MIN_STABLE_GAP_CHECKLIST.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-14_080500_RUNTIME_PACKAGE_REHEARSAL_EFFECT_NOTE.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-14_083500_新地盘首跑_1234验收记录.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-14_091500_完整包迁移与新地盘验收_SOP.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-14_100000_中午前状态板.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-14_103500_兼容层当前结论_临时整理.md',
  'tests/team相关团队独立外部模块开发日志必看/2026-04-14_110500_下一阶段行动清单_兼容层与迁移工具化.md',
];

const fullSourceDirs = [
  'src',
  'server',
  'scripts',
  'public',
  'SKILLs',
  'clean-room',
  'patches',
  'review-bundles/2026-04-14_runtime-focus',
];

const fullSourceFiles = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.web.ts',
  'index.html',
  '.env.example',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.editorconfig',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.hintrc',
  '.prettierignore',
  '.prettierrc.json',
  'postcss.config.js',
  'tailwind.config.js',
  'vercel.json',
  'README.md',
  'LICENSE',
];

function parseArgs(argv) {
  return {
    withInstall: argv.includes('--with-install'),
    withSeed: argv.includes('--with-seed'),
    withRun: argv.includes('--with-run'),
    force: argv.includes('--force'),
  };
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeIfExists(targetPath) {
  if (!fsSync.existsSync(targetPath)) {
    return;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      lastError = error;
      if (!fsSync.existsSync(targetPath)) {
        return;
      }
      await delay(300 * attempt);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function copyRelative(sourceRoot, relativePath, destinationRoot) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const destinationPath = path.join(destinationRoot, relativePath);
  if (!fsSync.existsSync(sourcePath)) {
    throw new Error(`Missing source path: ${relativePath}`);
  }
  await ensureDir(path.dirname(destinationPath));
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.cp(sourcePath, destinationPath, { recursive: true, force: true });
  } else {
    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function writeFile(targetPath, content) {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, content, 'utf8');
}

async function buildRuntimeFocusBundle() {
  await removeIfExists(runtimeFocusDir);
  await ensureDir(runtimeFocusDir);
  for (const relativePath of runtimeFocusFiles) {
    await copyRelative(projectRoot, relativePath, runtimeFocusDir);
  }
  await writeFile(
    path.join(runtimeFocusDir, 'README.md'),
    `# Runtime Focus Bundle

Created by scripts/migration-rehearsal.mjs
Source root: ${projectRoot}

This bundle contains only the files most relevant to the current runtime / migration / boundary work.
`,
  );
}

async function buildFullSourceBundle() {
  await removeIfExists(fullSourceDir);
  await ensureDir(fullSourceDir);
  for (const relativePath of fullSourceDirs) {
    await copyRelative(projectRoot, relativePath, fullSourceDir);
  }
  for (const relativePath of fullSourceFiles) {
    await copyRelative(projectRoot, relativePath, fullSourceDir);
  }
  await writeFile(
    path.join(fullSourceDir, 'README_BUNDLE.md'),
    `# Full Source Package

Created by scripts/migration-rehearsal.mjs
Source root: ${projectRoot}

Included:
- src/
- server/
- scripts/
- public/
- SKILLs/
- clean-room/
- patches/
- review-bundles/2026-04-14_runtime-focus/
- core root config files

Excluded on purpose:
- tests/
- node_modules/
- .uclaw/
- uploud/
- team.html / team_page.html / team_bundle.js
- package-0lock.json
- .tmp-deploy-sg.ps1
- transient tmp logs / .dev-runtime.json
`,
  );
}

async function buildRuncheckSandbox() {
  await removeIfExists(runcheckDir);
  await fs.cp(fullSourceDir, runcheckDir, { recursive: true, force: true });
}

async function runCommand(command, args, options = {}) {
  const useShell = typeof options.shell === 'boolean'
    ? options.shell
    : process.platform === 'win32';
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      stdio: options.stdio || 'pipe',
      shell: useShell,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function terminateChildProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32' && child.pid) {
    try {
      await runCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        cwd: runcheckDir,
        shell: true,
      });
    } catch {
      // ignore and fall through
    }
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(5000),
  ]);
}

async function seedAppConfigFromSource() {
  const dbPath = path.join(projectRoot, '.uclaw', 'web', 'uclaw.sqlite');
  const targetDbPath = path.join(runcheckDir, '.uclaw', 'web', 'uclaw.sqlite');
  if (!fsSync.existsSync(dbPath)) {
    return { seeded: false, reason: 'source-db-missing' };
  }

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
  });
  const source = new SQL.Database(fsSync.readFileSync(dbPath));
  const raw = source.exec("SELECT value FROM kv WHERE key='app_config' LIMIT 1")?.[0]?.values?.[0]?.[0];
  if (typeof raw !== 'string' || !raw.trim()) {
    return { seeded: false, reason: 'source-app-config-missing' };
  }
  await ensureDir(path.dirname(targetDbPath));
  const target = fsSync.existsSync(targetDbPath)
    ? new SQL.Database(fsSync.readFileSync(targetDbPath))
    : new SQL.Database();
  target.run(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    )
  `);
  target.run(
    "INSERT INTO kv(key,value,updated_at) VALUES('app_config', ?, strftime('%s','now')*1000) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    [raw],
  );
  fsSync.writeFileSync(targetDbPath, Buffer.from(target.export()));
  return { seeded: true };
}

async function rebasePaths() {
  const dbPath = path.join(runcheckDir, '.uclaw', 'web', 'uclaw.sqlite');
  const command = process.execPath;
  const args = [
    path.join(runcheckDir, 'scripts', 'rebase-app-config-paths.mjs'),
    '--db-path',
    dbPath,
    '--old-root',
    projectRoot,
    '--new-root',
    runcheckDir,
  ];
  const result = await runCommand(command, args, { cwd: runcheckDir, shell: false });
  return result.stdout.trim();
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // ignore
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/health`);
}

async function runSandbox() {
  const stdoutLog = path.join(runcheckDir, 'migration-run.stdout.log');
  const stderrLog = path.join(runcheckDir, 'migration-run.stderr.log');
  await fs.rm(stdoutLog, { force: true });
  await fs.rm(stderrLog, { force: true });

  const child = spawn('npm', ['run', 'dev:web'], {
    cwd: runcheckDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  try {
    await delay(30000);
    await fs.writeFile(stdoutLog, stdout, 'utf8');
    await fs.writeFile(stderrLog, stderr, 'utf8');

    const runtimeFile = path.join(runcheckDir, '.dev-runtime.json');
    if (!fsSync.existsSync(runtimeFile)) {
      throw new Error('runcheck sandbox did not produce .dev-runtime.json');
    }
    const runtime = JSON.parse(await fs.readFile(runtimeFile, 'utf8'));
    const baseUrl = `http://${runtime.host}:${runtime.backendPort}`;
    const health = await waitForHealth(baseUrl);

    return {
      baseUrl,
      health,
      stdoutLog,
      stderrLog,
    };
  } finally {
    await terminateChildProcess(child);
    await fs.writeFile(stdoutLog, stdout, 'utf8');
    await fs.writeFile(stderrLog, stderr, 'utf8');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await ensureDir(reviewBundlesRoot);
  await buildRuntimeFocusBundle();
  await buildFullSourceBundle();
  await buildRuncheckSandbox();

  const summary = {
    runtimeFocusDir,
    fullSourceDir,
    runcheckDir,
    install: null,
    seededAppConfig: null,
    rebase: null,
    run: null,
  };

  if (args.withInstall) {
    await runCommand('npm', ['ci'], { cwd: runcheckDir, stdio: 'inherit', shell: true });
    summary.install = 'npm ci complete';
  }

  if (args.withSeed) {
    summary.seededAppConfig = await seedAppConfigFromSource();
    summary.rebase = await rebasePaths();
  }

  if (args.withRun) {
    summary.run = await runSandbox();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[migration-rehearsal] Failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
