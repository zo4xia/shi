/**
 * SessionHistoryView — 对话记录内页视图
 * 从侧边栏独立出来，顶部搜索框 + 完整会话列表
 * {标记} P0-SESSION-HISTORY-FIX: 对话记录页按 4 个身份竖列归档，外渠道与 PC 入口统一收口到这里
 */
import { useState, useMemo, useCallback, useEffect, useDeferredValue } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { coworkService } from '../../services/cowork';
import { showGlobalToast } from '../../services/toast';
import {
  AGENT_ROLE_ICONS,
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  type AgentRoleKey,
} from '../../../shared/agentRoleConfig';
import type { CoworkSessionSummary } from '../../types/cowork';
import CoworkSessionItem from './CoworkSessionItem';
import {
  buildSessionPreviewText,
  matchesSessionSourceFilter,
  normalizeSessionSourceFilter,
  type SessionSourceFilter,
} from './sessionRecordUtils';
import PageHeaderShell from '../ui/PageHeaderShell';

const SESSION_COLUMN_SCROLL_HEIGHT_CLASS = 'max-h-[24.75rem]';

const ROLE_COLUMN_META: Record<
  AgentRoleKey,
  {
    description: string;
    accentClass: string;
    badgeClass: string;
    panelClass: string;
  }
> = {
  organizer: {
    description: '工具、收集、整理',
    accentClass: 'text-blue-600 dark:text-blue-300',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    panelClass: 'border-blue-400/25 bg-blue-500/[0.04] dark:bg-blue-400/[0.06]',
  },
  writer: {
    description: '文稿、润色、表达',
    accentClass: 'text-emerald-600 dark:text-emerald-300',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    panelClass: 'border-emerald-400/25 bg-emerald-500/[0.04] dark:bg-emerald-400/[0.06]',
  },
  designer: {
    description: '视觉、图片、排版',
    accentClass: 'text-purple-600 dark:text-purple-300',
    badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
    panelClass: 'border-purple-400/25 bg-purple-500/[0.04] dark:bg-purple-400/[0.06]',
  },
  analyst: {
    description: '分析、推演、对比',
    accentClass: 'text-amber-600 dark:text-amber-300',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    panelClass: 'border-amber-400/25 bg-amber-500/[0.04] dark:bg-amber-400/[0.06]',
  },
};

function sortSessionsByPinnedAndRecent(sessions: CoworkSessionSummary[]): CoworkSessionSummary[] {
  const sortByRecentActivity = (a: CoworkSessionSummary, b: CoworkSessionSummary) => {
    if (b.updatedAt !== a.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return b.createdAt - a.createdAt;
  };

  const pinnedSessions = sessions
    .filter((session) => session.pinned)
    .sort(sortByRecentActivity);
  const unpinnedSessions = sessions
    .filter((session) => !session.pinned)
    .sort(sortByRecentActivity);

  return [...pinnedSessions, ...unpinnedSessions];
}

function isKnownRole(roleKey: string | undefined): roleKey is AgentRoleKey {
  return Boolean(roleKey && AGENT_ROLE_ORDER.includes(roleKey as AgentRoleKey));
}

function inferRoleFromSession(session: CoworkSessionSummary): AgentRoleKey | undefined {
  if (isKnownRole(session.agentRoleKey)) {
    return session.agentRoleKey;
  }

  const title = (session.title || '').trim();
  if (!title) {
    return undefined;
  }

  return AGENT_ROLE_ORDER.find((roleKey) => title.includes(AGENT_ROLE_LABELS[roleKey]));
}

interface SessionHistoryViewProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  sourceFilter?: SessionSourceFilter;
  updateBadge?: React.ReactNode;
}

