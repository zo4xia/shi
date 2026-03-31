import type { SqliteStore } from '../sqliteStore.web';
import type { CoworkStore, DailyConversationBackupRunResult } from '../../src/main/coworkStore';
import { pickNextApiKey } from '../../src/shared/agentRoleConfig';
import { ENV_ALIAS_PAIRS, readEnvAliasPair } from '../../src/shared/envAliases';

export interface DailyMemoryPipelineResult {
  backup: DailyConversationBackupRunResult;
  extraction: {
    extractedCount: number;
    clearedHotCacheCount: number;
    skippedCount: number;
    errors: string[];
  };
  warnings: string[];
}

const activeDailyMemoryRuns = new Map<string, Promise<DailyMemoryPipelineResult>>();

type DedicatedDailyMemoryConfig = {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiFormat: 'openai' | 'anthropic';
  source: string;
};

type ResolvedDailyMemoryConfig = {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiFormat: 'openai' | 'anthropic';
  source: string;
};

function resolveDedicatedDailyMemoryConfig(appConfig?: Record<string, any>): DedicatedDailyMemoryConfig | null {
  const configCandidate = appConfig?.dailyMemory && typeof appConfig.dailyMemory === 'object'
    ? appConfig.dailyMemory
    : null;
  const configEnabled = configCandidate?.enabled === true;

  const apiUrl = (
    configEnabled
      ? String(configCandidate?.apiUrl || '').trim()
      : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryApiBaseUrl) || '').trim()
  ).replace(/\/+$/, '');
  const apiKey = configEnabled
    ? String(configCandidate?.apiKey || '').trim()
    : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryApiKey) || '').trim();
  const modelId = configEnabled
    ? String(configCandidate?.modelId || '').trim()
    : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryModel) || '').trim();
  const apiFormatRaw = (
    configEnabled
      ? String(configCandidate?.apiFormat || 'openai').trim()
      : (readEnvAliasPair(ENV_ALIAS_PAIRS.dailyMemoryApiFormat) || '').trim()
  ).toLowerCase();

  if (!apiUrl || !apiKey || !modelId) {
    return null;
  }

  return {
    apiUrl,
    apiKey,
    modelId,
    apiFormat: apiFormatRaw === 'anthropic' ? 'anthropic' : 'openai',
    source: 'env:daily-memory-dedicated',
  };
}

function resolveFirstRoleDailyMemoryConfig(
  agentRoles: Record<string, any>
): ResolvedDailyMemoryConfig | null {
  const firstRoleEntry = Object.entries(agentRoles).find(([, role]: [string, any]) => (
    role?.enabled && role.apiUrl && role.apiKey && role.modelId
  )) as [string, any] | undefined;
  if (!firstRoleEntry) {
    return null;
  }

  const [firstRoleKey, firstRole] = firstRoleEntry;
  return {
    apiUrl: String(firstRole.apiUrl || '').trim(),
    apiKey: pickNextApiKey(firstRole.apiKey, `daily-memory:${firstRoleKey}`) || String(firstRole.apiKey || '').trim(),
    modelId: String(firstRole.modelId || '').trim(),
    apiFormat: 'openai',
    source: `agent-role:${firstRoleKey}`,
  };
}

function shouldMarkSlotCompleted(result: DailyMemoryPipelineResult): boolean {
  if (result.extraction.extractedCount > 0) {
    return true;
  }

  const hadNothingToProcess = result.extraction.skippedCount === 0 && result.extraction.errors.length === 0;
  if (hadNothingToProcess) {
    return true;
  }

  return false;
}

export const DAILY_MEMORY_LAST_COMPLETED_SLOT_KEY = 'dailyMemoryPipeline.lastCompletedSlotDay';

function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDayKey(dayKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function getDailyMemoryTargetSlotDay(now: Date = new Date()): string {
  const slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < 23) {
    slotDate.setDate(slotDate.getDate() - 1);
  }
  return formatLocalDayKey(slotDate);
}

export function shouldRunDailyMemoryCatchup(
  store: SqliteStore,
  now: Date = new Date()
): { shouldRun: boolean; targetSlotDay: string; lastCompletedSlotDay: string } {
  const targetSlotDay = getDailyMemoryTargetSlotDay(now);
  const lastCompletedSlotDay = String(store.get<string>(DAILY_MEMORY_LAST_COMPLETED_SLOT_KEY) || '').trim();
  return {
    shouldRun: targetSlotDay !== '' && targetSlotDay !== lastCompletedSlotDay,
    targetSlotDay,
    lastCompletedSlotDay,
  };
}

