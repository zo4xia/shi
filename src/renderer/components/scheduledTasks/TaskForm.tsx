import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { scheduledTaskService } from '../../services/scheduledTask';
import { skillService } from '../../services/skill';
import { showGlobalToast } from '../../services/toast';
import type { ScheduledTask, Schedule, ScheduledTaskInput, NotifyPlatform } from '../../types/scheduledTask';
import { getSkillDisplayName, type Skill } from '../../types/skill';
// {标记} P0-BUG-FIX: 导入身份配置
import { AGENT_ROLE_LABELS, AGENT_ROLE_ORDER, type AgentRoleKey } from '../../../shared/agentRoleConfig';

interface TaskFormProps {
  mode: 'create' | 'edit';
  task?: ScheduledTask;
  onCancel: () => void;
  onSaved: () => void;
}

type ScheduleMode = 'once' | 'daily' | 'weekly' | 'monthly';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0=Sunday

// Parse existing schedule into UI state
function parseScheduleToUI(schedule: Schedule): {
  mode: ScheduleMode;
  date: string;
  time: string;
  weekday: number;
  monthDay: number;
} {
  const defaults = { mode: 'once' as ScheduleMode, date: '', time: '09:00', weekday: 1, monthDay: 1 };

  if (schedule.type === 'at') {
    const dt = schedule.datetime ?? '';
    // datetime-local format: "YYYY-MM-DDTHH:MM"
    if (dt.includes('T')) {
      return { ...defaults, mode: 'once', date: dt.slice(0, 10), time: dt.slice(11, 16) };
    }
    return { ...defaults, mode: 'once', date: dt.slice(0, 10) };
  }

  if (schedule.type === 'cron' && schedule.expression) {
    const parts = schedule.expression.trim().split(/\s+/);
    if (parts.length >= 5) {
      const [min, hour, dom, , dow] = parts;
      const timeStr = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;

      if (dow !== '*' && dom === '*') {
        // Weekly: M H * * DOW
        return { ...defaults, mode: 'weekly', time: timeStr, weekday: parseInt(dow) || 0 };
      }
      if (dom !== '*' && dow === '*') {
        // Monthly: M H DOM * *
        return { ...defaults, mode: 'monthly', time: timeStr, monthDay: parseInt(dom) || 1 };
      }
      // Daily: M H * * *
      return { ...defaults, mode: 'daily', time: timeStr };
    }
  }

  // Fallback for interval type - treat as daily
  if (schedule.type === 'interval') {
    return { ...defaults, mode: 'daily' };
  }

  return defaults;
}

