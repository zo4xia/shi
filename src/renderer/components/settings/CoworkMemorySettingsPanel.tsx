import React from 'react';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import {
  AGENT_ROLE_LABELS,
  type AgentRoleKey,
} from '../../../shared/agentRoleConfig';
import type {
  CoworkBroadcastBoardSnapshot,
  CoworkMemoryStats,
  CoworkUserMemoryEntry,
} from '../../types/cowork';

interface CoworkMemorySettingsPanelProps {
  showCoworkContinuityNote: boolean;
  coworkMemoryEnabled: boolean;
  coworkMemoryLlmJudgeEnabled: boolean;
  coworkBroadcastBoards: CoworkBroadcastBoardSnapshot[];
  coworkMemoryEntries: CoworkUserMemoryEntry[];
  coworkMemoryStats: CoworkMemoryStats | null;
  coworkMemoryListLoading: boolean;
  coworkMemoryQuery: string;
  coworkMemoryRoleOptions: string[];
  coworkMemoryAgentRoleKey: string | 'all';
  showMemoryModal: boolean;
  coworkMemoryEditingId: string | null;
  coworkMemoryDraftText: string;
  dailyMemoryEnabled: boolean;
  dailyMemoryApiUrl: string;
  dailyMemoryApiKey: string;
  dailyMemoryModelId: string;
  dailyMemoryApiFormat: 'anthropic' | 'openai';
  onToggleContinuityNote: () => void;
  onCoworkMemoryEnabledChange: (value: boolean) => void;
  onCoworkMemoryLlmJudgeEnabledChange: (value: boolean) => void;
  onDailyMemoryEnabledChange: (value: boolean) => void;
  onDailyMemoryApiUrlChange: (value: string) => void;
  onDailyMemoryApiKeyChange: (value: string) => void;
  onDailyMemoryModelIdChange: (value: string) => void;
  onDailyMemoryApiFormatChange: (value: 'anthropic' | 'openai') => void;
  onRefresh: () => void;
  onClearBroadcastBoard: (agentRoleKey: string) => void | Promise<void>;
  onOpenModal: () => void;
  onRoleFilterChange: (value: string | 'all') => void;
  onQueryChange: (value: string) => void;
  onEditEntry: (entry: CoworkUserMemoryEntry) => void;
  onDeleteEntry: (entry: CoworkUserMemoryEntry) => void | Promise<void>;
  onCloseModal: () => void;
  onDraftChange: (value: string) => void;
  onSaveEntry: () => void | Promise<void>;
}

function formatMemoryUpdatedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '-';
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '-';
  }
}

function getMemoryRoleLabel(roleKey: string): string {
  return AGENT_ROLE_LABELS[roleKey as AgentRoleKey] ?? roleKey;
}

function getBroadcastEntryRoleLabel(role: string): string {
  if (role === 'assistant') return '助手';
  if (role === 'user') return '用户';
  if (role === 'bootstrap') return '接力';
  return role;
}

function getMemoryStatusLabel(status: CoworkUserMemoryEntry['status']): string {
  if (status === 'created') return '生效中';
  if (status === 'stale') return '暂不使用';
  return '已删除';
}

