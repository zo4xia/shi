import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from './store';
import type { SettingsOpenOptions } from './components/Settings';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import WindowTitleBar from './components/window/WindowTitleBar';
import { CoworkView } from './components/cowork';
import FeedbackButton from './components/FeedbackButton';
import SettingsEntryButton from './components/SettingsEntryButton';
import CoworkPermissionModal from './components/cowork/CoworkPermissionModal';
import CoworkQuestionWizard from './components/cowork/CoworkQuestionWizard';
import { imService } from './services/im';
import { configService } from './services/config';
import { apiService } from './services/api';
import { themeService } from './services/theme';
import { coworkService } from './services/cowork';
import { checkForAppUpdate, type AppUpdateInfo, type AppUpdateDownloadProgress, UPDATE_POLL_INTERVAL_MS, UPDATE_HEARTBEAT_INTERVAL_MS } from './services/appUpdate';
import { defaultConfig } from './config';
import { setAvailableModels, setSelectedModel } from './store/slices/modelSlice';
import { clearSelection } from './store/slices/quickActionSlice';
import {
  buildAvailableModelsFromAgentRoles,
  isAgentRoleProviderKey,
  resolveAgentRolesFromConfig,
} from '../shared/agentRoleConfig';
import type { ApiConfig } from './services/api';
import type { CoworkPermissionResult } from './types/cowork';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { matchesShortcut } from './services/shortcuts';
import AppUpdateBadge from './components/update/AppUpdateBadge';
import AppUpdateModal from './components/update/AppUpdateModal';
import EmbeddedBrowserModal from './components/EmbeddedBrowserModal';
import EmbeddedIframeView from './components/EmbeddedIframeView';
import { getIframePage } from './config/iframePages';
import { EMBEDDED_BROWSER_OPEN_EVENT, type EmbeddedBrowserRequest } from './services/embeddedBrowser';
import { isWebBuild, isWindows, hasAppUpdate } from './utils/platform';
import { normalizeSessionSourceFilter, type SessionSourceFilter } from './components/cowork/sessionRecordUtils';
import { localStore } from './services/store';
import { resolveSettingsAccessPassword } from './services/runtimeEndpoints';
import {
  BROWSER_EYES_CURRENT_PAGE_STORE_KEY,
  type BrowserEyesCurrentPageState,
} from '../shared/browserEyesState';
const Settings = React.lazy(() => import('./components/Settings'));
const SkillsView = React.lazy(() => import('./components/skills/SkillsView'));
const ScheduledTasksView = React.lazy(() => import('./components/scheduledTasks/ScheduledTasksView'));
const McpView = React.lazy(() => import('./components/mcp/McpView'));
const EmployeeStoreView = React.lazy(() => import('./components/employeeStore/EmployeeStoreView'));
const SessionHistoryView = React.lazy(() => import('./components/cowork/SessionHistoryView'));
const RoomView = React.lazy(() => import('./components/room/RoomView'));

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsOptions, setSettingsOptions] = useState<SettingsOpenOptions>({});
  const [showSettingsAccessGate, setShowSettingsAccessGate] = useState(false);
  const [pendingSettingsOptions, setPendingSettingsOptions] = useState<SettingsOpenOptions>({});
  const [settingsPasswordInput, setSettingsPasswordInput] = useState('');
  const [settingsPasswordError, setSettingsPasswordError] = useState<string | null>(null);
  const [mainView, setMainView] = useState<'cowork' | 'skills' | 'scheduledTasks' | 'mcp' | 'employeeStore' | 'resourceShare' | 'freeImageGen' | 'sessionHistory' | 'room'>('cowork');
  const [sessionHistorySourceFilter, setSessionHistorySourceFilter] = useState<SessionSourceFilter>('all');
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateModalState, setUpdateModalState] = useState<'info' | 'downloading' | 'installing' | 'error'>('info');
  const [downloadProgress, setDownloadProgress] = useState<AppUpdateDownloadProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [embeddedBrowserRequest, setEmbeddedBrowserRequest] = useState<EmbeddedBrowserRequest | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const hasInitialized = useRef(false);
  const hasSkippedInitialModelSync = useRef(false);
  const dispatch = useDispatch();
  const settingsAccessPassword = useMemo(() => resolveSettingsAccessPassword(), []);
  const selectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const currentSessionId = useSelector((state: RootState) => state.cowork.currentSessionId);
  const pendingPermissions = useSelector((state: RootState) => state.cowork.pendingPermissions);
  const pendingPermission = pendingPermissions[0] ?? null;
  const lockedFeatureLabel = mainView === 'room'
    ? 'Room'
    : mainView === 'employeeStore'
      ? 'Agent 商店'
      : null;

  useEffect(() => {
    if (!lockedFeatureLabel) {
      setInviteCode('');
      setInviteFeedback('');
      return;
    }
    setInviteFeedback('');
  }, [lockedFeatureLabel]);

  // 初始化应用
  useEffect(() => {
    // {路标} FLOW-PAGE-APP-BOOT
    // {FLOW} PAGE-BOOT-TRUNK: App 首屏先拉 config/theme/api，再后台补齐 IM；这里是前端页面层总入口。
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    const initializeApp = async () => {
      try {
        // 标记平台，用于 CSS 条件样式（如 Windows 标题栏按钮区域留白）
        const platform = isWebBuild() || !window.electron ? 'web' : window.electron.platform;
        document.documentElement.classList.add(`platform-${platform}`);

        // 初始化配置
        await configService.init();
        
        // 初始化主题
        themeService.initialize();

        const config = await configService.getConfig();
        
        const apiConfig: ApiConfig = {
          apiKey: config.api.key,
          baseUrl: config.api.baseUrl,
        };
        apiService.setConfig(apiConfig);

        const roleModels = buildAvailableModelsFromAgentRoles(resolveAgentRolesFromConfig(config));

        // 从 providers 配置中加载可用模型列表到 Redux
        const providerModels: { id: string; name: string; provider?: string; providerKey?: string; supportsImage?: boolean }[] = [];
        if (config.providers) {
          Object.entries(config.providers).forEach(([providerName, providerConfig]) => {
            if (providerConfig.enabled && providerConfig.models) {
              providerConfig.models.forEach((model: { id: string; name: string; supportsImage?: boolean }) => {
                providerModels.push({
                  id: model.id,
                  name: model.name,
                  provider: providerName.charAt(0).toUpperCase() + providerName.slice(1),
                  providerKey: providerName,
                  supportsImage: model.supportsImage ?? false,
                });
              });
            }
          });
        }
        const fallbackModels = config.model.availableModels.map(model => ({
          id: model.id,
          name: model.name,
          providerKey: undefined,
          supportsImage: model.supportsImage ?? false,
        }));
        const resolvedModels = roleModels.length > 0
          ? roleModels
          : providerModels.length > 0
            ? providerModels
            : fallbackModels;
        if (resolvedModels.length > 0) {
          dispatch(setAvailableModels(resolvedModels));
          const preferredModel = resolvedModels.find(
            model => model.id === config.model.defaultModel
              && (!config.model.defaultModelProvider || model.providerKey === config.model.defaultModelProvider)
          ) ?? resolvedModels[0];
          dispatch(setSelectedModel(preferredModel));
        }

        setIsInitialized(true);

        // 非首屏关键能力改为后台静默补齐，减少弱设备冷启动阻塞。
        setTimeout(() => {
          void (async () => {
            try {
              // {埋点} 💾 IM配置恢复 (ID: im-init-001) imService.init() → 从SQLite读取im_config → hydrate到Redux
              await imService.init();

              // {埋点} 🔄 飞书Gateway状态同步 (ID: feishu-sync-001) 统一走 imService，避免前端各处各自猜状态
              await imService.refreshRuntimeStatus('feishu').catch(() => undefined);
            } catch (error) {
              console.warn('[App] Deferred bootstrap tasks failed:', error);
            }
          })();
        }, 0);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setInitError('初始化应用程序失败。请检查您的配置。');
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    const handleEmbeddedBrowserOpen = (event: Event) => {
      const customEvent = event as CustomEvent<EmbeddedBrowserRequest>;
      if (!customEvent.detail?.url) {
        return;
      }
      setEmbeddedBrowserRequest(customEvent.detail);
    };

    window.addEventListener(EMBEDDED_BROWSER_OPEN_EVENT, handleEmbeddedBrowserOpen as EventListener);
    return () => {
      window.removeEventListener(EMBEDDED_BROWSER_OPEN_EVENT, handleEmbeddedBrowserOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    const syncBrowserEyesCurrentPage = async () => {
      try {
        const iframePage = mainView === 'resourceShare' || mainView === 'freeImageGen'
          ? getIframePage(mainView)
          : null;

        const sourceUrl = embeddedBrowserRequest?.url || iframePage?.url || '';
        if (!sourceUrl) {
          return;
        }

        // {标记} P0-BROWSER-EYES-LAST-PAGE-STICKY:
        // 当前页状态保留最近一次已打开的页面，不再在弹层关闭/启动空态时立刻删除。
        // 实际过期交给共享运行时里的 TTL 判定，避免小眼睛频繁出现“当前页不存在”。
        const nextState: BrowserEyesCurrentPageState = {
          source: 'embedded-browser',
          url: sourceUrl,
          title: embeddedBrowserRequest?.title || iframePage?.label,
          updatedAt: Date.now(),
        };

        await localStore.setItem(BROWSER_EYES_CURRENT_PAGE_STORE_KEY, nextState);
      } catch (error) {
        console.warn('[BrowserEyes] Failed to sync current page state:', error);
      }
    };

    void syncBrowserEyesCurrentPage();
  }, [embeddedBrowserRequest, mainView]);

  // Network status monitoring
  useEffect(() => {
    if (isWebBuild() || !window.electron) return;

    const handleOnline = () => {
      console.log('[Renderer] Network online');
      window.electron.networkStatus.send('online');
    };

    const handleOffline = () => {
      console.log('[Renderer] Network offline');
      window.electron.networkStatus.send('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isInitialized || !selectedModel?.id) return;
    if (!hasSkippedInitialModelSync.current) {
      hasSkippedInitialModelSync.current = true;
      return;
    }
    const config = configService.getConfig();
    const nextDefaultModelProvider = (
      selectedModel.providerKey
      && !isAgentRoleProviderKey(selectedModel.providerKey)
    )
      ? selectedModel.providerKey
      : undefined;
    if (
      config.model.defaultModel === selectedModel.id
      && (config.model.defaultModelProvider ?? '') === (nextDefaultModelProvider ?? '')
    ) {
      return;
    }
    void configService.updateConfig({
      model: {
        ...config.model,
        defaultModel: selectedModel.id,
        defaultModelProvider: nextDefaultModelProvider,
      },
    });
  }, [isInitialized, selectedModel?.id, selectedModel?.providerKey]);

  const handleShowSettings = useCallback((options?: SettingsOpenOptions) => {
    // {BREAKPOINT} SETTINGS-OPEN-MODAL-PATH
    // {FLOW} SETTINGS-OPEN-WITHOUT-VIEW-SWITCH: 打开设置当前只改 `showSettings/settingsOptions`，这里没有切 `mainView`。
    // {FLOW} UX-TRACE-SETTINGS-JUMP: 若用户体感像“跳转页面”，优先排查懒加载、弹层挂载、初始 tab 内容负载，不要先误判为真实路由跳转。
    setPendingSettingsOptions({
      initialTab: options?.initialTab,
      notice: options?.notice,
    });
    if (!settingsAccessPassword) {
      setSettingsOptions({
        initialTab: options?.initialTab,
        notice: options?.notice,
      });
      setShowSettings(true);
      return;
    }

    setSettingsPasswordInput('');
    setSettingsPasswordError(null);
    setShowSettingsAccessGate(true);
  }, [settingsAccessPassword]);

  const handleShowSkills = useCallback(() => {
    setMainView('skills');
  }, []);

  const handleShowCowork = useCallback(() => {
    setMainView('cowork');
  }, []);

  const handleShowScheduledTasks = useCallback(() => {
    setMainView('scheduledTasks');
  }, []);

  const handleShowSessionHistory = useCallback((filter: SessionSourceFilter = 'all') => {
    setSessionHistorySourceFilter(normalizeSessionSourceFilter(filter));
    setMainView('sessionHistory');
  }, []);

  const handleShowMcp = useCallback(() => {
    setMainView('mcp');
  }, []);

  const handleShowEmployeeStore = useCallback(() => {
    // [FLOW] 侧边栏"雇员商店"入口切换到占位商城页，后续可直接扩展真实商城能力。
    setMainView('employeeStore');
  }, []);

  const handleShowResourceShare = useCallback(() => {
    setMainView('resourceShare');
  }, []);

  const handleShowFreeImageGen = useCallback(() => {
    setMainView('freeImageGen');
  }, []);

  const handleShowRoom = useCallback(() => {
    setMainView('room');
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const handleNewChat = useCallback(() => {
    const shouldClearInput = mainView === 'cowork' || !!currentSessionId;
    coworkService.clearSession();
    dispatch(clearSelection());
    setMainView('cowork');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cowork:focus-input', {
        detail: { clear: shouldClearInput },
      }));
    }, 0);
  }, [dispatch, mainView, currentSessionId]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const handleShowLogin = useCallback(() => {
    showToast('正在开发中');
  }, [showToast]);

  const runUpdateCheck = useCallback(async () => {
    if (isWebBuild() || !window.electron) return;
    try {
      const currentVersion = await window.electron.appInfo.getVersion();
      const nextUpdate = await checkForAppUpdate(currentVersion);
      setUpdateInfo(nextUpdate);
      if (!nextUpdate) {
        setShowUpdateModal(false);
      }
    } catch (error) {
      console.error('Failed to check app update:', error);
      setUpdateInfo(null);
      setShowUpdateModal(false);
    }
  }, []);

  const handleOpenUpdateModal = useCallback(() => {
    if (!updateInfo) return;
    setUpdateModalState('info');
    setUpdateError(null);
    setDownloadProgress(null);
    setShowUpdateModal(true);
  }, [updateInfo]);

  const handleUpdateFound = useCallback((info: AppUpdateInfo) => {
    setUpdateInfo(info);
    setUpdateModalState('info');
    setUpdateError(null);
    setDownloadProgress(null);
    setShowUpdateModal(true);
  }, []);

  const handleConfirmUpdate = useCallback(async () => {
    if (!updateInfo) return;

    // In web build, just refresh the page to get updates
    if (isWebBuild() || !window.electron) {
      setShowUpdateModal(false);
      window.location.reload();
      return;
    }

    // If the URL is a fallback page (not a direct file download), open in browser
    if (updateInfo.url.includes('#') || updateInfo.url.endsWith('/download-list')) {
      setShowUpdateModal(false);
      try {
        const result = await window.electron.shell.openExternal(updateInfo.url);
        if (!result.success) {
          showToast('打开下载页面失败');
        }
      } catch (error) {
        console.error('Failed to open update url:', error);
        showToast('打开下载页面失败');
      }
      return;
    }

    setUpdateModalState('downloading');
    setDownloadProgress(null);
    setUpdateError(null);

    const unsubscribe = window.electron.appUpdate.onDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    try {
      const downloadResult = await window.electron.appUpdate.download(updateInfo.url);
      unsubscribe();

      if (!downloadResult.success) {
        // If user cancelled, handleCancelDownload already set the state — don't overwrite
        if (downloadResult.error === 'Download cancelled') {
          return;
        }
        setUpdateModalState('error');
        setUpdateError(downloadResult.error || '下载失败');
        return;
      }

      setUpdateModalState('installing');
      const installResult = await window.electron.appUpdate.install(downloadResult.filePath!);

      if (!installResult.success) {
        setUpdateModalState('error');
        setUpdateError(installResult.error || '安装失败');
      }
      // If successful, app will quit and relaunch
    } catch (error) {
      unsubscribe();
      const msg = error instanceof Error ? error.message : '';
      // If user cancelled, handleCancelDownload already set the state — don't overwrite
      if (msg === 'Download cancelled') {
        return;
      }
      setUpdateModalState('error');
      setUpdateError(msg || '下载失败');
    }
  }, [updateInfo, showToast]);

  const handleCancelDownload = useCallback(async () => {
    if (isWebBuild() || !window.electron) {
      setUpdateModalState('info');
      setDownloadProgress(null);
      return;
    }
    await window.electron.appUpdate.cancelDownload();
    setUpdateModalState('info');
    setDownloadProgress(null);
  }, []);

  const handleRetryUpdate = useCallback(() => {
    setUpdateModalState('info');
    setUpdateError(null);
    setDownloadProgress(null);
  }, []);

  const handlePermissionResponse = useCallback(async (result: CoworkPermissionResult) => {
    if (!pendingPermission) return;
    await coworkService.respondToPermission(pendingPermission.requestId, result);
  }, [pendingPermission]);

  const handleCloseSettings = () => {
    setShowSettings(false);
    const config = configService.getConfig();
    apiService.setConfig({
      apiKey: config.api.key,
      baseUrl: config.api.baseUrl,
    });

    // {FIX} 优先从agentRoles构建模型列表，保持与初始化一致
    const roleModels = buildAvailableModelsFromAgentRoles(resolveAgentRolesFromConfig(config));
    if (roleModels.length > 0) {
      dispatch(setAvailableModels(roleModels));
    } else if (config.providers) {
      const allModels: { id: string; name: string; provider?: string; providerKey?: string; supportsImage?: boolean }[] = [];
      Object.entries(config.providers).forEach(([providerName, providerConfig]) => {
        if (providerConfig.enabled && providerConfig.models) {
          providerConfig.models.forEach((model: { id: string; name: string; supportsImage?: boolean }) => {
            allModels.push({
              id: model.id,
              name: model.name,
              provider: providerName.charAt(0).toUpperCase() + providerName.slice(1),
              providerKey: providerName,
              supportsImage: model.supportsImage ?? false,
            });
          });
        }
      });
      if (allModels.length > 0) {
        dispatch(setAvailableModels(allModels));
      }
    }
  };

  const handleCancelSettingsAccessGate = useCallback(() => {
    setShowSettingsAccessGate(false);
    setSettingsPasswordInput('');
    setSettingsPasswordError(null);
  }, []);

  const handleConfirmSettingsAccessGate = useCallback(() => {
    if (settingsPasswordInput !== settingsAccessPassword) {
      setSettingsPasswordError('密码不对');
      return;
    }

    setSettingsOptions(pendingSettingsOptions);
    setShowSettingsAccessGate(false);
    setSettingsPasswordInput('');
    setSettingsPasswordError(null);
    setShowSettings(true);
  }, [pendingSettingsOptions, settingsAccessPassword, settingsPasswordInput]);

  const isShortcutInputActive = () => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return false;
    return activeElement.dataset.shortcutInput === 'true';
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isShortcutInputActive()) return;

      const { shortcuts } = configService.getConfig();
      const activeShortcuts = {
        ...defaultConfig.shortcuts,
        ...(shortcuts ?? {}),
      };

      if (matchesShortcut(event, activeShortcuts.newChat)) {
        event.preventDefault();
        handleNewChat();
        return;
      }

      if (matchesShortcut(event, activeShortcuts.search)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('cowork:shortcut:search'));
        return;
      }

      if (matchesShortcut(event, activeShortcuts.settings)) {
        event.preventDefault();
        handleShowSettings();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleShowSettings, handleNewChat]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Listen for toast events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const message = (e as CustomEvent<string>).detail;
      if (message) showToast(message);
    };
    window.addEventListener('app:showToast', handler);
    return () => window.removeEventListener('app:showToast', handler);
  }, [showToast]);

  // 监听托盘菜单打开设置的 IPC 事件
  useEffect(() => {
    if (isWebBuild() || !window.electron) return;
    const unsubscribe = window.electron.ipcRenderer.on('app:openSettings', () => {
      handleShowSettings();
    });
    return unsubscribe;
  }, [handleShowSettings]);

  // 监听托盘菜单新建任务的 IPC 事件
  useEffect(() => {
    if (isWebBuild() || !window.electron) return;
    const unsubscribe = window.electron.ipcRenderer.on('app:newTask', () => {
      handleNewChat();
    });
    return unsubscribe;
  }, [handleNewChat]);

  // 监听定时任务查看会话事件
  useEffect(() => {
    const handleViewSession = async (event: Event) => {
      const { sessionId } = (event as CustomEvent).detail;
      if (sessionId) {
        // {标记} P1-SESSION-OPEN-STABILITY: 先取 session 再切页，避免加载失败时闪回首页。
        const session = await coworkService.loadSession(sessionId);
        if (session) {
          setMainView('cowork');
        } else {
          showToast('打开对话失败');
        }
      }
    };
    window.addEventListener('scheduledTask:viewSession', handleViewSession);
    return () => window.removeEventListener('scheduledTask:viewSession', handleViewSession);
  }, [showToast]);

  // Skip update checks in web build
  useEffect(() => {
    if (!isInitialized || isWebBuild()) return;

    let cancelled = false;
    let lastCheckTime = 0;

    const maybeCheck = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (lastCheckTime > 0 && now - lastCheckTime < UPDATE_POLL_INTERVAL_MS) return;
      lastCheckTime = now;
      await runUpdateCheck();
    };

    // 启动时立即检查
    void maybeCheck();

    // 心跳：每 30 分钟检测是否距上次检查已超过 12 小时
    const timer = window.setInterval(() => {
      void maybeCheck();
    }, UPDATE_HEARTBEAT_INTERVAL_MS);

    // 窗口恢复可见时检测（覆盖休眠唤醒场景）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void maybeCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInitialized, runUpdateCheck]);

  // 根据场景选择使用哪个权限组件
  const permissionModal = useMemo(() => {
    if (!pendingPermission) return null;

    // 检查是否为 AskUserQuestion 且有多个问题 -> 使用向导式组件
    const isQuestionTool = pendingPermission.toolName === 'AskUserQuestion';
    if (isQuestionTool && pendingPermission.toolInput) {
      const rawQuestions = (pendingPermission.toolInput as Record<string, unknown>).questions;
      const hasMultipleQuestions = Array.isArray(rawQuestions) && rawQuestions.length > 1;

      if (hasMultipleQuestions) {
        return (
          <CoworkQuestionWizard
            permission={pendingPermission}
            onRespond={handlePermissionResponse}
          />
        );
      }
    }

    // 其他情况使用原有的权限模态框
    return (
      <CoworkPermissionModal
        permission={pendingPermission}
        onRespond={handlePermissionResponse}
      />
    );
  }, [pendingPermission, handlePermissionResponse]);

  const isOverlayActive = showSettings || showSettingsAccessGate || showUpdateModal || pendingPermissions.length > 0 || embeddedBrowserRequest !== null;
  const updateBadge = updateInfo && hasAppUpdate() ? (
    <AppUpdateBadge
      latestVersion={updateInfo.latestVersion}
      onClick={handleOpenUpdateModal}
    />
  ) : null;
  const windowsStandaloneTitleBar = isWindows() ? (
    <div className="draggable relative h-9 shrink-0 dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted">
      <WindowTitleBar isOverlayActive={isOverlayActive} />
    </div>
  ) : null;
  const deferredViewFallback = (
    <div className="flex h-full items-center justify-center dark:bg-claude-darkBg bg-claude-bg">
      <div className="dark:text-claude-darkTextSecondary text-claude-textSecondary text-sm">
        正在加载面板...
      </div>
    </div>
  );
  const settingsAccessGateModal = showSettingsAccessGate ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-[26px] border border-[#eadccf] bg-[#fff8f1] p-5 shadow-[0_24px_80px_rgba(194,170,145,0.22)] dark:border-white/10 dark:bg-[#26221e]">
        <div className="text-[16px] font-semibold tracking-[-0.01em] text-[#4E453D] dark:text-claude-darkText">
          进入设置
        </div>
        <div className="mt-2 text-[12px] leading-6 text-[#8B7D71] dark:text-claude-darkTextSecondary/80">
          先输一下密码，避免别人直接看到配置参数。
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleConfirmSettingsAccessGate();
          }}
        >
          <input
            autoFocus
            type="password"
            value={settingsPasswordInput}
            onChange={(event) => {
              setSettingsPasswordInput(event.target.value);
              if (settingsPasswordError) {
                setSettingsPasswordError(null);
              }
            }}
            placeholder="输入访问密码"
            className="w-full rounded-2xl border border-[#e7d7c7] bg-white px-4 py-3 text-sm text-[#5b4e43] shadow-inner outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/70 dark:border-white/10 dark:bg-[#1b1815] dark:text-claude-darkText dark:focus:border-amber-300/30 dark:focus:ring-amber-300/10"
          />
          <div className="min-h-[20px] text-[11px] leading-5 text-red-500 dark:text-red-300">
            {settingsPasswordError || ' '}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancelSettingsAccessGate}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[#e7d7c7] bg-white px-4 py-3 text-sm font-medium text-[#5b4e43] transition hover:bg-[#f8efe6] dark:border-white/10 dark:bg-[#1b1815] dark:text-claude-darkText dark:hover:bg-[#221e1a]"
            >
              取消
            </button>
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[#5f5248] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#554940] dark:bg-[#f2e7db] dark:text-[#453930] dark:hover:bg-[#f6ede4]"
            >
              进入设置
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  if (!isInitialized) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        {windowsStandaloneTitleBar}
        <div className="flex-1 flex items-center justify-center dark:bg-claude-darkBg bg-claude-bg">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-claude-accent to-claude-accentHover flex items-center justify-center shadow-glow-accent animate-pulse">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-white" />
            </div>
            <div className="w-24 h-1 rounded-full bg-claude-accent/20 overflow-hidden">
              <div className="h-full w-1/2 rounded-full bg-claude-accent animate-shimmer" />
            </div>
            <div className="dark:text-claude-darkText text-claude-text text-xl font-medium">{'加载中...'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        {windowsStandaloneTitleBar}
        <div className="flex-1 flex flex-col items-center justify-center dark:bg-claude-darkBg bg-claude-bg">
          <div className="flex flex-col items-center space-y-6 max-w-md px-6">
            <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-white" />
            </div>
            <div className="dark:text-claude-darkText text-claude-text text-xl font-medium text-center">{initError}</div>
            <button
              onClick={() => handleShowSettings()}
              className="px-6 py-2.5 bg-claude-accent hover:bg-claude-accentHover text-white rounded-xl shadow-md transition-colors text-sm font-medium"
            >
              {'打开设置'}
            </button>
          </div>
          {showSettings && (
            <Suspense fallback={deferredViewFallback}>
              <Settings
                onClose={handleCloseSettings}
                initialTab={settingsOptions.initialTab}
                notice={settingsOptions.notice}
                onUpdateFound={handleUpdateFound}
              />
            </Suspense>
          )}
          {settingsAccessGateModal}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col dark:bg-claude-darkSurfaceMuted bg-gradient-main">
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden main-content-pearl">
        <div
          className="app-shell-frame mx-auto h-full w-full flex min-h-0 overflow-hidden"
          style={{ maxWidth: 'var(--uclaw-shell-max-width)' }}
        >
        <div className="pearl-container-deep h-full flex flex-1 min-h-0 overflow-hidden">
          <Sidebar
            onShowLogin={handleShowLogin}
            onShowSettings={handleShowSettings}
            activeView={mainView}
            onShowSkills={handleShowSkills}
            onShowCowork={handleShowCowork}
            onShowScheduledTasks={handleShowScheduledTasks}
            onShowSessionHistory={handleShowSessionHistory}
            onShowMcp={handleShowMcp}
            onShowEmployeeStore={handleShowEmployeeStore}
            onShowResourceShare={handleShowResourceShare}
            onShowFreeImageGen={handleShowFreeImageGen}
            onShowRoom={handleShowRoom}
            onNewChat={handleNewChat}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
            updateBadge={!isSidebarCollapsed ? updateBadge : null}
          />
          <div className={`flex-1 min-w-0 py-1.5 pr-1.5 ${isSidebarCollapsed ? 'pl-1.5' : ''}`}>
            <div
              className="h-full min-h-0 dark:bg-claude-darkBg bg-claude-bg overflow-hidden relative pt-[64px] sm:pt-[68px]"
              style={{ borderRadius: 'var(--uclaw-shell-radius)' }}
            >
              {/* ## {提取} TopActionsOffsetShell
                  当前全局顶部按钮层统一压在主内容壳上方。
                  后续适合抽成公共顶部浮层 + 统一偏移变量，不要让各页面自己猜避让高度。 */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-end px-4 py-3">
                <div className="pointer-events-auto uclaw-top-actions">
                  <SettingsEntryButton onClick={() => handleShowSettings()} />
                  <FeedbackButton
                    buttonClassName="static top-auto right-auto h-10 px-3.5 py-0 rounded-full"
                    panelClassName="right-0 top-12"
                  />
                </div>
              </div>
              <Suspense fallback={deferredViewFallback}>
                {mainView === 'skills' ? (
                  <SkillsView
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    onNewChat={handleNewChat}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                ) : mainView === 'scheduledTasks' ? (
                  <ScheduledTasksView
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    onNewChat={handleNewChat}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                ) : mainView === 'sessionHistory' ? (
                  <SessionHistoryView
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    onNewChat={handleNewChat}
                    sourceFilter={sessionHistorySourceFilter}
                    onSelectSession={async (id: string) => {
                      // {标记} P1-SESSION-OPEN-STABILITY: 历史页先加载成功，再切到详情页，减少无意义 remount。
                      const session = await coworkService.loadSession(id);
                      if (session) {
                        setMainView('cowork');
                      } else {
                        showToast('打开对话失败');
                      }
                    }}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                ) : mainView === 'mcp' ? (
                  <McpView
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    onNewChat={handleNewChat}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                ) : mainView === 'employeeStore' ? (
                  <EmployeeStoreView
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    onNewChat={handleNewChat}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                ) : mainView === 'resourceShare' ? (
                  (() => { const p = getIframePage('resourceShare'); return p ? <EmbeddedIframeView title={p.label} url={p.url} /> : null; })()
                ) : mainView === 'freeImageGen' ? (
                  (() => { const p = getIframePage('freeImageGen'); return p ? <EmbeddedIframeView title={p.label} url={p.url} /> : null; })()
                ) : mainView === 'room' ? (
                  <RoomView
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                ) : (
                  <CoworkView
                    onRequestAppSettings={handleShowSettings}
                    onShowSkills={handleShowSkills}
                    onShowSessionHistory={handleShowSessionHistory}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={handleToggleSidebar}
                    onNewChat={handleNewChat}
                    updateBadge={isSidebarCollapsed ? updateBadge : null}
                  />
                )}
              </Suspense>
              {lockedFeatureLabel && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/8 backdrop-blur-[0.8px] dark:bg-black/6">
                  <div className="mx-4 w-full max-w-sm rounded-[26px] border border-[#eadccf] bg-[#fff8f1] p-5 text-center shadow-[0_24px_80px_rgba(194,170,145,0.22)] dark:border-white/10 dark:bg-[#26221e]">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 shadow-[0_8px_24px_rgba(245,158,11,0.16)] dark:bg-amber-300/10 dark:text-amber-200">
                      <StarIcon className="h-6 w-6" />
                    </div>
                    <div className="mt-4 text-[16px] font-semibold tracking-[-0.01em] text-[#4E453D] dark:text-claude-darkText">
                      邀请码解锁
                    </div>
                    <div className="mt-2 text-[12px] leading-6 text-[#8B7D71] dark:text-claude-darkTextSecondary/80">
                      {`${lockedFeatureLabel} 暂未公开开放，请输入邀请码解锁高级功能。`}
                    </div>
                    <div className="mt-4">
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(event) => {
                          setInviteCode(event.target.value);
                          if (inviteFeedback) {
                            setInviteFeedback('');
                          }
                        }}
                        placeholder="输入邀请码"
                        className="w-full rounded-2xl border border-[#e7d7c7] bg-white px-4 py-3 text-sm text-[#5b4e43] shadow-inner outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/70 dark:border-white/10 dark:bg-[#1b1815] dark:text-claude-darkText dark:focus:border-amber-300/30 dark:focus:ring-amber-300/10"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInviteFeedback(inviteCode.trim() ? '邀请码入口建设中，暂未开放。' : '先输入邀请码试试。');
                      }}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-[#5f5248] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#554940] dark:bg-[#f2e7db] dark:text-[#453930] dark:hover:bg-[#f6ede4]"
                    >
                      解锁高级功能
                    </button>
                    <div className="mt-3 min-h-[20px] text-[11px] leading-5 text-[#9a8674] dark:text-claude-darkTextSecondary/75">
                      {inviteFeedback || ' '}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* 设置窗口显示在所有主内容之上，但不影响主界面的交互 */}
      {showSettings && (
        <Suspense fallback={deferredViewFallback}>
          {/* {BREAKPOINT} SETTINGS-OVERLAY-MOUNT
              {FLOW} SETTINGS-LAZY-MOUNT: 设置页通过 React.lazy + Suspense 以覆盖层方式挂载，打开体感可能受首屏 load/mount 影响。 */}
          <Settings
            onClose={handleCloseSettings}
            initialTab={settingsOptions.initialTab}
            notice={settingsOptions.notice}
            onUpdateFound={handleUpdateFound}
          />
        </Suspense>
      )}
      {settingsAccessGateModal}
      {showUpdateModal && updateInfo && (
        <AppUpdateModal
          updateInfo={updateInfo}
          onCancel={() => {
            if (updateModalState === 'info' || updateModalState === 'error') {
              setShowUpdateModal(false);
              setUpdateModalState('info');
              setUpdateError(null);
              setDownloadProgress(null);
            }
          }}
          onConfirm={handleConfirmUpdate}
          modalState={updateModalState}
          downloadProgress={downloadProgress}
          errorMessage={updateError}
          onCancelDownload={handleCancelDownload}
          onRetry={handleRetryUpdate}
        />
      )}
      {embeddedBrowserRequest && (
        <EmbeddedBrowserModal
          title={embeddedBrowserRequest.title}
          url={embeddedBrowserRequest.url}
          onClose={() => setEmbeddedBrowserRequest(null)}
        />
      )}
      {permissionModal}
    </div>
  );
};

export default App; 