const TaskForm: React.FC<TaskFormProps> = ({ mode, task, onCancel, onSaved }) => {
  const coworkConfig = useSelector((state: RootState) => state.cowork.config);
  const defaultWorkingDirectory = coworkConfig?.workingDirectory ?? '';

  // Parse existing schedule for edit mode
  const parsed = task ? parseScheduleToUI(task.schedule) : null;

  // Form state
  const [name, setName] = useState(task?.name ?? '');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(parsed?.mode ?? 'once');
  const [scheduleDate, setScheduleDate] = useState(parsed?.date ?? '');
  const [scheduleTime, setScheduleTime] = useState(parsed?.time ?? '09:00');
  const [weekday, setWeekday] = useState(parsed?.weekday ?? 1);
  const [monthDay, setMonthDay] = useState(parsed?.monthDay ?? 1);
  const [prompt, setPrompt] = useState(task?.prompt ?? '');
  const [workingDirectory, setWorkingDirectory] = useState(task?.workingDirectory ?? '');
  const [expiresAt, setExpiresAt] = useState(task?.expiresAt ?? '');
  const [skillIds, setSkillIds] = useState<string[]>(task?.skillIds ?? []);
  const [notifyPlatforms, setNotifyPlatforms] = useState<NotifyPlatform[]>(task?.notifyPlatforms ?? []);
  const [completionWebhookUrl, setCompletionWebhookUrl] = useState(task?.completionWebhookUrl ?? '');
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [hasLoadedSkillCatalog, setHasLoadedSkillCatalog] = useState<boolean>(() => (task?.skillIds?.length ?? 0) > 0);
  const [isLoadingSkillCatalog, setIsLoadingSkillCatalog] = useState(false);
  const [workspacePath, setWorkspacePath] = useState('');
  // {标记} P0-新增：身份选择状态
  const [agentRoleKey, setAgentRoleKey] = useState<AgentRoleKey>(task?.agentRoleKey as AgentRoleKey || 'organizer');
  const [modelId] = useState(task?.modelId || '');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hasLoadedSkillCatalog) {
      return () => {};
    }

    let isActive = true;
    const loadSkills = async () => {
      try {
        // {标记} P1-LAZY-TASKFORM-SKILLS: 定时任务表单只在用户真的需要技能选择时才拉技能目录。
        const loadedSkills = await skillService.loadSkills();
        if (!isActive) return;
        setAvailableSkills(loadedSkills);
        setHasLoadedSkillCatalog(true);
      } finally {
        if (isActive) {
          setIsLoadingSkillCatalog(false);
        }
      }
    };

    void loadSkills();
    const unsubscribe = skillService.onSkillsChanged(() => {
      void loadSkills();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [hasLoadedSkillCatalog]);

  useEffect(() => {
    if (skillIds.length === 0 || hasLoadedSkillCatalog || isLoadingSkillCatalog) {
      return;
    }
    setIsLoadingSkillCatalog(true);
    setHasLoadedSkillCatalog(true);
  }, [hasLoadedSkillCatalog, isLoadingSkillCatalog, skillIds.length]);

  useEffect(() => {
    let isActive = true;
    const loadWorkspacePath = async () => {
      try {
        const result = await window.electron?.workspace?.getPath?.();
        if (!isActive) return;
        if (result?.success && result.path) {
          setWorkspacePath(result.path);
        }
      } catch {
        // ignore
      }
    };

    void loadWorkspacePath();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    setSkillIds((prev) => prev.filter((skillId) => availableSkills.some((skill) => skill.id === skillId)));
  }, [availableSkills]);

  const installedSkills = useMemo(() => availableSkills, [availableSkills]);

  const buildSchedule = (): Schedule => {
    const [hour, min] = scheduleTime.split(':').map(Number);
    switch (scheduleMode) {
      case 'once':
        return { type: 'at', datetime: `${scheduleDate}T${scheduleTime}` };
      case 'daily':
        return { type: 'cron', expression: `${min} ${hour} * * *` };
      case 'weekly':
        return { type: 'cron', expression: `${min} ${hour} * * ${weekday}` };
      case 'monthly':
        return { type: 'cron', expression: `${min} ${hour} ${monthDay} * *` };
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = '请输入任务标题';
    if (!prompt.trim()) newErrors.prompt = '请输入执行提示词';
    if (!(workingDirectory.trim() || defaultWorkingDirectory.trim())) {
      newErrors.workingDirectory = '请选择任务工作目录';
    }
    if (scheduleMode === 'once') {
      if (!scheduleDate || !scheduleTime) {
        newErrors.schedule = '执行时间必须在未来';
      } else if (new Date(`${scheduleDate}T${scheduleTime}`).getTime() <= Date.now()) {
        newErrors.schedule = '执行时间必须在未来';
      }
    }
    if (!scheduleTime) {
      newErrors.schedule = '请选择时间';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const input: ScheduledTaskInput = {
        name: name.trim(),
        description: '',
        schedule: buildSchedule(),
        prompt: prompt.trim(),
        workingDirectory: workingDirectory.trim() || defaultWorkingDirectory,
        systemPrompt: '',
        executionMode: 'local',
        expiresAt: expiresAt || null,
        skillIds,
        notifyPlatforms,
        completionWebhookUrl: completionWebhookUrl.trim() || null,
        enabled: task?.enabled ?? true,
        // {标记} P0-新增：身份绑定字段
        agentRoleKey,
        modelId,
      };
      if (mode === 'create') {
        await scheduledTaskService.createTask(input);
        showGlobalToast('任务已创建');
      } else if (task) {
        await scheduledTaskService.updateTaskById(task.id, input);
        showGlobalToast('任务已更新');
      }
      onSaved();
    } catch (error) {
      showGlobalToast(error instanceof Error
        ? error.message
        : mode === 'create' ? '创建任务失败' : '更新任务失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBrowseDirectory = async () => {
    try {
      const result = await window.electron?.dialog?.selectDirectory();
      if (result?.success && result.path) {
        setWorkingDirectory(result.path);
        return;
      }

      if (result?.error === 'canceled' || result?.error === 'empty') {
        return;
      }

      if (workspacePath) {
        setWorkingDirectory(workspacePath);
        showGlobalToast('浏览目录不可用，已回填当前工作区');
      }
    } catch {
      if (workspacePath) {
        setWorkingDirectory(workspacePath);
        showGlobalToast('浏览目录不可用，已回填当前工作区');
      }
    }
  };

  const handleUseCurrentWorkspace = () => {
    if (!workspacePath) return;
    setWorkingDirectory(workspacePath);
    showGlobalToast('已使用当前工作区');
  };

  const toggleSkillId = (targetSkillId: string) => {
    setSkillIds((prev) => prev.includes(targetSkillId)
      ? prev.filter((skillId) => skillId !== targetSkillId)
      : [...prev, targetSkillId]);
  };

  const handleLoadSkillCatalog = () => {
    if (hasLoadedSkillCatalog || isLoadingSkillCatalog) {
      return;
    }
    setIsLoadingSkillCatalog(true);
    setHasLoadedSkillCatalog(true);
  };

  const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const inputClass = 'w-full rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-white px-3 py-2 text-sm dark:text-claude-darkText text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/50';
  const labelClass = 'block text-sm font-medium dark:text-claude-darkText text-claude-text mb-1';
  const errorClass = 'text-xs text-red-500 mt-1';

  const scheduleModes: ScheduleMode[] = ['once', 'daily', 'weekly', 'monthly'];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
        {mode === 'create' ? '创建任务' : '更新任务'}
      </h2>

      {/* Name */}
      <div>
        <label className={labelClass}>{'标题'}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder={'输入任务标题'}
        />
        {errors.name && <p className={errorClass}>{errors.name}</p>}
      </div>

      {/* Prompt */}
      <div>
        <label className={labelClass}>{'提示词'}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={inputClass + ' h-28 resize-none'}
          placeholder={'输入要执行的提示词...'}
        />
        {errors.prompt && <p className={errorClass}>{errors.prompt}</p>}
      </div>

      {/* {标记} P0-新增：身份选择器 */}
      <div>
        <label className={labelClass}>Agent 身份</label>
        <select
          value={agentRoleKey}
          onChange={(e) => setAgentRoleKey(e.target.value as AgentRoleKey)}
          className={inputClass}
        >
          {AGENT_ROLE_ORDER.map((roleKey: AgentRoleKey) => (
            <option key={roleKey} value={roleKey}>
              {AGENT_ROLE_LABELS[roleKey]}
            </option>
          ))}
        </select>
        <p className="text-xs text-claude-textSecondary mt-1">
          当前 1.0 版本一个定时任务只支持绑定一个 Agent 身份。不同身份有独立的记忆和技能配置；如需多个角色分别执行，请分别创建多个定时任务。
        </p>
      </div>

      {/* Schedule */}
      <div>
        <label className={labelClass}>{'计划'}</label>
        <div className="grid grid-cols-3 gap-2">
          {/* Schedule Mode Dropdown */}
          <select
            value={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.value as ScheduleMode)}
            className={inputClass}
          >
            {scheduleModes.map((m) => {
              const scheduleModeLabels: Record<string, string> = {
                once: '不重复', daily: '每天', weekly: '每周', monthly: '每月',
              };
              return (
              <option key={m} value={m}>
                {scheduleModeLabels[m] || m}
              </option>
              );
            })}
          </select>

          {/* Second column: date/weekday/monthday or time (for daily) */}
          {scheduleMode === 'once' ? (
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              className={inputClass}
              min={new Date().toISOString().slice(0, 10)}
            />
          ) : scheduleMode === 'weekly' ? (
            <select
              value={weekday}
              onChange={(e) => setWeekday(parseInt(e.target.value))}
              className={inputClass}
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {weekdayLabels[d]}
                </option>
              ))}
            </select>
          ) : scheduleMode === 'monthly' ? (
            <select
              value={monthDay}
              onChange={(e) => setMonthDay(parseInt(e.target.value))}
              className={inputClass}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}{'日'}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              className={inputClass}
            />
          )}

          {/* Third column: time picker (or empty for daily) */}
          {scheduleMode === 'daily' ? (
            <div />
          ) : (
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              className={inputClass}
            />
          )}
        </div>
        {errors.schedule && <p className={errorClass}>{errors.schedule}</p>}
      </div>

      {/* Working Directory */}
      <div>
        <label className={labelClass}>{'工作目录'}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            className={inputClass + ' flex-1'}
            placeholder={defaultWorkingDirectory || '输入项目路径'}
          />
          <button
            type="button"
            onClick={handleBrowseDirectory}
            className="px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
          >
            {'浏览'}
          </button>
          {workspacePath && (
            <button
              type="button"
              onClick={handleUseCurrentWorkspace}
              className="px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            >
              {'使用当前工作区'}
            </button>
          )}
        </div>
      </div>
      {errors.workingDirectory && <p className={errorClass}>{errors.workingDirectory}</p>}

      {/* Skills */}
      <div>
        <label className={labelClass}>
          {'技能选择'}
          <span className="text-xs font-normal dark:text-claude-darkTextSecondary text-claude-textSecondary ml-1">
            {'（可选）'}
          </span>
        </label>
        <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mb-2">
          {'可为当前定时任务固定绑定一个或多个已安装技能；未选择时将继续使用全局自动技能路由。'}
        </p>
        {!hasLoadedSkillCatalog ? (
          <div className="rounded-lg border dark:border-claude-darkBorder border-claude-border px-3 py-3 space-y-2">
            <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'技能是可选项，默认不预加载。需要时再手动拉取即可。'}
            </div>
            <button
              type="button"
              onClick={handleLoadSkillCatalog}
              disabled={isLoadingSkillCatalog}
              className="px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-60"
            >
              {isLoadingSkillCatalog ? '加载技能中...' : '加载可用技能'}
            </button>
          </div>
        ) : installedSkills.length === 0 ? (
          <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary rounded-lg border dark:border-claude-darkBorder border-claude-border px-3 py-2">
            {'暂无可用技能，请先安装技能。'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {installedSkills.map((skill) => {
              const selected = skillIds.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  disabled={!skill.enabled}
                  onClick={() => toggleSkillId(skill.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? 'border-claude-accent bg-claude-accent/10 text-claude-accent'
                      : skill.enabled
                        ? 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover'
                        : 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span>{getSkillDisplayName(skill)}</span>
                  {!skill.enabled && (
                    <span className="text-[10px] uppercase tracking-wide">
                      {'未启用'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Expires At */}
      <div>
        <label className={labelClass}>
          {'到期时间'}
          <span className="text-xs font-normal dark:text-claude-darkTextSecondary text-claude-textSecondary ml-1">
            {'（可选）'}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            onClick={(e) => (e.target as HTMLInputElement).showPicker()}
            className={inputClass + ' flex-1'}
            min={new Date().toISOString().slice(0, 10)}
          />
          {expiresAt && (
            <button
              type="button"
              onClick={() => setExpiresAt('')}
              className="px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            >
              {'清除'}
            </button>
          )}
        </div>
      </div>

      {/* Notification */}
      <div>
        <label className={labelClass}>
          {'IM 通知'}
          <span className="text-xs font-normal dark:text-claude-darkTextSecondary text-claude-textSecondary ml-1">
            {'（可选）'}
          </span>
        </label>
        <div className={inputClass + ' min-h-[44px] flex items-center'}>
          <span className="dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'当前未接线。任务完成后不会自动发送 IM 通知。'}
          </span>
        </div>
        <p className="mt-1 text-xs dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70">
          {'已保存的通知平台配置会暂时保留，但当前版本不会实际发送。建议后续改为 webhook 完成回调。'}
        </p>
      </div>

      <div>
        <label className={labelClass}>
          {'完成回调 Webhook'}
          <span className="text-xs font-normal dark:text-claude-darkTextSecondary text-claude-textSecondary ml-1">
            {'（可选，仅文本）'}
          </span>
        </label>
        <input
          type="url"
          value={completionWebhookUrl}
          onChange={(e) => setCompletionWebhookUrl(e.target.value)}
          className={inputClass}
          placeholder={'https://api.day.app/.../{{这里面是回调的文字内容}} 或 企业微信机器人地址'}
        />
        <p className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70">
          {'当前只发文本内容。两种用法：1）URL 中放 {{这里面是回调的文字内容}} 占位符；2）直接填写企业微信机器人 webhook 地址，系统会按 text 消息 POST。旧占位符仍兼容。'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
        >
          {'取消'}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover transition-colors disabled:opacity-50"
        >
          {submitting
            ? '保存中...'
            : mode === 'create'
              ? '创建任务'
              : '更新任务'}
        </button>
      </div>
    </div>
  );
};

export default TaskForm;
