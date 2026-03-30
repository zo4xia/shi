import { createHash } from 'node:crypto';
import type { Database } from 'sql.js';

const TURN_CACHE_SCHEMA_VERSION = 1;
const TURN_CACHE_TTL_MS = 30 * 60 * 1000;
const initializedDatabases = new WeakSet<object>();

type CacheableContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type CacheableMessage = {
  role: string;
  content: string | CacheableContentBlock[];
};

export type TurnCacheEntry = {
  assistantText: string;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
};

type TurnCacheRow = {
  assistant_text: string;
  created_at: number;
  expires_at: number;
  hit_count: number;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '');
}

function normalizeCacheableMessage(message: CacheableMessage): unknown {
  if (typeof message.content === 'string') {
    return {
      role: message.role,
      content: message.content,
    };
  }

  return {
    role: message.role,
    content: message.content.map((block) => {
      if (block.type === 'text') {
        return {
          type: 'text',
          text: block.text,
        };
      }

      return {
        type: 'image_url',
        imageHash: sha256(block.image_url.url || ''),
      };
    }),
  };
}

function ensureTurnCacheTable(db: Database): void {
  if (initializedDatabases.has(db as object)) {
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS turn_cache (
      request_hash TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      agent_role_key TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      assistant_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_turn_cache_expires_at
    ON turn_cache(expires_at)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_turn_cache_role_model_created_at
    ON turn_cache(agent_role_key, model, created_at DESC)
  `);

  initializedDatabases.add(db as object);
}

function cleanupExpiredTurnCache(db: Database, now: number): boolean {
  const result = db.exec(
    'SELECT request_hash FROM turn_cache WHERE expires_at <= ? LIMIT 1',
    [now]
  );
  if (!result[0]?.values?.length) {
    return false;
  }

  db.run('DELETE FROM turn_cache WHERE expires_at <= ?', [now]);
  return true;
}

export function buildTurnCacheKey(input: {
  agentRoleKey: string;
  baseURL: string;
  model: string;
  messages: CacheableMessage[];
}): string {
  const payload = {
    version: TURN_CACHE_SCHEMA_VERSION,
    agentRoleKey: input.agentRoleKey.trim(),
    baseURL: normalizeBaseUrl(input.baseURL),
    model: input.model.trim(),
    messages: input.messages.map(normalizeCacheableMessage),
  };

  return sha256(JSON.stringify(payload));
}

export function getTurnCacheEntry(params: {
  db: Database;
  saveDb: () => void;
  requestHash: string;
  now?: number;
}): TurnCacheEntry | null {
  const now = params.now ?? Date.now();
  ensureTurnCacheTable(params.db);

  const cleaned = cleanupExpiredTurnCache(params.db, now);
  const result = params.db.exec(
    `
      SELECT assistant_text, created_at, expires_at, hit_count
      FROM turn_cache
      WHERE request_hash = ?
      LIMIT 1
    `,
    [params.requestHash]
  );
  const row = result[0]?.values?.[0];
  if (!row) {
    if (cleaned) {
      params.saveDb();
    }
    return null;
  }

  const columns = result[0].columns;
  const mapped = columns.reduce<Record<string, unknown>>((acc, column, index) => {
    acc[column] = row[index];
    return acc;
  }, {}) as TurnCacheRow;

  if (Number(mapped.expires_at) <= now) {
    params.db.run('DELETE FROM turn_cache WHERE request_hash = ?', [params.requestHash]);
    params.saveDb();
    return null;
  }

  params.db.run(
    `
      UPDATE turn_cache
      SET last_used_at = ?, hit_count = COALESCE(hit_count, 0) + 1
      WHERE request_hash = ?
    `,
    [now, params.requestHash]
  );
  params.saveDb();

  return {
    assistantText: String(mapped.assistant_text ?? ''),
    createdAt: Number(mapped.created_at ?? now),
    expiresAt: Number(mapped.expires_at ?? now),
    hitCount: Number(mapped.hit_count ?? 0) + 1,
  };
}

export function putTurnCacheEntry(params: {
  db: Database;
  saveDb: () => void;
  requestHash: string;
  agentRoleKey: string;
  baseURL: string;
  model: string;
  assistantText: string;
  now?: number;
  ttlMs?: number;
}): void {
  const now = params.now ?? Date.now();
  ensureTurnCacheTable(params.db);
  cleanupExpiredTurnCache(params.db, now);

  params.db.run(
    `
      INSERT OR REPLACE INTO turn_cache (
        request_hash,
        schema_version,
        agent_role_key,
        base_url,
        model,
        assistant_text,
        created_at,
        expires_at,
        last_used_at,
        hit_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT hit_count FROM turn_cache WHERE request_hash = ?), 0))
    `,
    [
      params.requestHash,
      TURN_CACHE_SCHEMA_VERSION,
      params.agentRoleKey.trim(),
      normalizeBaseUrl(params.baseURL),
      params.model.trim(),
      params.assistantText,
      now,
      now + (params.ttlMs ?? TURN_CACHE_TTL_MS),
      now,
      params.requestHash,
    ]
  );
  params.saveDb();
}