export async function runDailyMemoryPipeline(params: {
  store: SqliteStore;
  coworkStore: CoworkStore;
  slotDay?: string;
}): Promise<DailyMemoryPipelineResult> {
  // {路标} FLOW-DAILY-MEMORY-DIRECT
  // {标记} 现役主链: 每日记忆抽取当前直走 backup + extractDailyMemory，不依赖 CoworkRunner.startSession。
  const { store, coworkStore } = params;
  const db = store.getDatabase();
  const saveDb = store.getSaveFunction();
  const appConfig = (store.get('app_config') as Record<string, any>) || {};
  const agentRoles = appConfig.agentRoles || {};
  const dedicatedConfig = resolveDedicatedDailyMemoryConfig(appConfig);
  const fallbackRoleConfig = resolveFirstRoleDailyMemoryConfig(agentRoles);
  if (!dedicatedConfig && !fallbackRoleConfig) {
    throw new Error('没有可用的 Agent Role 配置，无法调用 LLM 进行摘要');
  }

  const warnings: string[] = [];
  const slotDate = params.slotDay ? parseLocalDayKey(params.slotDay) : null;
  const backup = coworkStore.runDailyConversationBackupIfConfigured(slotDate ? { now: slotDate.getTime() } : undefined);
  if (backup.status === 'failed' && backup.error) {
    warnings.push(`conversation-backup: ${backup.error}`);
  }

  const resolvedConfig: ResolvedDailyMemoryConfig = dedicatedConfig
    ? {
      apiUrl: dedicatedConfig.apiUrl,
      apiKey: pickNextApiKey(dedicatedConfig.apiKey, 'daily-memory:dedicated') || dedicatedConfig.apiKey,
      modelId: dedicatedConfig.modelId,
      apiFormat: dedicatedConfig.apiFormat,
      source: dedicatedConfig.source,
    }
    : (fallbackRoleConfig as ResolvedDailyMemoryConfig);
  console.log(`[DailyMemory] Summary LLM source=${resolvedConfig.source} model=${resolvedConfig.modelId}`);
  const { extractDailyMemory } = await import('../../SKILLs/daily-memory-extraction/dailyMemoryExtraction');
  let extraction = await extractDailyMemory({
    db,
    saveDb,
    apiUrl: resolvedConfig.apiUrl,
    apiKey: resolvedConfig.apiKey,
    modelId: resolvedConfig.modelId,
    apiFormat: resolvedConfig.apiFormat,
  });

  const shouldFallbackToRoleModel = Boolean(
    dedicatedConfig
    && fallbackRoleConfig
    && extraction.extractedCount === 0
    && extraction.clearedHotCacheCount === 0
    && extraction.skippedCount > 0
  );

  if (shouldFallbackToRoleModel) {
    warnings.push(`daily-memory-dedicated-fallback: ${resolvedConfig.modelId} -> ${fallbackRoleConfig?.modelId || 'unknown'}`);
    console.warn(
      `[DailyMemory] Dedicated summary model produced no persisted extraction; retrying with fallback ${fallbackRoleConfig?.source} model=${fallbackRoleConfig?.modelId}`
    );
    extraction = await extractDailyMemory({
      db,
      saveDb,
      apiUrl: fallbackRoleConfig!.apiUrl,
      apiKey: fallbackRoleConfig!.apiKey,
      modelId: fallbackRoleConfig!.modelId,
      apiFormat: fallbackRoleConfig!.apiFormat,
    });
  }

  return {
    backup,
    extraction,
    warnings,
  };
}

export async function runAndMarkDailyMemoryPipeline(params: {
  store: SqliteStore;
  coworkStore: CoworkStore;
  slotDay?: string;
}): Promise<DailyMemoryPipelineResult> {
  const slotDay = params.slotDay || getDailyMemoryTargetSlotDay(new Date());
  const existingRun = activeDailyMemoryRuns.get(slotDay);
  if (existingRun) {
    console.warn(`[DailyMemory] Slot ${slotDay} 已有任务在运行，复用当前执行`);
    const result = await existingRun;
    return {
      ...result,
      warnings: [...result.warnings, `daily-memory-joined-running-slot: ${slotDay}`],
    };
  }

  const runPromise = (async (): Promise<DailyMemoryPipelineResult> => {
    const result = await runDailyMemoryPipeline({
      ...params,
      slotDay,
    });
    if (shouldMarkSlotCompleted(result)) {
      params.store.set(DAILY_MEMORY_LAST_COMPLETED_SLOT_KEY, slotDay);
    } else {
      result.warnings.push(`daily-memory-slot-not-marked: ${slotDay}`);
      console.warn(
        `[DailyMemory] Slot ${slotDay} 未标记完成：本次未成功写入长期记忆，保留后续补跑机会`
      );
    }
    return result;
  })();

  activeDailyMemoryRuns.set(slotDay, runPromise);
  try {
    return await runPromise;
  } finally {
    if (activeDailyMemoryRuns.get(slotDay) === runPromise) {
      activeDailyMemoryRuns.delete(slotDay);
    }
  }
}