export default function SessionHistoryView({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  onSelectSession,
  sourceFilter = 'all',
  updateBadge,
}: SessionHistoryViewProps) {
  const sessions = useSelector((s: RootState) => s.cowork.sessions);
  const currentSessionId = useSelector((s: RootState) => s.cowork.currentSessionId);
  const unreadSessionIds = useSelector((s: RootState) => s.cowork.unreadSessionIds);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [roleFilter, setRoleFilter] = useState<'all' | AgentRoleKey>('all');
  const normalizedInitialSourceFilter = normalizeSessionSourceFilter(sourceFilter);
  const [activeSourceFilter, setActiveSourceFilter] = useState<SessionSourceFilter>(normalizedInitialSourceFilter);
  const unreadSessionIdSet = useMemo(() => new Set(unreadSessionIds), [unreadSessionIds]);

  useEffect(() => {
    const ensureHistorySessionsLoaded = async () => {
      try {
        await coworkService.init();
      } catch (error) {
        console.error('[SessionHistoryView] Failed to initialize session history:', error);
      }
    };

    void ensureHistorySessionsLoaded();
  }, []);

  useEffect(() => {
    setActiveSourceFilter(normalizeSessionSourceFilter(sourceFilter));
  }, [sourceFilter]);

  const filteredSessions = useMemo(() => {
    if (!deferredSearchQuery.trim()) return sessions;
    const q = deferredSearchQuery.toLowerCase();
    return sessions.filter((session) => {
      const roleKey = inferRoleFromSession(session);
      const roleLabel = roleKey && isKnownRole(roleKey) ? AGENT_ROLE_LABELS[roleKey] : '';
      return (
        (session.title || '').toLowerCase().includes(q) ||
        (roleKey || '').toLowerCase().includes(q) ||
        roleLabel.toLowerCase().includes(q)
      );
    });
  }, [deferredSearchQuery, sessions]);

  const sourceFilteredSessions = useMemo(() => {
    return filteredSessions.filter((session) => matchesSessionSourceFilter(session, activeSourceFilter));
  }, [filteredSessions, activeSourceFilter]);

  const sortedSourceFilteredSessions = useMemo(() => {
    return sortSessionsByPinnedAndRecent(sourceFilteredSessions);
  }, [sourceFilteredSessions]);

  const currentSessionSummary = useMemo(() => {
    if (!currentSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const latestVisibleSession = sortedSourceFilteredSessions[0] ?? null;

  const groupedSessions = useMemo(() => {
    const grouped = AGENT_ROLE_ORDER.reduce((result, roleKey) => {
      result[roleKey] = [];
      return result;
    }, {} as Record<AgentRoleKey, CoworkSessionSummary[]>);
    const unassigned: CoworkSessionSummary[] = [];

    for (const session of sourceFilteredSessions) {
      const resolvedRoleKey = inferRoleFromSession(session);
      if (resolvedRoleKey && isKnownRole(resolvedRoleKey)) {
        grouped[resolvedRoleKey].push(session);
      } else {
        unassigned.push(session);
      }
    }

    for (const roleKey of AGENT_ROLE_ORDER) {
      grouped[roleKey] = sortSessionsByPinnedAndRecent(grouped[roleKey]);
    }

  return {
      grouped,
      unassigned: sortSessionsByPinnedAndRecent(unassigned),
    };
  }, [sourceFilteredSessions]);

  const visibleRoleKeys = useMemo(() => {
    return roleFilter === 'all' ? AGENT_ROLE_ORDER : [roleFilter];
  }, [roleFilter]);

  const handleSelect = useCallback((id: string) => {
    onSelectSession(id);
  }, [onSelectSession]);

  const handleDelete = useCallback(async (id: string) => {
    const success = await coworkService.deleteSession(id);
    showGlobalToast(success ? '对话已删除' : '删除对话失败');
  }, []);

  const handleTogglePin = useCallback(async (id: string, pinned: boolean) => {
    await coworkService.setSessionPinned(id, pinned);
  }, []);

  const handleRename = useCallback(async (id: string, title: string) => {
    await coworkService.renameSession(id, title);
  }, []);

  return (
    <div className="flex h-full flex-col dark:bg-claude-darkBg bg-transparent">
      <PageHeaderShell
        title="对话记录"
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
        headerClassName="draggable flex h-12 items-center justify-between px-4 border-b dark:border-claude-darkBorder/50 border-claude-border/30 shrink-0 backdrop-blur-xl bg-gradient-pearl-header"
      />

      {/* Search bar */}
      <div className="px-4 py-4 shrink-0">
        <div className="mx-auto w-full max-w-[1680px]">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            aria-label="搜索对话记录"
            className="w-full rounded-[20px] border border-white/55 bg-gradient-to-br from-white/92 via-pearl-50/88 to-[#f6ece3]/92 px-4 py-3 text-sm text-claude-text shadow-sm placeholder:text-claude-textSecondary focus:outline-none focus:ring-2 focus:ring-claude-accent/30 dark:border-white/10 dark:bg-claude-darkSurface/85 dark:text-claude-darkText dark:placeholder:text-claude-darkTextSecondary"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="history-scroll-soft flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto w-full max-w-[1680px] space-y-4">
          {sourceFilteredSessions.length === 0 && (
            <div className="rounded-2xl border border-dashed dark:border-claude-darkBorder border-claude-border text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {searchQuery ? '没有找到匹配的对话，下面保留身份分类方便继续查看。' : '暂无对话记录，下面保留身份分类方便继续开始。'}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-[24px] border border-white/55 bg-gradient-to-br from-white/82 via-pearl-50/72 to-[#f7eee7]/82 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-claude-darkSurface/40">
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: 'all', label: '全部来源' },
                { key: 'desktop', label: 'PC端' },
                { key: 'external', label: '外渠道' },
              ] as const).map((option) => {
                const active = activeSourceFilter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setActiveSourceFilter(option.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                      active
                        ? 'bg-claude-accent text-white shadow-sm'
                        : 'bg-white/70 text-claude-textSecondary transition-colors hover:bg-white dark:bg-white/[0.08] dark:text-claude-darkTextSecondary dark:hover:bg-white/[0.12]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                aria-pressed={roleFilter === 'all'}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  roleFilter === 'all'
                    ? 'bg-claude-accent/90 text-white shadow-sm'
                    : 'bg-white/70 text-claude-textSecondary hover:bg-white dark:bg-white/[0.08] dark:text-claude-darkTextSecondary dark:hover:bg-white/[0.12]'
                }`}
              >
                全部角色
              </button>
              {AGENT_ROLE_ORDER.map((roleKey) => (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => setRoleFilter(roleKey)}
                  aria-pressed={roleFilter === roleKey}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    roleFilter === roleKey
                      ? `${ROLE_COLUMN_META[roleKey].badgeClass} shadow-sm`
                      : 'bg-white/70 text-claude-textSecondary hover:bg-white dark:bg-white/[0.08] dark:text-claude-darkTextSecondary dark:hover:bg-white/[0.12]'
                  }`}
                >
                  <span>{AGENT_ROLE_ICONS[roleKey]}</span>
                  <span>{AGENT_ROLE_LABELS[roleKey]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-white/45 bg-white/65 px-3 py-2.5 text-xs shadow-sm backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.05]">
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 font-medium text-claude-textSecondary dark:bg-white/[0.08] dark:text-claude-darkTextSecondary">
              {sourceFilteredSessions.length} 条记录
            </span>
            {currentSessionSummary && (
              <button
                type="button"
                onClick={() => handleSelect(currentSessionSummary.id)}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-violet-200/70 bg-violet-50/70 px-3 py-1 text-left text-xs text-violet-700 transition-colors hover:bg-violet-100/80 dark:border-violet-400/20 dark:bg-violet-400/[0.10] dark:text-violet-200 dark:hover:bg-violet-400/[0.14]"
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]">当前对话</span>
                <span className="truncate">{buildSessionPreviewText(currentSessionSummary)}</span>
              </button>
            )}
            {latestVisibleSession && latestVisibleSession.id !== currentSessionSummary?.id && (
              <button
                type="button"
                onClick={() => handleSelect(latestVisibleSession.id)}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/55 bg-white/72 px-3 py-1 text-left text-xs text-claude-textSecondary transition-colors hover:bg-white/90 hover:text-claude-text dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkTextSecondary dark:hover:bg-white/[0.10] dark:hover:text-claude-darkText"
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]">最近更新</span>
                <span className="truncate">{buildSessionPreviewText(latestVisibleSession)}</span>
              </button>
            )}
          </div>

          <div className={`grid grid-cols-1 gap-4 ${visibleRoleKeys.length > 1 ? 'md:grid-cols-2 lg:grid-cols-4' : ''}`}>
            {visibleRoleKeys.map((roleKey) => {
              const roleSessions = groupedSessions.grouped[roleKey];
              const roleMeta = ROLE_COLUMN_META[roleKey];

              return (
                <section
                  key={roleKey}
                  className={`flex flex-col overflow-hidden rounded-[26px] border ${roleMeta.panelClass} shadow-[0_16px_36px_rgba(145,108,63,0.08)] backdrop-blur-sm dark:shadow-[0_18px_34px_rgba(0,0,0,0.28)]`}
                >
                  <div className="flex items-start justify-between gap-3 border-b px-4 py-3 dark:border-claude-darkBorder/60 border-claude-border/60">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none" aria-hidden="true">
                          {AGENT_ROLE_ICONS[roleKey]}
                        </span>
                        <h2 className={`text-sm font-semibold ${roleMeta.accentClass}`}>
                          {AGENT_ROLE_LABELS[roleKey]}
                        </h2>
                      </div>
                      <p className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {roleMeta.description}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${roleMeta.badgeClass}`}>
                      {roleSessions.length} 条
                    </span>
                  </div>

                  <div className={`history-scroll-soft overflow-y-auto p-2 space-y-1 ${SESSION_COLUMN_SCROLL_HEIGHT_CLASS}`}>
                    {roleSessions.length === 0 ? (
                      <div className="px-3 py-8 text-center text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {searchQuery ? '当前筛选下没有记录' : '这个角色还没有对话'}
                      </div>
                    ) : (
                      <>
                        {roleSessions.map((session) => (
                          <CoworkSessionItem
                            key={session.id}
                            session={session}
                            isActive={session.id === currentSessionId}
                            isBatchMode={false}
                            isSelected={false}
                            hasUnread={unreadSessionIdSet.has(session.id)}
                            onSelect={() => handleSelect(session.id)}
                            onDelete={() => handleDelete(session.id)}
                            onTogglePin={(pinned) => handleTogglePin(session.id, pinned)}
                            onRename={(title) => handleRename(session.id, title)}
                            showQuickDelete={true}
                            showBatchOption={false}
                            forceShowActions={session.id === currentSessionId}
                            onToggleSelection={() => {}}
                            onEnterBatchMode={() => {}}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {roleFilter === 'all' && groupedSessions.unassigned.length > 0 && (
            <section className="flex flex-col overflow-hidden rounded-[26px] border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/40 shadow-[0_16px_36px_rgba(145,108,63,0.08)] dark:shadow-[0_18px_34px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3 dark:border-claude-darkBorder/70 border-claude-border/80">
                <div>
                  <h2 className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                    未分配身份
                  </h2>
                  <p className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {/* {标记} P0-SESSION-HISTORY-FIX: 旧数据单独归档，避免混进正确角色列 */}
                    旧数据或未绑定角色的会话，先单独放这里，避免混进错误身份列。
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-[11px] font-medium text-claude-textSecondary dark:bg-white/10 dark:text-claude-darkTextSecondary">
                  {groupedSessions.unassigned.length} 条
                </span>
              </div>
              <div className={`history-scroll-soft overflow-y-auto p-2 space-y-1 ${SESSION_COLUMN_SCROLL_HEIGHT_CLASS}`}>
                {groupedSessions.unassigned.map((session) => (
                  <CoworkSessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    isBatchMode={false}
                    isSelected={false}
                    hasUnread={unreadSessionIdSet.has(session.id)}
                    onSelect={() => handleSelect(session.id)}
                    onDelete={() => handleDelete(session.id)}
                    onTogglePin={(pinned) => handleTogglePin(session.id, pinned)}
                    onRename={(title) => handleRename(session.id, title)}
                    showQuickDelete={true}
                    showBatchOption={false}
                    forceShowActions={session.id === currentSessionId}
                    onToggleSelection={() => {}}
                    onEnterBatchMode={() => {}}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
