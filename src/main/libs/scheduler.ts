/**
 * {祖传勿改} Scheduler - 定时任务调度引擎
 * {标记} 功能：定时轮询 + 任务执行 + CoworkSession 启动
 * {标记} 用途：按计划自动执行 AI 任务（每日记忆抽取等）
 * {验证} 2026-03-17 复查：调度逻辑正常，身份绑定已修复 ✅
 * {警告} 修改此文件会影响所有定时任务的执行时机和身份绑定
 * {标记} 旧污染残留: CoworkRunner 兼容代码仍在本文件里，但当前 server runtime 已优先改走轻执行器。
 * {标记} 重构边界-待确认: 后续若继续切轻链，必须成组核对 scheduledTask run/history/status/stop
 */
import { BrowserWindow } from '../electron';
import { ScheduledTaskStore, ScheduledTask, ScheduledTaskRun, Schedule, NotifyPlatform } from '../scheduledTaskStore';
import type { CoworkStore } from '../coworkStore';
import type { CoworkRunner } from './coworkRunner';
import { broadcastToAll } from '../../../server/websocket';

interface SchedulerDeps {
  scheduledTaskStore: ScheduledTaskStore;
  coworkStore: CoworkStore;
  getCoworkRunner?: (() => CoworkRunner) | null;
  getSkillsPrompt?: (skillIds?: string[]) => Promise<string | null>;
  runTaskDirectly?: (task: ScheduledTask) => Promise<{ handled: boolean; sessionId?: string | null }>;
  stopSessionDirectly?: (sessionId: string) => boolean;
}

interface ActiveTaskExecution {
  abortController: AbortController;
  runId: string;
  startedAtMs: number;
  finalized: boolean;
}

function formatWebhookTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const WEBHOOK_TEXT_PLACEHOLDER = '{{这里面是回调的文字内容}}';

function buildCompletionWebhookText(params: {
  task: ScheduledTask;
  success: boolean;
  durationMs: number;
  error: string | null;
  sessionId: string | null;
}): string {
  const parts = [
    `[定时任务${params.success ? '成功' : '失败'}] ${params.task.name}`,
    `时间：${formatWebhookTimestamp(new Date())}`,
    `状态：${params.success ? '成功' : '失败'}`,
    `耗时：${params.durationMs}ms`,
  ];

  if (params.sessionId) {
    parts.push(`会话ID：${params.sessionId}`);
  }
  if (params.error) {
    parts.push(`错误：${params.error}`);
  }

  return parts.join('\n');
}

function applyCompletionWebhookTemplate(template: string, params: {
  task: ScheduledTask;
  success: boolean;
  durationMs: number;
  error: string | null;
  sessionId: string | null;
}): string {
  const textContent = buildCompletionWebhookText(params);
  const replacements: Record<string, string> = {
    '{{时间-日期}}': formatWebhookTimestamp(new Date()),
    '{{平台-成功或失败}}': `web-${params.success ? '成功' : '失败'}`,
    '{{任务名}}': params.task.name,
    '{{状态}}': params.success ? '成功' : '失败',
    '{{耗时毫秒}}': String(params.durationMs),
    '{{会话ID}}': params.sessionId || '',
    '{{错误}}': params.error || '',
    [WEBHOOK_TEXT_PLACEHOLDER]: textContent,
  };

  let resolved = template.trim();
  for (const [token, value] of Object.entries(replacements)) {
    resolved = resolved.split(token).join(encodeURIComponent(value));
  }
  return resolved;
}

function isWecomRobotWebhook(url: string): boolean {
  return /^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?/i.test(url.trim());
}

export class Scheduler {
  private store: ScheduledTaskStore;
  private coworkStore: CoworkStore;
  private getCoworkRunner: (() => CoworkRunner) | null;
  private getSkillsPrompt: ((skillIds?: string[]) => Promise<string | null>) | null;
  private runTaskDirectly: ((task: ScheduledTask) => Promise<{ handled: boolean; sessionId?: string | null }>) | null;
  private stopSessionDirectly: ((sessionId: string) => boolean) | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private activeTasks: Map<string, ActiveTaskExecution> = new Map();
  // Track cowork session IDs for running tasks so we can stop them
  private taskSessionIds: Map<string, string> = new Map();

  private static readonly MAX_TIMER_INTERVAL_MS = 60_000;
  private static readonly MAX_CONSECUTIVE_ERRORS = 5;