const CoworkMemorySettingsPanel: React.FC<CoworkMemorySettingsPanelProps> = ({
  showCoworkContinuityNote,
  coworkMemoryEnabled,
  coworkMemoryLlmJudgeEnabled,
  coworkBroadcastBoards,
  coworkMemoryEntries,
  coworkMemoryStats,
  coworkMemoryListLoading,
  coworkMemoryQuery,
  coworkMemoryRoleOptions,
  coworkMemoryAgentRoleKey,
  showMemoryModal,
  coworkMemoryEditingId,
  coworkMemoryDraftText,
  dailyMemoryEnabled,
  dailyMemoryApiUrl,
  dailyMemoryApiKey,
  dailyMemoryModelId,
  dailyMemoryApiFormat,
  onToggleContinuityNote,
  onCoworkMemoryEnabledChange,
  onCoworkMemoryLlmJudgeEnabledChange,
  onDailyMemoryEnabledChange,
  onDailyMemoryApiUrlChange,
  onDailyMemoryApiKeyChange,
  onDailyMemoryModelIdChange,
  onDailyMemoryApiFormatChange,
  onRefresh,
  onClearBroadcastBoard,
  onOpenModal,
  onRoleFilterChange,
  onQueryChange,
  onEditEntry,
  onDeleteEntry,
  onCloseModal,
  onDraftChange,
  onSaveEntry,
}) => {
  return (
    <>
      <div className="space-y-6">
        <div className="space-y-3 rounded-xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border bg-gradient-to-br from-[#f8efe8] via-white to-[#f6f8fb] dark:from-claude-darkSurface dark:via-claude-darkSurface/90 dark:to-claude-darkSurface/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                {'连续性保护'}
              </div>
              <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'系统会尽量帮你保住跨天连续性。'}
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleContinuityNote}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium dark:border-claude-darkBorder/70 border-claude-border/70 dark:text-claude-darkTextSecondary text-claude-textSecondary"
            >
              {'这是什么'}
            </button>
          </div>
          {showCoworkContinuityNote && (
            <div className="rounded-lg dark:bg-claude-darkSurfaceInset bg-claude-surfaceInset px-3 py-3 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'短期共享线程负责当天交接，长期记忆负责跨天延续。热缓存空了，就尝试从长期记忆里把“今天的第一棒”接回来。'}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border">
          <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
            {'记忆管理'}
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={coworkMemoryEnabled}
              onChange={(event) => onCoworkMemoryEnabledChange(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm dark:text-claude-darkText text-claude-text">
                {'启用用户记忆'}
              </span>
              <span className="block text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'将稳定事实注入到系统提示词中的 <userMemories> 区块。'}
              </span>
              <span className="mt-1 block text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'建议开启后直接使用下方“记忆条目管理”，无需额外配置。'}
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-3 ${coworkMemoryEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="checkbox"
              checked={coworkMemoryLlmJudgeEnabled}
              onChange={(event) => onCoworkMemoryLlmJudgeEnabledChange(event.target.checked)}
              disabled={!coworkMemoryEnabled}
              className="mt-1"
            />
            <span>
              <span className="block text-sm dark:text-claude-darkText text-claude-text">
                {'启用 LLM 二级判定'}
              </span>
              <span className="block text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'仅对规则边界样本调用模型复核，提升准确率（会增加少量 API 调用）。'}
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-4 rounded-xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border">
          <div className="space-y-1">
            <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
              {'每日记忆摘要模型'}
            </div>
            <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'给每日记忆抽取单独配置一条轻量摘要线路；配不稳时会自动回退到普通角色模型。'}
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dailyMemoryEnabled}
              onChange={(event) => onDailyMemoryEnabledChange(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm dark:text-claude-darkText text-claude-text">
                {'启用独立每日记忆模型'}
              </span>
              <span className="block text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'建议只给稳定、擅长长文本摘要、能稳定返回 JSON 的模型。'}
              </span>
            </span>
          </label>

          <div className={`grid grid-cols-1 gap-3 ${dailyMemoryEnabled ? '' : 'opacity-60'}`}>
            <select
              value={dailyMemoryApiFormat}
              onChange={(event) => onDailyMemoryApiFormatChange(event.target.value as 'anthropic' | 'openai')}
              disabled={!dailyMemoryEnabled}
              className="rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface"
            >
              <option value="openai">OpenAI 兼容</option>
              <option value="anthropic">Anthropic 兼容</option>
            </select>
            <input
              type="text"
              value={dailyMemoryApiUrl}
              onChange={(event) => onDailyMemoryApiUrlChange(event.target.value)}
              disabled={!dailyMemoryEnabled}
              placeholder="每日记忆摘要 API URL"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface"
            />
            <input
              type="password"
              value={dailyMemoryApiKey}
              onChange={(event) => onDailyMemoryApiKeyChange(event.target.value)}
              disabled={!dailyMemoryEnabled}
              placeholder="每日记忆摘要 API Key"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface"
            />
            <input
              type="text"
              value={dailyMemoryModelId}
              onChange={(event) => onDailyMemoryModelIdChange(event.target.value)}
              disabled={!dailyMemoryEnabled}
              placeholder="每日记忆摘要 Model ID"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface"
            />
          </div>
        </div>

        <div className="space-y-4 rounded-xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border">
          <div className="space-y-1">
            <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
              {'广播板观察窗'}
            </div>
            <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'这里展示 identity_thread_24h 的真实只读状态。它是接力板，不是全文仓库。'}
            </div>
            <div className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'如果 agent 口头说看不到广播板，不要先判板坏了；先看执行链是不是把 continuity 放在了不同提示层级。'}
            </div>
          </div>

          {coworkBroadcastBoards.length === 0 ? (
            <div className="rounded-lg border px-3 py-3 text-xs dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {coworkMemoryListLoading ? '广播板加载中...' : '当前没有可见的广播板内容'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {coworkBroadcastBoards.map((board) => (
                <div
                  key={board.agentRoleKey}
                  className="rounded-xl border px-3 py-3 dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/50 bg-white/70"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">
                      {getMemoryRoleLabel(board.agentRoleKey)}
                    </span>
                    <span className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {`条数 ${board.messageCount}`}
                    </span>
                    <span className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {`更新 ${formatMemoryUpdatedAt(board.updatedAt)}`}
                    </span>
                    <span className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {`过期 ${formatMemoryUpdatedAt(board.expiresAt)}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void onClearBroadcastBoard(board.agentRoleKey);
                      }}
                      className="ml-auto inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      {'清空当前板'}
                    </button>
                  </div>

                  <div className="mt-3 rounded-lg border px-3 py-2 text-[11px] leading-5 dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurfaceInset bg-claude-surfaceInset dark:text-claude-darkTextSecondary text-claude-textSecondary whitespace-pre-wrap break-words">
                    {board.summaryText || '暂无摘要'}
                  </div>

                  <div className="mt-3 max-h-56 overflow-auto rounded-lg border dark:border-claude-darkBorder border-claude-border">
                    {board.entries.length === 0 ? (
                      <div className="px-3 py-3 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {'暂无接力条目'}
                      </div>
                    ) : (
                      <div className="divide-y dark:divide-claude-darkBorder divide-claude-border">
                        {board.entries.map((entry, index) => (
                          <div key={`${board.agentRoleKey}-${index}-${entry.timestamp}`} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                              <span>{entry.channelLabel}</span>
                              <span>{entry.timeLabel}</span>
                              {entry.channelSeq ? <span>{`#${entry.channelSeq}`}</span> : null}
                              <span>{getBroadcastEntryRoleLabel(entry.role)}</span>
                            </div>
                            <div className="mt-1 text-xs leading-5 dark:text-claude-darkText text-claude-text break-words">
                              {entry.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                {'记忆条目管理'}
              </div>
              <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'你可以在这里查看、搜索、新增、编辑或删除记忆内容。'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefresh}
                disabled={coworkMemoryListLoading}
                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border dark:border-claude-darkBorder border-claude-border text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover disabled:opacity-60 transition-colors"
              >
                {'刷新'}
              </button>
              <button
                type="button"
                onClick={onOpenModal}
                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-claude-accent hover:bg-claude-accentHover text-white text-sm transition-colors"
              >
                <PlusCircleIcon className="h-4 w-4 mr-1.5" />
                {'新增条目'}
              </button>
            </div>
          </div>

          {coworkMemoryStats && (
            <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {`${'记忆总数'}: ${coworkMemoryStats.total - coworkMemoryStats.deleted} · ${'生效中'}: ${coworkMemoryStats.created} · ${'暂不使用'}: ${coworkMemoryStats.stale}`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <select
              value={coworkMemoryAgentRoleKey}
              onChange={(event) => onRoleFilterChange(event.target.value as string | 'all')}
              className="rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface"
            >
              <option value="all">所有身份</option>
              {coworkMemoryRoleOptions.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {getMemoryRoleLabel(roleKey)}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={coworkMemoryQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={'搜索记忆内容/来源'}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface"
          />
          <div className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'记忆只按身份归桶；默认展示全部身份。新增条目会写入当前选中身份；若筛选为“所有身份”，则写入当前设置页角色。'}
          </div>

          <div className="max-h-[500px] overflow-auto rounded-lg border dark:border-claude-darkBorder border-claude-border">
            {coworkMemoryListLoading ? (
              <div className="px-3 py-3 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'加载中...'}
              </div>
            ) : coworkMemoryEntries.length === 0 ? (
              <div className="px-3 py-3 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'暂无记忆条目'}
              </div>
            ) : (
              <div className="divide-y dark:divide-claude-darkBorder divide-claude-border">
                {coworkMemoryEntries.map((entry) => (
                  <div key={entry.id} className="px-3 py-3 text-xs hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="font-medium dark:text-claude-darkText text-claude-text break-words">
                          {entry.text}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                          <span className="rounded-full border px-2 py-0.5 dark:border-claude-darkBorder border-claude-border">
                            {getMemoryStatusLabel(entry.status)}
                          </span>
                          {entry.agentRoleKey && (
                            <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-0.5 text-xs">
                              {getMemoryRoleLabel(entry.agentRoleKey)}
                            </span>
                          )}
                          <span>
                            {`${'最后更新'}: ${formatMemoryUpdatedAt(entry.updatedAt)}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEditEntry(entry)}
                          className="rounded-lg border px-2.5 py-1 dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                        >
                          {'编辑'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onDeleteEntry(entry);
                          }}
                          className="rounded-lg border px-2.5 py-1 text-red-600 dark:text-red-300 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          {'删除'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMemoryModal && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-4 rounded-2xl"
          onClick={onCloseModal}
        >
          <div
            className="dark:bg-claude-darkSurface bg-claude-surface dark:border-claude-darkBorder border-claude-border border rounded-2xl shadow-xl w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 border-b dark:border-claude-darkBorder border-claude-border">
              <h3 className="text-base font-semibold dark:text-claude-darkText text-claude-text">
                {coworkMemoryEditingId ? '更新条目' : '新增条目'}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-4">
              {coworkMemoryEditingId && (
                <div className="rounded-lg border px-2 py-1 text-xs dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'正在编辑当前记忆'}
                </div>
              )}
              <textarea
                value={coworkMemoryDraftText}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={'输入要保存的记忆内容'}
                autoFocus
                className="min-h-[200px] w-full rounded-lg border px-3 py-2 text-sm dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30"
              />
            </div>

            <div className="flex justify-end space-x-2 px-5 pb-5">
              <button
                type="button"
                onClick={onCloseModal}
                className="px-3 py-1.5 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl border dark:border-claude-darkBorder border-claude-border transition-colors"
              >
                {'取消'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void onSaveEntry();
                }}
                disabled={!coworkMemoryDraftText.trim() || coworkMemoryListLoading}
                className="px-3 py-1.5 text-sm text-white bg-claude-accent hover:bg-claude-accentHover rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {coworkMemoryEditingId ? '保存' : '新增条目'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CoworkMemorySettingsPanel;
