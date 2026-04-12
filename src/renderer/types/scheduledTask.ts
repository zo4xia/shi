// 调度类型
export interface ScheduleAt {
  type: 'at';
  datetime: string; // ISO 8601
}

export interface ScheduleInterval {
  type: 'interval';
  intervalMs: number;
  unit: 'minutes' | 'hours' | 'days';
  value: number;
}

export interface ScheduleCron {
  type: 'cron';
  expression: string; // 5段 CRON 表达式
}

export type Schedule = ScheduleAt | ScheduleInterval | ScheduleCron;

// 任务状态
export type TaskLastStatus = 'success' | 'error' | 'running' | null;

export interface TaskState {
  nextRunAtMs: number | null;
  lastRunAtMs: number | null;
  lastStatus: TaskLastStatus;
  lastError: string | null;
  lastDurationMs: number | null;
  runningAtMs: number | null;
  consecutiveErrors: number;
}

// IM 通知平台类型
export type NotifyPlatform = 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'discord' | 'nim' | 'xiaomifeng' | 'wecom';

// 定时任务
// {标记} P0-IDENTITY-BOUNDARY: 定时任务里 agentRoleKey 才是身份；modelId 只是当前运行时模型元信息。
export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: Schedule;
  prompt: string;
  workingDirectory: string;
  systemPrompt: string;
  executionMode: 'local';
  expiresAt: string | null; // ISO 8601 日期（精确到天），null 表示不过期
  skillIds: string[];
  notifyPlatforms: NotifyPlatform[]; // 任务完成后通知的 IM 平台
  completionWebhookUrl?: string | null;
  feishuNotifyAgentRoleKey?: string | null;
  feishuAppId?: string | null;
  feishuChatId?: string | null;
  // {标记} P0-IDENTITY-BOUNDARY: 持久化保留的是角色身份键；运行时可映射到 4 主角色槽位，但不能让 modelId 取代身份。
  agentRoleKey?: string;
  modelId?: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
}

// 运行记录
export interface ScheduledTaskRun {
  id: string;
  taskId: string;
  sessionId: string | null;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  trigger: 'scheduled' | 'manual';
}

// 带任务名称的运行记录（用于全局历史列表）
export interface ScheduledTaskRunWithName extends ScheduledTaskRun {
  taskName: string;
}

// 表单输入
// {标记} P0-IDENTITY-BOUNDARY: 定时任务表单里的角色身份和运行模型元信息必须分层，不能混成一个概念。
export interface ScheduledTaskInput {
  name: string;
  description: string;
  schedule: Schedule;
  prompt: string;
  workingDirectory: string;
  systemPrompt: string;
  executionMode: 'local';
  expiresAt: string | null; // ISO 8601 日期（精确到天），null 表示不过期
  skillIds: string[];
  notifyPlatforms: NotifyPlatform[]; // 任务完成后通知的 IM 平台
  completionWebhookUrl?: string | null;
  feishuNotifyAgentRoleKey?: string | null;
  feishuAppId?: string | null;
  feishuChatId?: string | null;
  enabled: boolean;
  // {标记} P0-IDENTITY-BOUNDARY: agentRoleKey 是身份；modelId 只是执行时当前挂的发动机。
  agentRoleKey?: string;
  modelId?: string;
}

// IPC 事件
export interface ScheduledTaskStatusEvent {
  taskId: string;
  state: TaskState;
}

export interface ScheduledTaskRunEvent {
  run: ScheduledTaskRun;
}

// UI 视图模式
export type ScheduledTaskViewMode = 'list' | 'create' | 'edit' | 'detail';
