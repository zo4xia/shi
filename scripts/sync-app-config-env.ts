import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

import { ENV_ALIAS_PAIRS, getEnvAliasKeysForPair } from '../src/shared/envAliases.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

type AgentRoleConfig = {
  apiUrl?: string;
  apiKey?: string;
  modelId?: string;
  enabled?: boolean;
};

type AppConfig = {
  api?: {
    baseUrl?: string;
    key?: string;
  };
  model?: {
    defaultModel?: string;
  };
  agentRoles?: Record<string, AgentRoleConfig>;
};

function upsertEnvLine(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  const commentRegex = new RegExp(`^#\\s*${key}=.*$`, 'm');
  if (commentRegex.test(content)) {
    return content.replace(commentRegex, `$&\n${line}`);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

function upsertEnvAliasLines(
  content: string,
  pair: { primary: string; legacy: string },
  value: string,
  suffix = '',
): string {
  let next = content;
  for (const key of getEnvAliasKeysForPair(pair, suffix)) {
    next = upsertEnvLine(next, key, value);
  }
  return next;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

async function readAppConfig(dbPath: string): Promise<AppConfig> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
  });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const result = db.exec('SELECT value FROM kv WHERE key = ?', ['app_config']);
  db.close();

  const raw = result[0]?.values?.[0]?.[0];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`app_config missing in ${dbPath}`);
  }
  return JSON.parse(raw) as AppConfig;
}

async function main(): Promise<void> {
  const dbPath = path.join(projectRoot, '.uclaw', 'web', 'uclaw.sqlite');
  const envPath = path.join(projectRoot, '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error(`.env not found: ${envPath}`);
  }

  const config = await readAppConfig(dbPath);
  const roles = config.agentRoles ?? {};
  let envContent = fs.readFileSync(envPath, 'utf8');

  const roleKeys = Object.keys(roles);
  for (const [roleKey, role] of Object.entries(roles)) {
    const suffix = `_${roleKey.toUpperCase()}`;
    envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.apiBaseUrl, String(role.apiUrl ?? '').trim(), suffix);
    envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.apiKey, String(role.apiKey ?? '').trim(), suffix);
    envContent = upsertEnvAliasLines(envContent, ENV_ALIAS_PAIRS.defaultModel, String(role.modelId ?? '').trim(), suffix);
  }

  const primaryRoleKey = roleKeys.find((key) => roles[key]?.enabled) ?? 'organizer';
  const primaryRole = roles[primaryRoleKey] ?? {};
  envContent = upsertEnvAliasLines(
    envContent,
    ENV_ALIAS_PAIRS.apiBaseUrl,
    firstNonEmpty(config.api?.baseUrl, primaryRole.apiUrl),
  );
  envContent = upsertEnvAliasLines(
    envContent,
    ENV_ALIAS_PAIRS.apiKey,
    firstNonEmpty(config.api?.key, primaryRole.apiKey),
  );
  envContent = upsertEnvAliasLines(
    envContent,
    ENV_ALIAS_PAIRS.defaultModel,
    firstNonEmpty(config.model?.defaultModel, primaryRole.modelId),
  );

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log(JSON.stringify({
    success: true,
    dbPath,
    envPath,
    roleCount: roleKeys.length,
    primaryRoleKey,
  }, null, 2));
}

void main().catch((error) => {
  console.error('[sync-app-config-env] Failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
