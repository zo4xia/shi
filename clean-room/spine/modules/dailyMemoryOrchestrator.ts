import type { YesterdayFallbackResult } from './contracts';
import { clearIdentityThreadForRole, getIdentityThreadContext } from '../../../server/libs/identityThreadHelper';

type SqlDatabase = {
  exec(sql: string, params?: Array<string | number | null>): Array<{ values: unknown[][] }>;
  run(sql: string, params?: Array<string | number | null>): void;
};

export interface DurableMemoryWriter {
  writeRoleDailySummary(input: {
    agentRoleKey: string;
    summary: string;
    source: 'daily-extraction';
  }): Promise<{ writtenIds: string[] }>;
}

export interface DailyExtractor {
  extract(input: {
    agentRoleKey: string;
    threadXml: string;
  }): Promise<{ summary: string }>;
}

export interface DailyMemoryRunResult {
  agentRoleKey: string;
  threadFound: boolean;
  wroteDurableMemory: boolean;
  clearedThread: boolean;
  summary: string;
  memoryIds: string[];
}

export async function runDailyMemoryForRole(params: {
  db: SqlDatabase;
  agentRoleKey: string;
  extractor: DailyExtractor;
  writer: DurableMemoryWriter;
}): Promise<DailyMemoryRunResult> {
  const thread = getIdentityThreadContext(params.db, params.agentRoleKey);
  if (!thread?.historyText) {
    return {
      agentRoleKey: params.agentRoleKey,
      threadFound: false,
      wroteDurableMemory: false,
      clearedThread: false,
      summary: '',
      memoryIds: [],
    };
  }

  const extracted = await params.extractor.extract({
    agentRoleKey: params.agentRoleKey,
    threadXml: thread.historyText,
  });

  const summary = extracted.summary.trim();
  if (!summary) {
    return {
      agentRoleKey: params.agentRoleKey,
      threadFound: true,
      wroteDurableMemory: false,
      clearedThread: false,
      summary: '',
      memoryIds: [],
    };
  }

  const writeResult = await params.writer.writeRoleDailySummary({
    agentRoleKey: params.agentRoleKey,
    summary,
    source: 'daily-extraction',
  });

  clearIdentityThreadForRole(params.db, params.agentRoleKey);

  return {
    agentRoleKey: params.agentRoleKey,
    threadFound: true,
    wroteDurableMemory: true,
    clearedThread: true,
    summary,
    memoryIds: writeResult.writtenIds,
  };
}

export function buildFirstWakeYesterdayHint(result: YesterdayFallbackResult): string {
  if (result.loadedFrom !== 'durable-memory' || !result.summary) {
    return '';
  }
  return `昨日摘要：${result.summary}`;
}
