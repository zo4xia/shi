import fs from 'fs';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

// {标记} P0-DEV-RUNTIME-FIX: 开发环境自动避让端口 + 后端先启动 + 健康检查后再起前端
// {标记} 用途: 减少 3001/5176/5177 被占用时的连锁报错与白屏噪音

const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const absoluteRoot = path.normalize(path.join(scriptDir, '..'));
const root = absoluteRoot;
const runtimeFile = path.join(root, '.dev-runtime.json');
const host = '127.0.0.1';
const pnpmStoreDir = path.join(root, 'node_modules', '.pnpm');

/**
 * 根路径钉子：
 * 开发脚本统一以脚本所在项目目录为锚点，不再信任 process.cwd()。
 */

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });

const findAvailablePort = async (preferredPort, reserved = new Set(), maxAttempts = 30) => {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (reserved.has(candidate)) {
      continue;
    }
    if (await isPortAvailable(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new Error(`No available port found from ${preferredPort} to ${preferredPort + maxAttempts - 1}`);
};

const waitForHttp = async (url, timeoutMs = 30000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore and retry
    }
    await delay(400);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const reservedPorts = new Set();
const backendPort = await findAvailablePort(3001, reservedPorts);
const frontendPort = await findAvailablePort(5176, reservedPorts);
const hmrPort = await findAvailablePort(5177, reservedPorts);
const frontendOrigin = `http://${host}:${frontendPort}`;

const findPackageDirInPnpmStore = (packageName) => {
  if (!fs.existsSync(pnpmStoreDir)) {
    return null;
  }

  const packageDirParts = packageName.split('/');
  const pnpmPrefix = packageName.startsWith('@')
    ? `${packageName.replace('/', '+')}@`
    : `${packageName}@`;

  for (const entry of fs.readdirSync(pnpmStoreDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(pnpmPrefix)) {
      continue;
    }

    const candidate = path.join(pnpmStoreDir, entry.name, 'node_modules', ...packageDirParts);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return null;
};

const resolvePackageEntry = (packageName, relativeEntry) => {
  const directPath = path.join(absoluteRoot, 'node_modules', ...packageName.split('/'), relativeEntry);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const pnpmPackageDir = findPackageDirInPnpmStore(packageName);
  if (pnpmPackageDir) {
    const pnpmEntry = path.join(pnpmPackageDir, relativeEntry);
    if (fs.existsSync(pnpmEntry)) {
      console.log(`[dev-runner] Using ${packageName} entry from local .pnpm store`);
      return pnpmEntry;
    }
  }

  // 兜底逻辑：尝试使用 require.resolve (如果是 .cjs 或支持的环境)
  // 或者直接在系统中寻找，但在工作中心化的脚本通常还是依赖 node_modules
  throw new Error(
    `Unable to resolve local entry for ${packageName}/${relativeEntry}. ` +
      `If this repo was moved, rebuild local dependencies first.`
  );
};

const tsxCli = resolvePackageEntry('tsx', path.join('dist', 'cli.mjs'));
const viteCli = resolvePackageEntry('vite', path.join('bin', 'vite.js'));

const runtime = {
  host,
  backendPort,
  frontendPort,
  hmrPort,
  startedAt: new Date().toISOString(),
  startupOrder: ['backend', 'frontend'],
};

fs.writeFileSync(runtimeFile, JSON.stringify(runtime, null, 2));

const commonEnv = {
  ...process.env,
  UCLAW_APP_ROOT: root,
  LOBSTERAI_APP_ROOT: root,
  PORT: String(backendPort),
  CORS_ORIGIN: frontendOrigin,
  UCLAW_DATA_PATH: path.join(root, '.uclaw'),
  LOBSTERAI_DATA_PATH: path.join(root, '.uclaw'),
  VITE_BACKEND_HOST: host,
  VITE_BACKEND_PORT: String(backendPort),
  VITE_DEV_HOST: host,
  VITE_DEV_PORT: String(frontendPort),
  VITE_HMR_PORT: String(hmrPort),
  VITE_OPEN_BROWSER: 'false',
};

const children = new Set();
let shuttingDown = false;

const spawnCommand = (command, args, extraOptions = {}) => {
  const shouldSpawnDirectly = process.platform !== 'win32'
    || path.isAbsolute(command)
    || /[\\/]/.test(command)
    || /\.exe$/i.test(command);

  if (shouldSpawnDirectly) {
    return spawn(command, args, {
      cwd: root,
      env: commonEnv,
      stdio: 'inherit',
      ...extraOptions,
    });
  }

  if (process.platform === 'win32') {
    const commandLine = [command, ...args]
      .map((part) => (/\s/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
      .join(' ');

    return spawn(
      'cmd.exe',
      ['/d', '/s', '/c', commandLine],
      {
        cwd: root,
        env: commonEnv,
        stdio: 'inherit',
        ...extraOptions,
      }
    );
  }

  return spawn(command, args, {
    cwd: root,
    env: commonEnv,
    stdio: 'inherit',
    ...extraOptions,
  });
};

const killChildren = () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
};

const attachChild = (child, name) => {
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.log(`[dev-runner] ${name} exited (${signal || code || 0}), shutting down the rest`);
      killChildren();
      process.exit(code ?? 0);
    }
  });
};

process.on('SIGINT', killChildren);
process.on('SIGTERM', killChildren);
process.on('exit', killChildren);

console.log('[dev-runner] Ports selected');
console.log(`  backend:  http://${host}:${backendPort}`);
console.log(`  frontend: http://${host}:${frontendPort}`);
console.log(`  hmr:      ${host}:${hmrPort}`);
console.log(`  cors:     ${frontendOrigin}`);
console.log('[dev-runner] Startup order: backend -> health check -> frontend');

const backend = spawnCommand(process.execPath, [
  tsxCli,
  'watch',
  'server/start-server.ts',
  '--no-open',
  '--host',
  host,
  '--port',
  String(backendPort),
  '--workspace',
  root,
]);
attachChild(backend, 'backend');

await waitForHttp(`http://${host}:${backendPort}/health`);
console.log('[dev-runner] Backend is healthy, delaying frontend startup slightly');
await delay(800);

const frontend = spawnCommand(process.execPath, [
  viteCli,
  '--config',
  'vite.config.web.ts',
  '--host',
  host,
  '--port',
  String(frontendPort),
]);
attachChild(frontend, 'frontend');

console.log('[dev-runner] Development services are up. Open the frontend URL manually when needed.');
