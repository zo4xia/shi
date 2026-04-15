import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const parsed = {
    dbPath: '',
    oldRoot: '',
    newRoot: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) continue;
    if (key === '--db-path') {
      parsed.dbPath = value.trim();
      index += 1;
      continue;
    }
    if (key === '--old-root') {
      parsed.oldRoot = value.trim();
      index += 1;
      continue;
    }
    if (key === '--new-root') {
      parsed.newRoot = value.trim();
      index += 1;
    }
  }

  return parsed;
}

function ensureTrailingSeparator(targetPath) {
  const normalized = path.resolve(targetPath);
  return normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`;
}

function tryRebasePath(rawPath, oldRoot, newRoot) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return { changed: false, nextValue: trimmed };

  const normalizedPath = path.resolve(trimmed);
  const normalizedOldRoot = ensureTrailingSeparator(oldRoot);
  const normalizedNewRoot = path.resolve(newRoot);

  if (normalizedPath === path.resolve(oldRoot) || normalizedPath.startsWith(normalizedOldRoot)) {
    const relative = path.relative(path.resolve(oldRoot), normalizedPath);
    return {
      changed: true,
      nextValue: path.join(normalizedNewRoot, relative),
    };
  }

  return { changed: false, nextValue: trimmed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dbPath || !args.oldRoot || !args.newRoot) {
    throw new Error('Usage: node scripts/rebase-app-config-paths.mjs --db-path <sqlite> --old-root <old-root> --new-root <new-root>');
  }

  const dbPath = path.resolve(args.dbPath);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`db not found: ${dbPath}`);
  }

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
  });

  const db = new SQL.Database(fs.readFileSync(dbPath));
  const row = db.exec("SELECT value FROM kv WHERE key = 'app_config' LIMIT 1");
  const raw = row?.[0]?.values?.[0]?.[0];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('app_config missing');
  }

  const appConfig = JSON.parse(raw);
  const changes = [];

  if (appConfig?.conversationFileCache && typeof appConfig.conversationFileCache === 'object') {
    const current = String(appConfig.conversationFileCache.directory || '').trim();
    const rebased = tryRebasePath(current, args.oldRoot, args.newRoot);
    if (rebased.changed) {
      appConfig.conversationFileCache.directory = rebased.nextValue;
      changes.push({
        field: 'conversationFileCache.directory',
        before: current,
        after: rebased.nextValue,
      });
    }
  }

  if (changes.length === 0) {
    console.log(JSON.stringify({
      success: true,
      dbPath,
      changed: 0,
      changes,
    }, null, 2));
    return;
  }

  const updatedAt = Date.now();
  db.run(
    "UPDATE kv SET value = ?, updated_at = ? WHERE key = 'app_config'",
    [JSON.stringify(appConfig), updatedAt],
  );
  fs.writeFileSync(dbPath, Buffer.from(db.export()));

  console.log(JSON.stringify({
    success: true,
    dbPath,
    changed: changes.length,
    changes,
  }, null, 2));
}

main().catch((error) => {
  console.error('[rebase-app-config-paths] Failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