  constructor(deps: SchedulerDeps) {
    this.store = deps.scheduledTaskStore;
    this.coworkStore = deps.coworkStore;
    this.getCoworkRunner = deps.getCoworkRunner ?? null;
    this.getSkillsPrompt = deps.getSkillsPrompt ?? null;
    this.runTaskDirectly = deps.runTaskDirectly ?? null;
    this.stopSessionDirectly = deps.stopSessionDirectly ?? null;
  }

  // --- Lifecycle ---

  start(): void {
    if (this.running) return;
    if (!this.hasPendingScheduledWork()) {
      // {标记} P1-SCHEDULER-IDLE-SLEEP: 没有启用且未过期的任务时，不挂常驻 timer。
      console.log('[Scheduler] Idle sleep: no enabled unexpired tasks');
      return;
    }
    this.running = true;
    console.log('[Scheduler] Started');
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const [, execution] of this.activeTasks) {
      execution.abortController.abort();
    }
    this.activeTasks.clear();
    console.log('[Scheduler] Stopped');
  }

  reschedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.hasPendingScheduledWork()) {
      if (this.running) {
        console.log('[Scheduler] Entered idle sleep: no enabled unexpired tasks');
      }
      this.running = false;
      return;
    }

    if (!this.running) {
      this.running = true;
      console.log('[Scheduler] Woke from idle sleep');
    }

    this.scheduleNext();
  }

  // --- Core Scheduling ---

  private hasPendingScheduledWork(): boolean {
    return this.store.getNextDueTimeMs() !== null;
  }

  private scheduleNext(): void {
    if (!this.running) return;

    const nextDueMs = this.store.getNextDueTimeMs();
    const now = Date.now();

    if (nextDueMs === null) {
      // {标记} P1-SCHEDULER-IDLE-SLEEP: 所有任务关闭/过期后，自动释放 timer，避免空转轮询。
      this.running = false;
      console.log('[Scheduler] Idle sleep: next due task not found');
      return;
    }

    const delayMs = Math.min(
      Math.max(nextDueMs - now, 0),
      Scheduler.MAX_TIMER_INTERVAL_MS
    );

    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();
    const dueTasks = this.store.getDueTasks(now);

    const executions = dueTasks.map((task) => this.executeTask(task, 'scheduled'));
    await Promise.allSettled(executions);

    this.scheduleNext();
  }

  // --- Task Execution ---

  async executeTask(
    task: ScheduledTask,
    trigger: 'scheduled' | 'manual'
  ): Promise<void> {
    // {BUG} bug-scheduler-coworkrunner-fallback-001
    // {说明} 定时任务当前必须走 runTaskDirectly -> HttpSessionExecutor。
    // {修复} 当前 server runtime 不再允许 executeTask 在 handled:false 后静默掉回 CoworkRunner。
    if (this.activeTasks.has(task.id)) {
      console.log(`[Scheduler] Task ${task.id} already running, skipping`);
      return;
    }

    // Check if task has expired (skip for manual triggers)
    if (trigger === 'scheduled' && task.expiresAt) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (task.expiresAt <= todayStr) {
        console.log(`[Scheduler] Task ${task.id} expired (${task.expiresAt}), skipping`);
        return;
      }
    }

    const startTime = Date.now();
    const run = this.store.createRun(task.id, trigger);

    this.store.markTaskRunning(task.id, startTime);
    this.emitTaskStatusUpdate(task.id);
    this.emitRunUpdate(run);

    const abortController = new AbortController();
    const execution: ActiveTaskExecution = {
      abortController,
      runId: run.id,
      startedAtMs: startTime,
      finalized: false,
    };
    this.activeTasks.set(task.id, execution);

    let sessionId: string | null = null;
    let success = false;
    let error: string | null = null;

    try {
      if (!this.runTaskDirectly) {
        throw new Error('Scheduler direct executor is missing; legacy CoworkRunner fallback is intentionally disabled.');
      }

      const directResult = await this.runTaskDirectly(task);
      if (!directResult.handled) {
        throw new Error('Scheduler direct executor returned handled:false; legacy CoworkRunner fallback is intentionally disabled.');
      }

      sessionId = directResult.sessionId ?? null;
      success = true;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`[Scheduler] Task ${task.id} failed:`, error);
    } finally {
      this.finalizeTaskExecution(task, execution, success, sessionId, error);
    }
  }

  private async startCoworkSession(task: ScheduledTask): Promise<string> {
    // {BUG} bug-scheduler-legacy-runner-entry-001
    // {说明} 这是定时任务回退到 CoworkRunner 的旧兼容入口，当前 server runtime 已不允许 executeTask 命中这里。
    if (!this.getCoworkRunner) {
      throw new Error('Scheduler legacy CoworkRunner fallback is disabled in this runtime.');
    }
    const config = this.coworkStore.getConfig();
    const cwd = task.workingDirectory || config.workingDirectory;
    const baseSystemPrompt = task.systemPrompt || config.systemPrompt;
    const selectedSkillIds = Array.isArray(task.skillIds) ? task.skillIds.filter(Boolean) : [];
    let skillsPrompt: string | null = null;
    if (this.getSkillsPrompt) {
      try {
        // {标记} 待修复-高token入口: 当定时任务未显式选择 skillIds 时，这里仍可能注入全局 auto-routing skills prompt。
        // {标记} 待评估-可能波及: 低配机负载、长 prompt、普通定时任务 token 消耗。
        skillsPrompt = await this.getSkillsPrompt(selectedSkillIds.length > 0 ? selectedSkillIds : undefined);
      } catch (error) {
        console.warn('[Scheduler] Failed to build skills prompt for scheduled task:', error);
      }
    }
    const systemPrompt = [skillsPrompt, baseSystemPrompt]
      .filter((prompt): prompt is string => Boolean(prompt?.trim()))
      .join('\n\n');
    const executionMode = 'local';

    // {标记} P0-BUG-FIX: 定时任务身份绑定 - 使用任务自己的身份而非全局配置
    const session = this.coworkStore.createSession(
      `[定时] ${task.name}`,
      cwd,
      systemPrompt,
      executionMode,
      selectedSkillIds,
      { 
        agentRoleKey: task.agentRoleKey || 'organizer',  // ⭐ 使用任务自己的身份
        modelId: task.modelId || '',
        sourceType: 'desktop',
      }
    );

    // Update session to running
    this.coworkStore.updateSession(session.id, { status: 'running' });

    // Add initial user message
    this.coworkStore.addMessage(session.id, {
      type: 'user',
      content: task.prompt,
      metadata: selectedSkillIds.length > 0 ? { skillIds: selectedSkillIds } : undefined,
    });

    // Start the session with normal permission flow (no auto-approve).
    this.taskSessionIds.set(task.id, session.id);
    // {标记} 旧污染活口: scheduler 仍把任务执行交给 CoworkRunner，而不是轻执行器。
    // {标记} 待评估-可能波及: 定时任务历史、权限流、会话状态收尾、memory pipeline。
    // [SDK-CUT:SCHEDULER] Scheduled task execution still launches through CoworkRunner/SDK.
    const runner = this.getCoworkRunner();
    await runner.startSession(session.id, task.prompt, {
      skipInitialUserMessage: true,
      skillIds: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      confirmationMode: 'text',
    });

    return session.id;
  }

  // --- Manual Execution ---

  async runManually(taskId: string): Promise<void> {
    const task = this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    await this.executeTask(task, 'manual');
  }

  stopTask(taskId: string): boolean {
    const execution = this.activeTasks.get(taskId);
    if (execution) {
      // Also stop the cowork session if one is running
      const sessionId = this.taskSessionIds.get(taskId) ?? null;
      if (sessionId) {
        try {
          // {标记} P0-SCHEDULER-STOP-LIGHT-FIRST: 定时任务停止优先命中现役轻执行器，避免主路再回 CoworkRunner。
          const stoppedByDirectExecutor = this.stopSessionDirectly
            ? this.stopSessionDirectly(sessionId)
            : false;
          if (!stoppedByDirectExecutor) {
            if (!this.getCoworkRunner) {
              console.warn(`[Scheduler] No legacy runner fallback available for task ${taskId}`);
            } else {
              // {标记} 旧污染活口: scheduler 仍保留 CoworkRunner stop 兼容兜底，仅用于遗留中的旧执行会话。
              // [SDK-CUT:SCHEDULER] Scheduled task cancellation still depends on CoworkRunner stop semantics.
              this.getCoworkRunner().stopSession(sessionId);
            }
          }
        } catch (err) {
          console.warn(`[Scheduler] Failed to stop cowork session for task ${taskId}:`, err);
        }
      }

      execution.abortController.abort();

      const task = this.store.getTask(taskId);
      if (task) {
        this.finalizeTaskExecution(task, execution, false, sessionId, 'Task stopped manually');
      } else {
        this.activeTasks.delete(taskId);
        this.taskSessionIds.delete(taskId);
      }
      return true;
    }
    return false;
  }

  private finalizeTaskExecution(
    task: ScheduledTask,
    execution: ActiveTaskExecution,
    success: boolean,
    sessionId: string | null,
    error: string | null
  ): void {
    if (execution.finalized) {
      return;
    }

    execution.finalized = true;
    this.activeTasks.delete(task.id);
    this.taskSessionIds.delete(task.id);

    const durationMs = Date.now() - execution.startedAtMs;

    // Check if task still exists (may have been deleted while running)
    const latestTask = this.store.getTask(task.id);
    if (!latestTask) {
      console.log(`[Scheduler] Task ${task.id} was deleted during execution, skipping post-run updates`);
      this.reschedule();
      return;
    }

    // Update run record
    this.store.completeRun(
      execution.runId,
      success ? 'success' : 'error',
      sessionId,
      durationMs,
      error
    );

    // Update task state
    this.store.markTaskCompleted(
      task.id,
      success,
      durationMs,
      error,
      latestTask.schedule
    );

    const updatedTask = this.store.getTask(task.id);

    // Auto-disable on too many consecutive errors
    if (updatedTask && updatedTask.state.consecutiveErrors >= Scheduler.MAX_CONSECUTIVE_ERRORS) {
      this.store.toggleTask(task.id, false);
      console.warn(
        `[Scheduler] Task ${task.id} auto-disabled after ${Scheduler.MAX_CONSECUTIVE_ERRORS} consecutive errors`
      );
    }

    // Disable one-shot 'at' tasks after execution
    if (latestTask.schedule.type === 'at') {
      this.store.toggleTask(task.id, false);
    }

    // Keep generated cowork sessions compact, but keep run history in the
    // database so the UI can page through older records on demand.
    this.coworkStore.pruneSessionsByTitle(`[定时] ${task.name}`, 1);

    // Emit final updates
    this.emitTaskStatusUpdate(task.id);
    const updatedRun = this.store.getRun(execution.runId);
    if (updatedRun) {
      this.emitRunUpdate(updatedRun);
    }

    void this.sendCompletionWebhook(updatedTask ?? latestTask, success, durationMs, error, sessionId);

    this.reschedule();
  }

  private async sendCompletionWebhook(
    task: ScheduledTask,
    success: boolean,
    durationMs: number,
    error: string | null,
    sessionId: string | null
  ): Promise<void> {
    const rawWebhookUrl = task.completionWebhookUrl?.trim() || '';
    if (!rawWebhookUrl) {
      return;
    }

    const webhookText = buildCompletionWebhookText({
      task,
      success,
      durationMs,
      error,
      sessionId,
    });

    try {
      let response: Response;
      if (rawWebhookUrl.includes(WEBHOOK_TEXT_PLACEHOLDER)) {
        const webhookUrl = applyCompletionWebhookTemplate(rawWebhookUrl, {
          task,
          success,
          durationMs,
          error,
          sessionId,
        });
        response = await fetch(webhookUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(15_000),
        });
      } else if (isWecomRobotWebhook(rawWebhookUrl)) {
        response = await fetch(rawWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            msgtype: 'text',
            text: {
              content: webhookText,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } else {
        throw new Error(`Webhook URL 缺少 ${WEBHOOK_TEXT_PLACEHOLDER} 占位符，且不是企业微信机器人地址`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
    } catch (webhookError) {
      console.warn(`[Scheduler] Failed to send completion webhook for task ${task.id}:`, webhookError);
    }
  }

  // --- Event Emission ---

  private emitTaskStatusUpdate(taskId: string): void {
    const task = this.store.getTask(taskId);
    if (!task) return;

    try {
      broadcastToAll({
        type: 'scheduledTask:statusUpdate',
        data: {
          taskId: task.id,
          state: task.state,
        },
      });
    } catch (error) {
      console.warn('[Scheduler] Failed to broadcast task status update:', error);
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('scheduledTask:statusUpdate', {
          taskId: task.id,
          state: task.state,
        });
      }
    });
  }

  private emitRunUpdate(run: ScheduledTaskRun): void {
    try {
      broadcastToAll({
        type: 'scheduledTask:runUpdate',
        data: { run },
      });
    } catch (error) {
      console.warn('[Scheduler] Failed to broadcast task run update:', error);
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('scheduledTask:runUpdate', { run });
      }
    });
  }
}
