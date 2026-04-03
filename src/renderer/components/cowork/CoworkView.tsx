// {路标} FLOW-PAGE-COWORK
import React, { useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { clearCurrentSession } from '../../store/slices/coworkSlice';
import { clearActiveSkills } from '../../store/slices/skillSlice';
import { clearSelection } from '../../store/slices/quickActionSlice';
import { coworkService } from '../../services/cowork';
import { getPlatform } from '../../utils/platform';
import CoworkPromptInput, { type CoworkPromptInputRef, type CoworkSubmitOptions } from './CoworkPromptInput';
import CoworkSessionDetail from './CoworkSessionDetail';
import { buildSessionPreviewText, type SessionSourceFilter } from './sessionRecordUtils';
import {
  AGENT_ROLE_ORDER,
  getAgentRoleDisplayAvatar,
  getAgentRoleDisplayLabel,
  resolveAgentRolesFromConfig,
  type AgentRoleKey,
} from '../../../shared/agentRoleConfig';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import type { SettingsOpenOptions } from '../Settings';
import type { CoworkImageAttachment } from '../../types/cowork';
import { configService } from '../../services/config';
import HomePromptPanel from './HomePromptPanel';
import { setSelectedModel } from '../../store/slices/modelSlice';
import { renderAgentRoleAvatar } from '../../utils/agentRoleDisplay';
import type { CoworkRightDockAction } from './rightDock';
import { useIsMediumViewport } from '../../hooks/useIsMediumViewport';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';

export interface CoworkViewProps {
  onRequestAppSettings?: (options?: SettingsOpenOptions) => void;
  onShowSkills?: () => void;
  onShowSessionHistory?: (filter?: SessionSourceFilter) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
  onSetRightDockActions?: (actions: CoworkRightDockAction[]) => void;
}

const CoworkView: React.FC<CoworkViewProps> = ({
  onRequestAppSettings,
  onShowSkills,
  onShowSessionHistory,
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
  onSetRightDockActions,
}) => {
  const dispatch = useDispatch();
  const isMac = getPlatform() === 'darwin';
  const [isInitialized, setIsInitialized] = useState(false);
  // Track if we're starting a session to prevent duplicate submissions
  const isStartingRef = useRef(false);
  // Track pending start request so stop can cancel delayed startup.
  const pendingStartRef = useRef<{ requestId: number; cancelled: boolean } | null>(null);
  const startRequestIdRef = useRef(0);
  // Ref for CoworkPromptInput
  const promptInputRef = useRef<CoworkPromptInputRef>(null);

  const {
    sessions,
    currentSession,
    loadingSessionId,
    isStreaming,
    config,
  } = useSelector((state: RootState) => state.cowork);

  const activeSkillIds = useSelector((state: RootState) => state.skill.activeSkillIds);
  const selectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const isMediumViewport = useIsMediumViewport();
  const isMobileViewport = useIsMobileViewport();
  const selectedModelRef = useRef(selectedModel);
  const availableModelsRef = useRef(availableModels);
  selectedModelRef.current = selectedModel;
  availableModelsRef.current = availableModels;

  const latestVisibleSession = React.useMemo(() => {
    // {标记} P1-CHANNEL-VISIBILITY-FIX: 首页最近会话不再只限 PC，本地也要能看见外渠道刚落库的会话。
    return [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  }, [sessions]);

  const buildApiConfigNotice = (error?: string) => {
    const baseNotice = '请先在角色配置中完成可用模型与 API Key 设置。';
    if (!error) {
      return baseNotice;
    }
    const normalizedError = error.trim();
    if (
      normalizedError.startsWith('No enabled provider found for model:')
      || normalizedError === 'No available model configured in enabled providers.'
    ) {
      return baseNotice;
    }
    return `${baseNotice} (${error})`;
  };

  useEffect(() => {
    const init = async () => {
      // {路标} FLOW-PAGE-COWORK-INIT
      // {BREAKPOINT} continuity-ui-start-001
      // {FLOW} PAGE-COWORK-INIT: Cowork 页进入时先 init service，再校验 API 配置，再决定是否弹 Settings。
      await coworkService.init();
      setIsInitialized(true);

      setTimeout(() => {
        void (async () => {
          try {
            const apiConfig = await coworkService.checkApiConfig();
            if (apiConfig && !apiConfig.hasConfig) {
              onRequestAppSettings?.({
                initialTab: 'model',
                notice: buildApiConfigNotice(apiConfig.error),
              });
            }
          } catch (error) {
            console.error('Failed to check cowork API config:', error);
          }
        })();
      }, 0);
    };
    void init();
  }, [dispatch, onRequestAppSettings]);

  const handleStartSession = async (
    prompt: string,
    skillPrompt?: string,
    imageAttachments?: CoworkImageAttachment[],
    submitOptions?: CoworkSubmitOptions,
  ) => {
    // {FLOW} CONTINUITY-UI-START-SESSION
    // {BREAKPOINT} continuity-ui-start-001
    // Prevent duplicate submissions
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    const requestId = ++startRequestIdRef.current;
    pendingStartRef.current = { requestId, cancelled: false };
    const isPendingStartCancelled = () => {
      const pending = pendingStartRef.current;
      return !pending || pending.requestId !== requestId || pending.cancelled;
    };

    try {
      try {
        const apiConfig = await coworkService.checkApiConfig();
        if (apiConfig && !apiConfig.hasConfig) {
          onRequestAppSettings?.({
            initialTab: 'model',
            notice: buildApiConfigNotice(apiConfig.error),
          });
          isStartingRef.current = false;
          return;
        }
      } catch (error) {
        console.error('Failed to check cowork API config:', error);
      }

      const fallbackTitle = prompt.split('\n')[0].slice(0, 50) || '新会话';

      // Capture active skill IDs before clearing them
      const sessionSkillIds = [...activeSkillIds];

      // Clear active skills and quick action selection after starting session
      // so they don't persist to next session
      dispatch(clearActiveSkills());
      dispatch(clearSelection());

      // {标记} P0-PROMPT-SLIM-FIX: 默认对话不再注入全局 auto-routing skills prompt。
      // 真实技能能力只走角色绑定链路，由后端按 role skills.json 注入。
      const combinedSystemPrompt = [skillPrompt, config.systemPrompt]
        .filter(p => p?.trim())
        .join('\n\n') || undefined;

      // Start the actual session immediately with fallback title
      const startedSession = await coworkService.startSession({
        prompt,
        title: fallbackTitle,
        cwd: config.workingDirectory || undefined,
        systemPrompt: combinedSystemPrompt,
        activeSkillIds: sessionSkillIds,
        imageAttachments,
        zenMode: submitOptions?.zenMode,
      });

      // 启动失败时清理临时会话状态
      if (!startedSession) {
        return;
      }

      // Generate title in the background and update when ready
      if (startedSession) {
        coworkService.generateSessionTitle(prompt).then(generatedTitle => {
          const betterTitle = generatedTitle?.trim();
          if (betterTitle && betterTitle !== fallbackTitle) {
            coworkService.renameSession(startedSession.id, betterTitle);
          }
        }).catch(error => {
          console.error('Failed to generate cowork session title:', error);
        });
      }

      // Stop immediately if user cancelled while startup request was in flight.
      if (isPendingStartCancelled() && startedSession) {
        await coworkService.stopSession(startedSession.id);
      }
    } finally {
      if (pendingStartRef.current?.requestId === requestId) {
        pendingStartRef.current = null;
      }
      isStartingRef.current = false;
    }
  };

  const handleContinueSession = async (
    prompt: string,
    skillPrompt?: string,
    imageAttachments?: CoworkImageAttachment[],
    submitOptions?: CoworkSubmitOptions,
  ) => {
    // {FLOW} CONTINUITY-UI-CONTINUE-SESSION
    // {BREAKPOINT} continuity-ui-continue-001
    if (!currentSession) return;

    console.log('[CoworkView] handleContinueSession called', {
      hasImageAttachments: !!imageAttachments,
      imageAttachmentsCount: imageAttachments?.length ?? 0,
      imageAttachmentsNames: imageAttachments?.map(a => a.name),
      imageAttachmentsBase64Lengths: imageAttachments?.map(a => a.base64Data.length),
    });

    // Capture active skill IDs before clearing
    const sessionSkillIds = [...activeSkillIds];

    // Clear active skills after capturing so they don't persist to next message
    if (sessionSkillIds.length > 0) {
      dispatch(clearActiveSkills());
    }

    // {标记} P0-PROMPT-SLIM-FIX: 续聊默认不再拉全局 auto-routing prompt，
    // 只保留手选技能或后端角色绑定技能。
    const combinedSystemPrompt = [skillPrompt, config.systemPrompt]
      .filter(p => p?.trim())
      .join('\n\n') || undefined;

    await coworkService.continueSession({
      sessionId: currentSession.id,
      prompt,
      systemPrompt: combinedSystemPrompt,
      activeSkillIds: sessionSkillIds.length > 0 ? sessionSkillIds : undefined,
      imageAttachments,
      zenMode: submitOptions?.zenMode,
    });
  };

  const handleStopSession = async () => {
    if (!currentSession && pendingStartRef.current) {
      pendingStartRef.current.cancelled = true;
      return;
    }
    if (!currentSession) return;
    if (pendingStartRef.current) {
      pendingStartRef.current.cancelled = true;
    }
    await coworkService.stopSession(currentSession.id);
  };

  useEffect(() => {
    const handleNewSession = () => {
      dispatch(clearCurrentSession());
      dispatch(clearSelection());
      window.dispatchEvent(new CustomEvent('cowork:focus-input', {
        detail: { clear: true },
      }));
    };
    window.addEventListener('cowork:shortcut:new-session', handleNewSession);
    return () => {
      window.removeEventListener('cowork:shortcut:new-session', handleNewSession);
    };
  }, [dispatch]);

  if (!isInitialized) {
    return (
      <div className="flex-1 h-full flex flex-col dark:bg-claude-darkBg bg-claude-bg">
        <div className="flex-1 flex items-center justify-center">
          <div className="dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'加载中...'}
          </div>
        </div>
      </div>
    );
  }

  // When there's a current session, show the session detail view
  if (currentSession) {
    return (
      <>
        <CoworkSessionDetail
          onManageSkills={() => onShowSkills?.()}
          onContinue={handleContinueSession}
          onStop={handleStopSession}
          onNavigateHome={() => dispatch(clearCurrentSession())}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          onNewChat={onNewChat}
          updateBadge={updateBadge}
          onSetRightDockActions={onSetRightDockActions}
        />
      </>
    );
  }

  if (loadingSessionId) {
    return (
      <div className="flex-1 h-full flex flex-col dark:bg-claude-darkBg bg-claude-bg">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="w-10 h-10 rounded-full border-2 border-claude-accent/30 border-t-claude-accent animate-spin" />
            <div className="dark:text-claude-darkText text-claude-text text-sm font-medium">
              正在打开对话...
            </div>
            <div className="dark:text-claude-darkTextSecondary text-claude-textSecondary text-xs">
              会话加载完成后会自动进入详情页
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Home view - no current session
  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-transparent h-full">
      {/* Main Content - 欢迎页自适应高度，不产生滚动 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className={`mx-auto flex w-full flex-col px-4 py-8 sm:px-6 ${isMediumViewport ? 'max-w-[920px] min-h-[760px] justify-center py-10' : 'max-w-[var(--uclaw-home-max-width,1080px)] sm:py-[50px]'}`}>
          <div className={`relative text-center ${isMediumViewport ? 'mb-8' : 'mb-10 sm:mb-14'}`}>
            <div className="absolute inset-x-0 top-3 -z-10 mx-auto h-36 w-36 rounded-full bg-gradient-radial from-claude-accent/6 to-transparent blur-3xl" />
            <div className="mx-auto inline-flex flex-col items-center">
              <div className="relative inline-block">
                <div className="absolute -inset-1 rounded-[36px] bg-gradient-to-r from-violet-300/38 via-claude-accent/46 to-violet-300/34 blur-md" />
                <div className="absolute inset-0 rounded-[34px] bg-gradient-to-br from-claude-accent/30 via-violet-200/20 to-clay-soft/16 blur-sm" />
                <div className="relative rounded-[32px] bg-gradient-to-br from-claude-accent/28 via-violet-100/42 to-clay-soft/20 p-1">
                  <div className={`rounded-[28px] bg-gradient-to-br from-white via-pearl-50 to-pearl-100 shadow-md dark:from-gray-800 dark:via-gray-900 dark:to-gray-950 ${isMediumViewport ? 'p-3.5' : 'p-3 sm:p-4'}`}>
                    <img src="logo.png" alt="logo" className={isMediumViewport ? 'h-14 w-14' : 'h-12 w-12 sm:h-16 sm:w-16'} />
                  </div>
                </div>
              </div>
              <h1 className={`uclaw-ui-display font-semibold text-claude-text dark:text-claude-darkText ${isMediumViewport ? 'mt-5 text-[34px]' : 'mt-4 text-[28px] sm:text-[38px]'}`}>
                Uclaw
              </h1>
              {isMobileViewport || isMediumViewport ? (
                <div className={`mt-3 flex flex-col items-center px-2 font-medium text-claude-textSecondary dark:text-claude-darkTextSecondary ${isMediumViewport ? 'max-w-[620px] text-[13px] leading-7' : 'max-w-[320px] text-[12px] leading-6'}`}>
                  <div className="flex flex-wrap items-center justify-center">
                    <span>🧠 自带跨多端记忆，一个对话框就够了</span>
                    <span className="mx-3 text-claude-accent/55">·</span>
                    <span>💬 飞书与多消息频道支持</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-center text-center">
                    <span>🧩 兼容 OpenClaw Skills</span>
                  </div>
                </div>
              ) : (
                <div className="mt-2 max-w-[760px] px-2 text-[13px] font-medium leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary sm:px-0 sm:whitespace-nowrap sm:overflow-hidden sm:text-ellipsis">
                  <span>🧠 自带跨多端记忆，一个对话框就够了</span>
                  <span className="mx-3 text-claude-accent/55">·</span>
                  <span>💬 飞书与多消息频道支持</span>
                  <span className="mx-3 text-claude-accent/55">·</span>
                  <span>🧩 兼容 OpenClaw Skills</span>
                </div>
              )}
            </div>
          </div>

          <div className={`uclaw-home-chip-row mb-4 flex flex-wrap items-center gap-3 px-2 ${isMediumViewport ? 'justify-center' : 'justify-start'}`}>
              {(() => {
                const resolvedRoles = resolveAgentRolesFromConfig(configService.getConfig());
                const roleCards: { key: AgentRoleKey; label: string; icon: string; color: string; bg: string; border: string; activeTone: string; activeShadow: string }[] = [
                  { key: 'organizer', label: getAgentRoleDisplayLabel('organizer', resolvedRoles), icon: getAgentRoleDisplayAvatar('organizer', resolvedRoles), color: 'text-blue-600 dark:text-blue-400', bg: 'from-blue-500/10 to-blue-400/5', border: 'border-blue-400/30 hover:border-blue-400/60', activeTone: 'from-blue-400/22 to-blue-300/12 ring-blue-300/35 border-blue-400/55', activeShadow: 'shadow-[0_10px_22px_rgba(96,165,250,0.22)]' },
                  { key: 'writer', label: getAgentRoleDisplayLabel('writer', resolvedRoles), icon: getAgentRoleDisplayAvatar('writer', resolvedRoles), color: 'text-emerald-600 dark:text-emerald-400', bg: 'from-emerald-500/10 to-emerald-400/5', border: 'border-emerald-400/30 hover:border-emerald-400/60', activeTone: 'from-emerald-400/22 to-emerald-300/12 ring-emerald-300/35 border-emerald-400/55', activeShadow: 'shadow-[0_10px_22px_rgba(52,211,153,0.20)]' },
                  { key: 'designer', label: getAgentRoleDisplayLabel('designer', resolvedRoles), icon: getAgentRoleDisplayAvatar('designer', resolvedRoles), color: 'text-purple-600 dark:text-purple-400', bg: 'from-purple-500/10 to-purple-400/5', border: 'border-purple-400/30 hover:border-purple-400/60', activeTone: 'from-purple-400/24 to-purple-300/14 ring-purple-300/35 border-purple-400/55', activeShadow: 'shadow-[0_10px_22px_rgba(192,132,252,0.22)]' },
                  { key: 'analyst', label: getAgentRoleDisplayLabel('analyst', resolvedRoles), icon: getAgentRoleDisplayAvatar('analyst', resolvedRoles), color: 'text-amber-600 dark:text-amber-400', bg: 'from-amber-500/10 to-amber-400/5', border: 'border-amber-400/30 hover:border-amber-400/60', activeTone: 'from-amber-400/24 to-amber-300/14 ring-amber-300/35 border-amber-400/55', activeShadow: 'shadow-[0_10px_22px_rgba(251,191,36,0.20)]' },
                ];
                const currentModel = selectedModelRef.current;
                const currentRoleKey = currentModel?.providerKey && AGENT_ROLE_ORDER.includes(currentModel.providerKey as AgentRoleKey)
                  ? currentModel.providerKey as AgentRoleKey
                  : 'organizer';

                return roleCards.map((card) => {
                  const roleModel = availableModelsRef.current.find((model) => model.providerKey === card.key);
                  if (!roleModel) return null;
                  const isActive = card.key === currentRoleKey;

                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => {
                        dispatch(setSelectedModel(roleModel));
                        coworkService.updateConfig({ agentRoleKey: card.key }).catch(() => {});
                      }}
                      className={`inline-flex min-h-10 items-center justify-start gap-2.5 rounded-full border bg-gradient-to-r px-4 py-2 text-sm transition-all duration-200 ${card.bg} ${card.border} ${isActive ? `scale-[1.04] ring-2 ${card.activeTone} ${card.activeShadow}` : 'opacity-90 hover:scale-[1.02] hover:shadow-sm'}`}
                    >
                      <span className={`inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/75 text-[18px] shadow-sm transition-transform duration-200 dark:border-white/10 dark:bg-white/[0.08] ${isActive ? 'scale-110' : ''}`}>
                        {renderAgentRoleAvatar(card.icon, {
                          alt: card.label,
                          className: 'h-full w-full object-cover text-[18px] leading-none flex items-center justify-center',
                        })}
                      </span>
                      <span className={`font-medium ${card.color}`}>{card.label}</span>
                    </button>
                  );
                });
              })()}
          </div>

          <div
            className={`relative overflow-hidden rounded-[36px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,252,248,0.96),rgba(251,245,239,0.92))] shadow-[0_20px_46px_rgba(203,174,150,0.18),0_6px_18px_rgba(203,174,150,0.10),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-14px_28px_rgba(229,214,201,0.24)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] dark:shadow-[0_20px_48px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.06)] ${isMobileViewport ? 'px-3 py-3' : isMediumViewport ? 'px-5 py-5' : 'px-4 py-4'} ${!isMobileViewport ? 'mt-1' : ''}`}
          >
            <div className="pointer-events-none absolute inset-x-10 top-0 h-10 rounded-b-[40px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_72%)] opacity-80" />
            <div className="pointer-events-none absolute inset-x-6 bottom-0 h-10 rounded-t-[40px] bg-[linear-gradient(180deg,transparent,rgba(227,208,194,0.18))] dark:bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.03))]" />
            <HomePromptPanel
              latestVisibleSession={latestVisibleSession}
              promptInputRef={promptInputRef}
              onStartSession={handleStartSession}
              onStopSession={handleStopSession}
              isStreaming={isStreaming}
              workingDirectory={config.workingDirectory}
              onWorkingDirectoryChange={async (dir: string) => {
                await coworkService.updateConfig({ workingDirectory: dir });
              }}
              onShowSessionHistory={onShowSessionHistory}
              onShowSkills={onShowSkills}
            />
          </div>

          {!isMobileViewport && (
            <div className={`mt-6 flex flex-wrap items-center justify-center ${isMediumViewport ? 'gap-2.5 pb-8' : 'gap-3'}`}>
            <button
              type="button"
              onClick={() => onRequestAppSettings?.({ initialTab: 'clawApi' })}
              className={`relative inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 text-sm font-medium text-amber-700 shadow-sm transition-transform duration-200 hover:scale-[1.02] dark:border-amber-400/20 dark:from-amber-400/[0.10] dark:to-orange-400/[0.08] dark:text-amber-200 ${isMediumViewport ? 'px-3.5 py-1.5' : 'px-4 py-2'}`}
            >
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                热
              </span>
              <span>🪙</span>
              <span>特价 API</span>
            </button>
            <button
              type="button"
              onClick={() => onShowSkills?.()}
              className={`inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-gradient-to-r from-violet-50 to-fuchsia-50 text-sm font-medium text-violet-700 shadow-sm transition-transform duration-200 hover:scale-[1.02] dark:border-violet-400/20 dark:from-violet-400/[0.10] dark:to-fuchsia-400/[0.08] dark:text-violet-200 ${isMediumViewport ? 'px-3.5 py-1.5' : 'px-4 py-2'}`}
            >
              <span>💡</span>
              <span>使用技巧与指南</span>
            </button>
            <button
              type="button"
              onClick={() => onRequestAppSettings?.({ initialTab: 'resources' })}
              className={`inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-gradient-to-r from-sky-50 to-cyan-50 text-sm font-medium text-sky-700 shadow-sm transition-transform duration-200 hover:scale-[1.02] dark:border-sky-400/20 dark:from-sky-400/[0.10] dark:to-cyan-400/[0.08] dark:text-sky-200 ${isMediumViewport ? 'px-3.5 py-1.5' : 'px-4 py-2'}`}
            >
              <span>⬇️</span>
              <span>资源下载</span>
            </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default CoworkView;
