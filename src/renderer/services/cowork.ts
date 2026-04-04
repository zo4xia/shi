import { store } from '../store';
import {
  setSessions,
  setCurrentSession,
  setLoadingSessionId,
  updateSessionStatus,
  deleteSession as deleteSessionAction,
  deleteSessions as deleteSessionsAction,
  addMessage,
  updateMessageContent,
  setStreaming,
  updateSessionPinned,
  updateSessionTitle,
  enqueuePendingPermission,
  dequeuePendingPermission,
  clearPendingPermissionsForSession,
  setConfig,
  clearCurrentSession,
} from '../store/slices/coworkSlice';
import { setSelectedModel } from '../store/slices/modelSlice';
import { webSocketClient } from './webSocketClient';
import { buildCoworkRoomId } from './webApiContract';
import { showGlobalToast } from './toast';
import { isLegacyHiddenSession } from '../components/cowork/sessionRecordUtils';
import type {
  CoworkSession,
  CoworkConfigUpdate,
  CoworkApiConfig,
  CoworkUserMemoryEntry,
  CoworkMemoryStats,
  CoworkBroadcastBoardSnapshot,
  CoworkManualCompressionResult,
  CoworkPermissionResult,
  CoworkStartOptions,
  CoworkContinueOptions,
} from '../types/cowork';
import type { AgentRoleKey } from '../../shared/agentRoleConfig';

// {路标} FLOW-SERVICE-COWORK
// {标记} 兼容壳残留: 当前前端会话服务仍统一经由 window.electron.cowork.* 转接到 Web API。
// {标记} 重构边界-待确认: 若迁移调用面，需与 electronShim / App.tsx / Settings / coworkSlice 成组推进。
// {FLOW} COWORK-SERVICE-TRUNK: 页面层只应经由 coworkService 进入会话主链；不要在组件内直接绕过 service 打后端。

const SCHEDULED_SESSION_PREFIX = '[定时] ';
const API_CONFIG_CHECK_TTL_MS = 15_000;
// {标记} P1-VIEWPORT-FIRST-HISTORY: 详情页默认只取一小段历史，接近两屏内容，后续按需回填。
const DEFAULT_SESSION_MESSAGE_LIMIT = 24;

function shouldShowInConversationHistory(session: { title?: string | null }): boolean {
  return !(session.title || '').startsWith(SCHEDULED_SESSION_PREFIX);
}

function shouldHideLegacyHistorySession(session: { systemPrompt?: string | null }): boolean {
  return isLegacyHiddenSession({ systemPrompt: session.systemPrompt ?? undefined });
}

class CoworkService {
  private streamListenerCleanups: Array<() => void> = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private subscribedSessionId: string | null = null;
  private sessionsRefreshTimer: number | null = null;
  private currentSessionRefreshTimer: number | null = null;
  private isLoadingSessions = false;
  private isRefreshingCurrentSession = false;
  private pendingSessionsRefresh = false;
  private pendingCurrentSessionRefreshId: string | null = null;
  private missingSessionRefreshAt = new Map<string, number>();
  private apiConfigCheckCache:
    | { at: number; result: { hasConfig: boolean; config: CoworkApiConfig | null; error?: string } | null }
    | null = null;

  private reportActionFailure(message: string, error?: string | null): void {
    const resolvedMessage = (error || '').trim() || message;
    showGlobalToast(resolvedMessage);
  }

  private cleanupSessionPendingState(sessionId: string): void {
    store.dispatch(clearPendingPermissionsForSession({ sessionId }));
    const currentSessionId = store.getState().cowork.currentSessionId;
    if (currentSessionId === sessionId) {
      store.dispatch(setStreaming(false));
    }
  }

  private resolveSessionMessageLimit(sessionId: string, requestedLimit?: number): number {
    const normalizedRequestedLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.floor(requestedLimit as number))
      : 0;
    const currentSession = store.getState().cowork.currentSession;

    if (currentSession?.id !== sessionId) {
      return normalizedRequestedLimit || DEFAULT_SESSION_MESSAGE_LIMIT;
    }

