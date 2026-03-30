import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setViewMode } from '../../store/slices/scheduledTaskSlice';
import { scheduledTaskService } from '../../services/scheduledTask';
import { showGlobalToast } from '../../services/toast';
import { getSkillDisplayName } from '../../types/skill';
import type { ScheduledTask, Schedule } from '../../types/scheduledTask';
import TaskRunHistory from './TaskRunHistory';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import PencilIcon from '../icons/PencilIcon';
import TrashIcon from '../icons/TrashIcon';

function formatScheduleLabel(schedule: Schedule): string {
  const unitLabelMap: Record<string, string> = {
    minutes: '分钟',
    hours: '小时',
    days: '天',
  };
  switch (schedule.type) {
    case 'at':
      return `${'定时'}: ${schedule.datetime ? new Date(schedule.datetime).toLocaleString() : '-'}`;
    case 'interval': {
      return `${'每'} ${schedule.value ?? 0} ${unitLabelMap[schedule.unit ?? ''] || schedule.unit}`;
    }
    case 'cron':
      return `${'Cron'}: ${schedule.expression ?? ''}`;
    default:
      return '';
  }
}

interface TaskDetailProps {
  task: ScheduledTask;
  onRequestDelete: (taskId: string, taskName: string) => void;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ task, onRequestDelete }) => {
  const dispatch = useDispatch();
  const runs = useSelector((state: RootState) => state.scheduledTask.runs[task.id] ?? []);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const selectedSkills = task.skillIds
    .map((skillId) => skills.find((skill) => skill.id === skillId))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

  useEffect(() => {
    scheduledTaskService.loadRuns(task.id);
  }, [task.id]);

  const handleEdit = () => {
    dispatch(setViewMode('edit'));
  };

  const handleRunNow = async () => {
    try {
      await scheduledTaskService.runManually(task.id);
      showGlobalToast('任务已开始运行');
    } catch (error) {
      showGlobalToast(error instanceof Error ? error.message : '运行任务失败');
    }
  };

  const handleStop = async () => {
    try {
      await scheduledTaskService.stopTask(task.id);
      showGlobalToast('任务已停止');
    } catch (error) {
      showGlobalToast(error instanceof Error ? error.message : '停止任务失败');
    }
  };

  const handleDelete = () => {
    onRequestDelete(task.id, task.name);
  };

  const statusLabelMap: Record<string, string> = {
    success: '成功',
    error: '失败',
    running: '运行中',
    idle: '空闲',
  };
  const statusLabel = task.state.lastStatus
    ? (statusLabelMap[task.state.lastStatus] || task.state.lastStatus)
    : '-';

  const statusColor = {
    success: 'text-green-500',
    error: 'text-red-500',
    running: 'text-blue-500',
  };

  const sectionClass = 'rounded-lg border dark:border-claude-darkBorder border-claude-border p-4';
  const sectionTitleClass = 'text-sm font-semibold dark:text-claude-darkText text-claude-text mb-3';
  const labelClass = 'text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary';
  const valueClass = 'text-sm dark:text-claude-darkText text-claude-text';

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
            {task.name}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleEdit}
            className="p-2 rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            title={'编辑'}
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={task.state.runningAtMs ? handleStop : handleRunNow}
            className="p-2 rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50"
            title={task.state.runningAtMs ? '停止' : '立即运行'}
          >
            {task.state.runningAtMs ? <StopIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title={'删除'}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Prompt */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{'提示词'}</h3>
        <div className="text-sm dark:text-claude-darkText text-claude-text whitespace-pre-wrap bg-claude-surfaceHover/30 dark:bg-claude-darkSurfaceHover/30 rounded-md p-3">
          {task.prompt}
        </div>
      </div>

      {/* Configuration */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{'配置信息'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={labelClass}>{'计划'}</div>
            <div className={valueClass}>{formatScheduleLabel(task.schedule)}</div>
          </div>
          <div>
            <div className={labelClass}>{'启用任务'}</div>
            <div className={valueClass}>
              <span className={`inline-flex items-center gap-1 ${task.enabled ? 'text-green-500' : 'dark:text-claude-darkTextSecondary text-claude-textSecondary'}`}>
                {task.enabled ? '✓ ' + '已启用' : '已禁用'}
              </span>
            </div>
          </div>
          {task.workingDirectory && (
            <div className="col-span-2">
              <div className={labelClass}>{'工作目录'}</div>
              <div className={valueClass + ' font-mono text-xs'}>{task.workingDirectory}</div>
            </div>
          )}
          <div>
            <div className={labelClass}>{'执行模式'}</div>
            <div className={valueClass}>{task.executionMode}</div>
          </div>
          <div>
            <div className={labelClass}>{'到期时间'}</div>
            <div className={valueClass}>
              {task.expiresAt
                ? new Date(task.expiresAt + 'T00:00:00').toLocaleDateString()
                : '永不过期'}
            </div>
          </div>
          <div>
            <div className={labelClass}>{'通知'}</div>
            <div className={valueClass}>
              {task.notifyPlatforms.includes('feishu')
                ? '飞书 IM 文本推送'
                : '无'}
            </div>
            {task.notifyPlatforms.includes('feishu') && (
              <div className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {`第一期：独立 sender 文本推送，不进入对话 session。通知角色：${task.feishuNotifyAgentRoleKey || '未配置'}；需先私聊 bot 发送 #开启定时#。`}
              </div>
            )}
          </div>
          <div className="col-span-2">
            <div className={labelClass}>{'完成回调 Webhook'}</div>
            <div className={valueClass + ' break-all font-mono text-xs'}>
              {task.completionWebhookUrl?.trim() || '无'}
            </div>
            {task.completionWebhookUrl?.trim() && (
              <div className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'当前只发送文本内容；支持 {{这里面是回调的文字内容}} 占位符，也兼容企业微信机器人 text 回调。'}
              </div>
            )}
          </div>
          <div className="col-span-2">
            <div className={labelClass}>{'技能'}</div>
            <div className={valueClass}>
              {selectedSkills.length > 0
                ? selectedSkills.map((skill) => getSkillDisplayName(skill)).join(', ')
                : '无'}
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{'运行状态'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={labelClass}>{'上次运行'}</div>
            <div className={valueClass}>
              {task.state.lastStatus && (
                <span className={statusColor[task.state.lastStatus] || ''}>
                  {statusLabel}
                </span>
              )}
              {!task.state.lastStatus && '-'}
              {task.state.lastRunAtMs && (
                <span className="ml-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  ({new Date(task.state.lastRunAtMs).toLocaleString()})
                </span>
              )}
            </div>
          </div>
          <div>
            <div className={labelClass}>{'下次运行'}</div>
            <div className={valueClass}>
              {task.state.nextRunAtMs
                ? new Date(task.state.nextRunAtMs).toLocaleString()
                : '-'}
            </div>
          </div>
          {task.state.lastDurationMs !== null && (
            <div>
              <div className={labelClass}>{'上次耗时'}</div>
              <div className={valueClass}>
                {task.state.lastDurationMs < 1000
                  ? `${task.state.lastDurationMs}ms`
                  : `${(task.state.lastDurationMs / 1000).toFixed(1)}s`}
              </div>
            </div>
          )}
          {(task.state.consecutiveErrors ?? 0) > 0 && (
            <div>
              <div className={labelClass}>{'连续错误'}</div>
              <div className="text-sm text-red-500">{task.state.consecutiveErrors}</div>
            </div>
          )}
        </div>
        {task.state.lastError && (
          <div className="mt-3 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
            {task.state.lastError}
          </div>
        )}
      </div>

      {/* Run History */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{'运行历史'}</h3>
        <TaskRunHistory taskId={task.id} runs={runs} />
      </div>
    </div>
  );
};

export default TaskDetail;
