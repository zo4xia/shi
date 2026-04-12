import type { MemoryEntry, YesterdayFallbackResult } from './contracts';
import { isWithinRange, parseSqliteTimestamp } from './time';

type SqlDatabase = {
  exec(sql: string, params?: Array<string | number | null>): Array<{
    columns?: string[];
    values: unknown[][];
  }>;
};

function startOfYesterday(now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.getTime() - 24 * 60 * 60 * 1000;
}

function endOfYesterday(now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.getTime() - 1;
}

function summarizeMemories(memories: MemoryEntry[], maxChars: number = 120): string {
  const parts = memories
    .map((item) => item.text.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (parts.length === 0) {
    return '';
  }

  const text = parts.join('；');
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function loadYesterdayMemories(
  db: SqlDatabase,
  agentRoleKey: string,
  now: Date = new Date()
): YesterdayFallbackResult {
  const from = startOfYesterday(now);
  const to = endOfYesterday(now);

  const result = db.exec(
    `
      SELECT id, text, status, created_at, updated_at, agent_role_key, model_id
      FROM user_memories
      WHERE agent_role_key = ?
        AND status = 'created'
      ORDER BY updated_at DESC
      LIMIT 48
    `,
    [agentRoleKey]
  );

  const values = result[0]?.values || [];
  const memories: MemoryEntry[] = values
    .filter((row) => isWithinRange(row[4], from, to))
    .map((row) => ({
      id: String(row[0]),
      text: String(row[1] || ''),
      status: 'created',
      createdAt: parseSqliteTimestamp(row[3]) || 0,
      updatedAt: parseSqliteTimestamp(row[4]) || 0,
      agentRoleKey: String(row[5] || ''),
      modelId: String(row[6] || ''),
    }));

  if (memories.length === 0) {
    return {
      loadedFrom: 'none',
      summary: '',
      memoryIds: [],
    };
  }

  return {
    loadedFrom: 'durable-memory',
    summary: summarizeMemories(memories),
    memoryIds: memories.map((item) => item.id),
  };
}