    const loadedMessageCount = currentSession.historyMeta?.loadedMessageCount ?? currentSession.messages.length;
    return Math.max(normalizedRequestedLimit || DEFAULT_SESSION_MESSAGE_LIMIT, loadedMessageCount, DEFAULT_SESSION_MESSAGE_LIMIT);
  }

  private syncSessionRoleAndModel(session: CoworkSession | null | undefined): void {
    if (!session?.agentRoleKey) {
      return;
    }

    const state = store.getState();
    const roleKey = session.agentRoleKey as AgentRoleKey;
    const availableModels = state.model.availableModels;
    const currentConfig = state.cowork.config;

    if (currentConfig.agentRoleKey !== roleKey) {
      store.dispatch(setConfig({ ...currentConfig, agentRoleKey: roleKey }));
    }

    const matchedModel = availableModels.find((model) => (
      model.providerKey === roleKey
      && (!session.modelId || model.id === session.modelId)
    )) ?? availableModels.find((model) => model.providerKey === roleKey);

    if (matchedModel) {
      store.dispatch(setSelectedModel(matchedModel));
    }
  }

  // {标记} WS-FIX-1: rAF 节流 — 合并高频 messageUpdate dispatch，每帧最多更新一次
  private pendingContentUpdates = new Map<string, { sessionId: string; messageId: string; content: string }>();
  private rafId: number | null = null;

  private flushContentUpdates = (): void => {
    this.rafId = null;
    for (const update of this.pendingContentUpdates.values()) {
      store.dispatch(updateMessageContent(update));
    }
    this.pendingContentUpdates.clear();
  };

  private throttledUpdateMessageContent(sessionId: string, messageId: string, content: string): void {
    this.pendingContentUpdates.set(`${sessionId}:${messageId}`, { sessionId, messageId, content });
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.flushContentUpdates);
    }
  }

  private scheduleSessionsRefresh(delayMs = 180): void {
    if (this.sessionsRefreshTimer !== null) {
      window.clearTimeout(this.sessionsRefreshTimer);
    }

    this.sessionsRefreshTimer = window.setTimeout(() => {
      this.sessionsRefreshTimer = null;
      void this.loadSessions();
    }, delayMs);
  }

  private scheduleCurrentSessionRefresh(sessionId: string, delayMs = 120): void {
    this.pendingCurrentSessionRefreshId = sessionId;

    if (this.currentSessionRefreshTimer !== null) {
      window.clearTimeout(this.currentSessionRefreshTimer);
    }

    this.currentSessionRefreshTimer = window.setTimeout(() => {
      this.currentSessionRefreshTimer = null;
      void this.refreshCurrentSessionSnapshot();
    }, delayMs);
  }

  private async refreshCurrentSessionSnapshot(): Promise<void> {
    const sessionId = this.pendingCurrentSessionRefreshId ?? store.getState().cowork.currentSessionId;
    this.pendingCurrentSessionRefreshId = null;

    if (!sessionId || this.isRefreshingCurrentSession) {
      return;
    }

    const cowork = window.electron?.cowork;
    if (!cowork) {
      return;
    }

    this.isRefreshingCurrentSession = true;
    try {
      const result = await cowork.getSession(sessionId, {
        messageLimit: this.resolveSessionMessageLimit(sessionId),
      });
      if (result.success && result.session) {
        const currentSessionId = store.getState().cowork.currentSessionId;
        if (currentSessionId === sessionId) {
          store.dispatch(setCurrentSession(result.session));
          this.syncSessionRoleAndModel(result.session);
          store.dispatch(setStreaming(result.session.status === 'running'));
        }
      }
    } finally {
      this.isRefreshingCurrentSession = false;
      if (this.pendingCurrentSessionRefreshId && this.pendingCurrentSessionRefreshId !== sessionId) {
        this.scheduleCurrentSessionRefresh(this.pendingCurrentSessionRefreshId, 0);
      }
    }
  }

  private scheduleMissingSessionRefresh(sessionId: string, delayMs = 0): void {
    const now = Date.now();
    const lastRefreshAt = this.missingSessionRefreshAt.get(sessionId) ?? 0;

    // IM-created sessions can emit several WS events before the first list refresh lands.
    // Throttle per-session hydration so one unknown session does not cascade into repeated GET /sessions.
    if (now - lastRefreshAt < 2000) {
      return;
    }

    this.missingSessionRefreshAt.set(sessionId, now);
    this.scheduleSessionsRefresh(delayMs);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      // Load initial config
      await this.loadConfig();

      // Load sessions list
      await this.loadSessions();

      // Set up stream listeners
      this.setupStreamListeners();

      // If the renderer restored a previously opened session from persisted state,
      // immediately re-hydrate it from the backend so the detail pane is not stale.
      const restoredCurrentSessionId = store.getState().cowork.currentSessionId;
      if (restoredCurrentSessionId) {
        await this.loadSession(restoredCurrentSessionId);
      }

      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private setupStreamListeners(): void {
    const cowork = window.electron?.cowork;
    if (!cowork) return;

    // Clean up any existing listeners
    this.cleanupListeners();

    // Message listener - also check if session exists (for IM-created sessions)
    const messageCleanup = cowork.onStreamMessage(async ({ sessionId, message }) => {
      // Debug: log user messages to check if imageAttachments are preserved
      if (message.type === 'user') {
        const meta = message.metadata as Record<string, unknown> | undefined;
        console.log('[CoworkService] onStreamMessage received user message', {
          sessionId,
          messageId: message.id,
          hasMetadata: !!meta,
          metadataKeys: meta ? Object.keys(meta) : [],
          hasImageAttachments: !!(meta?.imageAttachments),
          imageAttachmentsCount: Array.isArray(meta?.imageAttachments) ? (meta.imageAttachments as unknown[]).length : 0,
        });
      }
      // Check if session exists in current list
      const state = store.getState().cowork;
      const sessionExists = state.sessions.some(s => s.id === sessionId);

      if (!sessionExists) {
        // Session was created by IM or another source, refresh the session list
        this.scheduleMissingSessionRefresh(sessionId, 0);
      } else {
        this.missingSessionRefreshAt.delete(sessionId);
      }

      // A new user turn means this session is actively running again
      // (especially important for IM-triggered turns that do not call continueSession from renderer).
      if (message.type === 'user') {
        store.dispatch(updateSessionStatus({ sessionId, status: 'running' }));
      }

      // Do not force status back to "running" on arbitrary messages.
      // Late stream chunks can arrive after an error/complete event.
      store.dispatch(addMessage({ sessionId, message }));
    });
    this.streamListenerCleanups.push(messageCleanup);

    // Message update listener (for streaming content updates)
    // {标记} WS-FIX-1: 使用 rAF 节流，避免每个 token 都触发 re-render
    const messageUpdateCleanup = cowork.onStreamMessageUpdate(({ sessionId, messageId, content }) => {
      const currentSession = store.getState().cowork.currentSession;
      if (
        currentSession?.id === sessionId
        && !currentSession.messages.some((message) => message.id === messageId)
      ) {
        this.scheduleCurrentSessionRefresh(sessionId, 0);
      }
      this.throttledUpdateMessageContent(sessionId, messageId, content);
    });
    this.streamListenerCleanups.push(messageUpdateCleanup);

    // Permission request listener
    // {标记} 待评估-可能波及: 当前审批弹窗仍消费 window.electron 流式 permission 事件形状。
    const permissionCleanup = cowork.onStreamPermission(({ sessionId, request }) => {
      store.dispatch(enqueuePendingPermission({
        sessionId,
        toolName: request.toolName,
        toolInput: request.toolInput,
        requestId: request.requestId,
        toolUseId: request.toolUseId ?? null,
      }));
    });
    this.streamListenerCleanups.push(permissionCleanup);

    // Complete listener
    const completeCleanup = cowork.onStreamComplete(({ sessionId }) => {
      this.cleanupSessionPendingState(sessionId);
      store.dispatch(updateSessionStatus({ sessionId, status: 'completed' }));
    });
    this.streamListenerCleanups.push(completeCleanup);

    // Error listener
    const errorCleanup = cowork.onStreamError(({ sessionId }) => {
      this.cleanupSessionPendingState(sessionId);
      store.dispatch(updateSessionStatus({ sessionId, status: 'error' }));
    });
    this.streamListenerCleanups.push(errorCleanup);

    const sessionsChangedCleanup = cowork.onSessionsChanged(({ sessionId, reason }) => {
      if (sessionId) {
        if (reason === 'stopped' || reason === 'aborted') {
          // {标记} P0-STOP-CLEANUP-FIX: stop/abort 事件到达时，回收该会话的审批残留和 streaming 状态。
          this.cleanupSessionPendingState(sessionId);
          store.dispatch(updateSessionStatus({ sessionId, status: 'idle' }));
        }
        this.scheduleMissingSessionRefresh(sessionId, 0);
      } else {
        this.scheduleSessionsRefresh(0);
      }

      const currentSessionId = store.getState().cowork.currentSessionId;
      if (currentSessionId) {
        this.scheduleCurrentSessionRefresh(currentSessionId, currentSessionId === sessionId ? 0 : 80);
      }
    });
    this.streamListenerCleanups.push(sessionsChangedCleanup);
  }

  private cleanupListeners(): void {
    this.streamListenerCleanups.forEach(cleanup => cleanup());
    this.streamListenerCleanups = [];
  }

  private switchSessionSubscription(sessionId: string | null): void {
    if (this.subscribedSessionId === sessionId) {
      return;
    }

    if (this.subscribedSessionId) {
      webSocketClient.unsubscribe(buildCoworkRoomId(this.subscribedSessionId));
    }

    this.subscribedSessionId = sessionId;

    if (sessionId) {
      webSocketClient.subscribe(buildCoworkRoomId(sessionId));
    }
  }

  async loadSessions(): Promise<void> {
    if (this.isLoadingSessions) {
      this.pendingSessionsRefresh = true;
      return;
    }

    this.isLoadingSessions = true;
    const result = await window.electron?.cowork?.listSessions();
    try {
      if (result?.success && result.sessions) {
        const loadedSessionIds = new Set(result.sessions.map((session) => session.id));
        for (const sessionId of this.missingSessionRefreshAt.keys()) {
          if (loadedSessionIds.has(sessionId)) {
            this.missingSessionRefreshAt.delete(sessionId);
          }
        }
        store.dispatch(setSessions(
          result.sessions.filter((session) => (
            shouldShowInConversationHistory(session)
            && !shouldHideLegacyHistorySession(session)
          ))
        ));
      }
    } finally {
      this.isLoadingSessions = false;
      if (this.pendingSessionsRefresh) {
        this.pendingSessionsRefresh = false;
        this.scheduleSessionsRefresh(0);
      }
    }
  }

  async loadConfig(): Promise<void> {
    const result = await window.electron?.cowork?.getConfig();
    if (result?.success && result.config) {
      store.dispatch(setConfig(result.config));
    }
  }

  async startSession(options: CoworkStartOptions): Promise<CoworkSession | null> {
    const cowork = window.electron?.cowork;
    if (!cowork) {
      console.error('Cowork API not available');
      this.reportActionFailure('当前对话入口暂时不可用');
      return null;
    }

    // {标记} P0-已修复: start 失败已统一转为全局 toast，可见反馈已补齐。
    store.dispatch(setStreaming(true));
    try {
      const result = await cowork.startSession(options);
      if (result.success && result.session) {
        store.dispatch(setCurrentSession(result.session));
        this.syncSessionRoleAndModel(result.session);
        this.switchSessionSubscription(result.session.id);
        if (result.session.status !== 'running') {
          store.dispatch(setStreaming(false));
        }
        return result.session;
      }

      store.dispatch(setStreaming(false));
      console.error('Failed to start session:', result.error);
      this.reportActionFailure('启动对话失败', result.error);
      return null;
    } catch (error) {
      store.dispatch(setStreaming(false));
      const message = error instanceof Error ? error.message : '启动对话失败';
      console.error('Failed to start session:', error);
      this.reportActionFailure('启动对话失败', message);
      return null;
    }
  }

  async continueSession(options: CoworkContinueOptions): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) {
      console.error('Cowork API not available');
      this.reportActionFailure('当前对话入口暂时不可用');
      return false;
    }

    // {标记} P0-已修复: continue 失败已统一转为全局 toast，不再只留 error 状态。
    store.dispatch(setStreaming(true));
    store.dispatch(updateSessionStatus({ sessionId: options.sessionId, status: 'running' }));
    this.switchSessionSubscription(options.sessionId);
    try {
      const result = await cowork.continueSession({
        sessionId: options.sessionId,
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        activeSkillIds: options.activeSkillIds,
        imageAttachments: options.imageAttachments,
        zenMode: options.zenMode,
      });
      if (!result.success) {
        store.dispatch(setStreaming(false));
        store.dispatch(updateSessionStatus({ sessionId: options.sessionId, status: 'error' }));
        console.error('Failed to continue session:', result.error);
        this.reportActionFailure('发送失败', result.error);
        return false;
      }

      // Immediately hydrate the locally opened session with the backend snapshot.
      // This prevents the freshly sent user message from disappearing when the
      // websocket user-message event is missed or arrives after the assistant stream starts.
      if (result.session) {
        store.dispatch(setCurrentSession(result.session));
        this.syncSessionRoleAndModel(result.session);
        store.dispatch(setStreaming(result.session.status === 'running'));
      }

      return true;
    } catch (error) {
      store.dispatch(setStreaming(false));
      store.dispatch(updateSessionStatus({ sessionId: options.sessionId, status: 'error' }));
      const message = error instanceof Error ? error.message : '发送失败';
      console.error('Failed to continue session:', error);
      this.reportActionFailure('发送失败', message);
      return false;
    }
  }

  async stopSession(sessionId: string): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) {
      this.reportActionFailure('当前停止入口暂时不可用');
      return false;
    }
    try {
      const result = await cowork.stopSession(sessionId);
      if (result.success) {
        this.cleanupSessionPendingState(sessionId);
        store.dispatch(setStreaming(false));
        store.dispatch(updateSessionStatus({ sessionId, status: 'idle' }));
        return true;
      }

      // {标记} P0-部分修复: stop 失败已补统一 toast；收尾补偿仍待 R5。
      console.error('Failed to stop session:', result.error);
      this.reportActionFailure('停止对话失败', result.error);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '停止对话失败';
      console.error('Failed to stop session:', error);
      this.reportActionFailure('停止对话失败', message);
      return false;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const result = await cowork.deleteSession(sessionId);
    if (result.success) {
      store.dispatch(deleteSessionAction(sessionId));
      return true;
    }

    console.error('Failed to delete session:', result.error);
    return false;
  }

  async deleteSessions(sessionIds: string[]): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const result = await cowork.deleteSessions(sessionIds);
    if (result.success) {
      store.dispatch(deleteSessionsAction(sessionIds));
      return true;
    }

    console.error('Failed to batch delete sessions:', result.error);
    return false;
  }

  async setSessionPinned(sessionId: string, pinned: boolean): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork?.setSessionPinned) return false;

    const result = await cowork.setSessionPinned({ sessionId, pinned });
    if (result.success) {
      store.dispatch(updateSessionPinned({ sessionId, pinned }));
      return true;
    }

    console.error('Failed to update session pin:', result.error);
    return false;
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork?.renameSession) return false;

    const normalizedTitle = title.trim();
    if (!normalizedTitle) return false;

    const result = await cowork.renameSession({ sessionId, title: normalizedTitle });
    if (result.success) {
      store.dispatch(updateSessionTitle({ sessionId, title: normalizedTitle }));
      return true;
    }

    console.error('Failed to rename session:', result.error);
    return false;
  }

  async exportSessionResultImage(options: {
    rect: { x: number; y: number; width: number; height: number };
    defaultFileName?: string;
  }): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork?.exportResultImage) {
      return { success: false, error: 'Cowork export API not available' };
    }

    try {
      const result = await cowork.exportResultImage(options);
      return result ?? { success: false, error: 'Failed to export session image' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export session image',
      };
    }
  }

  async captureSessionImageChunk(options: {
    rect: { x: number; y: number; width: number; height: number };
  }): Promise<{ success: boolean; width?: number; height?: number; pngBase64?: string; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork?.captureImageChunk) {
      return { success: false, error: 'Cowork capture API not available' };
    }

    try {
      const result = await cowork.captureImageChunk(options);
      return result ?? { success: false, error: 'Failed to capture session image chunk' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture session image chunk',
      };
    }
  }

  async saveSessionResultImage(options: {
    pngBase64: string;
    defaultFileName?: string;
  }): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> {
    const cowork = window.electron?.cowork;
    if (!cowork?.saveResultImage) {
      return { success: false, error: 'Cowork save image API not available' };
    }

    try {
      const result = await cowork.saveResultImage(options);
      return result ?? { success: false, error: 'Failed to save session image' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save session image',
      };
    }
  }

  async loadSession(sessionId: string, options?: { messageLimit?: number }): Promise<CoworkSession | null> {
    const cowork = window.electron?.cowork;
    if (!cowork) return null;

    this.switchSessionSubscription(sessionId);
    store.dispatch(setLoadingSessionId(sessionId));
    try {
      const result = await cowork.getSession(sessionId, {
        messageLimit: this.resolveSessionMessageLimit(sessionId, options?.messageLimit),
      });
      if (result.success && result.session) {
        store.dispatch(setCurrentSession(result.session));
        this.syncSessionRoleAndModel(result.session);
        store.dispatch(setStreaming(result.session.status === 'running'));
        if (result.session.status === 'running') {
          this.scheduleCurrentSessionRefresh(sessionId, 160);
        }
        return result.session;
      }

      console.error('Failed to load session:', result.error);
      return null;
    } finally {
      const loadingSessionId = store.getState().cowork.loadingSessionId;
      if (loadingSessionId === sessionId) {
        store.dispatch(setLoadingSessionId(null));
      }
    }
  }

  async respondToPermission(requestId: string, result: CoworkPermissionResult): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) {
      this.reportActionFailure('当前审批入口暂时不可用');
      return false;
    }

    // {标记} 待评估-可能波及: 当前仍直接沿用旧 permission result 形状回传后端。
    try {
      const response = await cowork.respondToPermission({ requestId, result });
      if (response.success) {
        store.dispatch(dequeuePendingPermission({ requestId }));
        return true;
      }

      console.error('Failed to respond to permission:', response.error);
      this.reportActionFailure('提交审批结果失败', response.error);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交审批结果失败';
      console.error('Failed to respond to permission:', error);
      this.reportActionFailure('提交审批结果失败', message);
      return false;
    }
  }

  async updateConfig(config: CoworkConfigUpdate): Promise<boolean> {
    const cowork = window.electron?.cowork;
    if (!cowork) return false;

    const result = await cowork.setConfig(config);
    if (result.success) {
      const currentConfig = store.getState().cowork.config;
      store.dispatch(setConfig({ ...currentConfig, ...config }));
      return true;
    }

    console.error('Failed to update config:', result.error);
    return false;
  }

  async getApiConfig(): Promise<CoworkApiConfig | null> {
    if (!window.electron?.getApiConfig) {
      return null;
    }
    return window.electron.getApiConfig();
  }

  async checkApiConfig(options?: { probeModel?: boolean }): Promise<{ hasConfig: boolean; config: CoworkApiConfig | null; error?: string } | null> {
    if (!window.electron?.checkApiConfig) {
      return null;
    }
    const shouldUseCache = !options?.probeModel;
    const now = Date.now();
    if (
      shouldUseCache
      && this.apiConfigCheckCache
      && now - this.apiConfigCheckCache.at <= API_CONFIG_CHECK_TTL_MS
    ) {
      return this.apiConfigCheckCache.result;
    }
    const result = await window.electron.checkApiConfig(options);
    if (shouldUseCache) {
      this.apiConfigCheckCache = { at: now, result };
    }
    return result;
  }

  async saveApiConfig(config: CoworkApiConfig): Promise<{ success: boolean; error?: string } | null> {
    if (!window.electron?.saveApiConfig) {
      return null;
    }
    return window.electron.saveApiConfig(config);
  }

  async listMemoryEntries(input: {
    query?: string;
    status?: 'created' | 'stale' | 'deleted' | 'all';
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
    agentRoleKey?: string;
  }): Promise<CoworkUserMemoryEntry[]> {
    const api = window.electron?.cowork?.listMemoryEntries;
    if (!api) return [];
    const result = await api(input);
    if (!result?.success || !result.entries) return [];
    return result.entries;
  }

  async createMemoryEntry(input: {
    text: string;
    confidence?: number;
    isExplicit?: boolean;
    agentRoleKey?: string;
    modelId?: string;
  }): Promise<CoworkUserMemoryEntry | null> {
    const api = window.electron?.cowork?.createMemoryEntry;
    if (!api) return null;
    const result = await api(input);
    if (!result?.success || !result.entry) return null;
    return result.entry;
  }

  async updateMemoryEntry(input: {
    id: string;
    text?: string;
    confidence?: number;
    status?: 'created' | 'stale' | 'deleted';
    isExplicit?: boolean;
  }): Promise<CoworkUserMemoryEntry | null> {
    const api = window.electron?.cowork?.updateMemoryEntry;
    if (!api) return null;
    const result = await api(input);
    if (!result?.success || !result.entry) return null;
    return result.entry;
  }

  async deleteMemoryEntry(input: { id: string }): Promise<boolean> {
    const api = window.electron?.cowork?.deleteMemoryEntry;
    if (!api) return false;
    const result = await api(input);
    return Boolean(result?.success);
  }

  async getMemoryStats(input?: {
    agentRoleKey?: string;
  }): Promise<CoworkMemoryStats | null> {
    const api = window.electron?.cowork?.getMemoryStats;
    if (!api) return null;
    const result = await api(input);
    if (!result?.success || !result.stats) return null;
    return result.stats;
  }

  async listBroadcastBoards(input?: {
    agentRoleKey?: string;
    limit?: number;
  }): Promise<CoworkBroadcastBoardSnapshot[]> {
    const api = window.electron?.cowork?.listBroadcastBoards;
    if (!api) return [];
    const result = await api(input);
    if (!result?.success || !result.boards) return [];
    return result.boards;
  }

  async clearBroadcastBoard(input: {
    agentRoleKey: string;
  }): Promise<boolean> {
    const api = window.electron?.cowork?.clearBroadcastBoard;
    if (!api) return false;
    const result = await api(input);
    return Boolean(result?.success);
  }

  async compressContext(sessionId: string): Promise<{ compression: CoworkManualCompressionResult | null; error?: string }> {
    const api = window.electron?.cowork?.compressContext;
    if (!api) return { compression: null, error: '压缩入口暂不可用' };
    const result = await api({ sessionId });
    if (!result?.success || !result.compression) {
      return { compression: null, error: result?.error || '后端压缩暂不可用' };
    }
    return { compression: result.compression };
  }

  async generateSessionTitle(prompt: string | null): Promise<string | null> {
    if (!window.electron?.generateSessionTitle) {
      return null;
    }
    return window.electron.generateSessionTitle(prompt);
  }

  async getRecentCwds(limit?: number): Promise<string[]> {
    if (!window.electron?.getRecentCwds) {
      return [];
    }
    return window.electron.getRecentCwds(limit);
  }

  clearSession(): void {
    this.switchSessionSubscription(null);
    store.dispatch(clearCurrentSession());
  }

  destroy(): void {
    this.cleanupListeners();
    this.switchSessionSubscription(null);
    if (this.currentSessionRefreshTimer !== null) {
      window.clearTimeout(this.currentSessionRefreshTimer);
      this.currentSessionRefreshTimer = null;
    }
    // {标记} WS-FIX-1: 清理 rAF 节流
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingContentUpdates.clear();
    this.missingSessionRefreshAt.clear();
    this.apiConfigCheckCache = null;
    if (this.sessionsRefreshTimer !== null) {
      window.clearTimeout(this.sessionsRefreshTimer);
      this.sessionsRefreshTimer = null;
    }
    this.isLoadingSessions = false;
    this.pendingSessionsRefresh = false;
    this.initPromise = null;
    this.initialized = false;
  }
}

export const coworkService = new CoworkService();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    coworkService.destroy();
  });
}
