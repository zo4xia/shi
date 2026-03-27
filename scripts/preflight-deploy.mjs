import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const requiredEnvKeys = [
  'NODE_ENV',
  'CORS_ORIGIN',
  'UCLAW_API_BASE_URL',
  'UCLAW_API_KEY',
  'UCLAW_DEFAULT_MODEL',
];

function fail(message) {
  console.error(`[deploy:check] ${message}`);
  process.exitCode = 1;
}

function normalizeNodeMajor(version) {
  const match = /^v?(\d+)\./.exec(version);
  return match ? Number(match[1]) : NaN;
}

function resolveRuntimeRoot() {
  const configured = String(process.env.UCLAW_DATA_PATH || '').trim();
  if (!configured) {
    return path.join(projectRoot, '.uclaw');
  }
  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

function isInsideProjectRoot(candidatePath) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedProjectRoot
    || resolvedCandidate.startsWith(`${resolvedProjectRoot}${path.sep}`);
}

function main() {
  const nodeMajor = normalizeNodeMajor(process.version);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 20 || nodeMajor >= 25) {
    fail(`Node.js ${process.version} is unsupported; expected >=20 <25.`);
  }

  for (const key of requiredEnvKeys) {
    if (!String(process.env[key] || '').trim()) {
      fail(`Missing required env: ${key}`);
    }
  }

  if (String(process.env.NODE_ENV).trim() !== 'production') {
    fail('NODE_ENV must be production for standard Linux deployment.');
  }

  if (String(process.env.CORS_ORIGIN).trim() === '*') {
    fail('CORS_ORIGIN must not be "*" for standard production deployment.');
  }

  const runtimeRoot = resolveRuntimeRoot();
  if (!isInsideProjectRoot(runtimeRoot)) {
    fail(`UCLAW_DATA_PATH must stay inside project root: ${runtimeRoot}`);
  }

  const serverEntry = path.join(projectRoot, 'server', 'dist', 'server', 'src', 'cli.js');
  if (!fs.existsSync(serverEntry)) {
    fail(`Missing build artifact: ${serverEntry}. Run npm run build first.`);
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }

  console.log('[deploy:check] ok');
  console.log(`[deploy:check] runtime root: ${runtimeRoot}`);
  console.log(`[deploy:check] server entry: ${serverEntry}`);
}

main();
