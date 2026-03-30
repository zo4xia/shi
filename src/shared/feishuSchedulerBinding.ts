export const FEISHU_SCHEDULER_ENABLE_COMMAND = '#开启定时#';
export const FEISHU_SCHEDULER_DISABLE_COMMAND = '#关闭定时#';
const FEISHU_SCHEDULER_BINDING_PREFIX = 'feishu.scheduler.binding:';

export type FeishuSchedulerBindingCommand = 'enable' | 'disable';

export interface FeishuSchedulerBinding {
  agentRoleKey: string;
  appId: string;
  appName: string;
  chatId: string;
  senderId: string;
  chatType: 'p2p';
  updatedAt: string;
}

export function getFeishuSchedulerBindingKey(agentRoleKey: string): string {
  return `${FEISHU_SCHEDULER_BINDING_PREFIX}${agentRoleKey.trim()}`;
}

export function resolveFeishuSchedulerBindingCommand(text: string): FeishuSchedulerBindingCommand | null {
  const normalized = String(text || '').trim();
  if (normalized === FEISHU_SCHEDULER_ENABLE_COMMAND) {
    return 'enable';
  }
  if (normalized === FEISHU_SCHEDULER_DISABLE_COMMAND) {
    return 'disable';
  }
  return null;
}
