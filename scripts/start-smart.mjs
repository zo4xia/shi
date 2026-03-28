import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parseArgs(argv) {
  const options = {
    host: '',
    port: '',
    open: true,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--host') {
      options.host = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (current === '--port') {
      options.port = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (current === '--no-open') {
      options.open = false;
      continue;
    }
    if (current === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function exists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function runCommand(label, command, args) {
  return new Promise((resolve, reject) => {
    console.log(`[start-smart] ${label}...`);
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed (${signal || code || 0})`));
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function printStep(message) {
  console.log(`[start-smart] ${message}`);
}

const args = parseArgs(process.argv.slice(2));
const host = args.host || process.env.UCLAW_HOST || process.env.HOST_BIND || '0.0.0.0';
const preferredPort = args.port || process.env.PORT || process.env.UCLAW_PORT || '3001';

const nodeModulesPath = path.join(projectRoot, 'node_modules');
const serverEntryPath = path.join(projectRoot, 'server', 'dist', 'server', 'src', 'cli.js');
const frontendEntryPath = path.join(projectRoot, 'server', 'public', 'index.html');

const missingNodeModules = !exists(nodeModulesPath);
const missingBuild = !exists(serverEntryPath) || !exists(frontendEntryPath);

if (args.dryRun) {
  printStep(`workspace = ${projectRoot}`);
  printStep(`host = ${host}`);
  printStep(`preferred port = ${preferredPort}`);
  printStep(`node_modules present = ${!missingNodeModules}`);
  printStep(`server build present = ${exists(serverEntryPath)}`);
  printStep(`frontend build present = ${exists(frontendEntryPath)}`);
  process.exit(0);
}

try {
  if (missingNodeModules) {
    printStep('未检测到依赖，开始执行 npm ci');
    await runCommand('安装依赖', npmCommand, ['ci']);
  } else {
    printStep('依赖已就绪');
  }

  if (missingBuild) {
    printStep('未检测到完整构建产物，开始执行 npm run build');
    await runCommand('构建前后端', npmCommand, ['run', 'build']);
  } else {
    printStep('构建产物已就绪');
  }

  const cliArgs = [
    serverEntryPath,
    '--host',
    host,
    '--port',
    preferredPort,
    '--workspace',
    projectRoot,
  ];

  if (!args.open) {
    cliArgs.push('--no-open');
  }

  printStep(`启动服务 host=${host} preferredPort=${preferredPort}`);
  const child = spawn(process.execPath, cliArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });

  child.on('error', (error) => {
    console.error('[start-smart] 启动失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[start-smart] 失败：${message}`);
  process.exit(1);
}
