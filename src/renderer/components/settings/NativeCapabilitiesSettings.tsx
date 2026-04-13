import {
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  type AgentRoleKey,
} from '../../../shared/agentRoleConfig';
import {
  NATIVE_CAPABILITY_LABELS,
  NATIVE_CAPABILITY_ORDER,
  type NativeCapabilitiesConfig,
  type NativeCapabilityId,
} from '../../../shared/nativeCapabilities/config';

interface NativeCapabilitiesSettingsProps {
  value: NativeCapabilitiesConfig;
  onChange: (next: NativeCapabilitiesConfig) => void;
}

export default function NativeCapabilitiesSettings({
  value,
  onChange,
}: NativeCapabilitiesSettingsProps) {
  const updateCapability = (
    capabilityId: NativeCapabilityId,
    updater: (entry: NativeCapabilitiesConfig[NativeCapabilityId]) => NativeCapabilitiesConfig[NativeCapabilityId]
  ) => {
    onChange({
      ...value,
      [capabilityId]: updater(value[capabilityId]),
    });
  };

  const updateRole = (capabilityId: NativeCapabilityId, roleKey: AgentRoleKey, checked: boolean) => {
    updateCapability(capabilityId, (entry) => ({
      ...entry,
      roles: {
        ...entry.roles,
        [roleKey]: checked,
      },
    }));
  };

  const updateOfficeDiscovery = (
    capabilityId: NativeCapabilityId,
    updates: {
      binaryPath?: string;
      searchCommonInstallDirs?: boolean;
    }
  ) => {
    updateCapability(capabilityId, (entry) => ({
      ...entry,
      discovery: {
        binaryPath: updates.binaryPath ?? entry.discovery?.binaryPath ?? '',
        searchCommonInstallDirs: updates.searchCommonInstallDirs ?? entry.discovery?.searchCommonInstallDirs ?? true,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border bg-gradient-to-br from-[#f8efe8] via-white to-[#f6f8fb] dark:from-claude-darkSurface dark:via-claude-darkSurface/90 dark:to-claude-darkSurface/70">
        <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
          {'原生外挂能力'}
        </div>
        <div className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {'先看最必要的开关；角色、优先级、路径这类内容收进高级设置，尽量减少第一次使用时的压力。'}
        </div>
      </div>

      <div className="space-y-4">
        {NATIVE_CAPABILITY_ORDER.map((capabilityId) => {
          const entry = value[capabilityId];
          const meta = NATIVE_CAPABILITY_LABELS[capabilityId];
          const hasAdvancedConfig = capabilityId === 'office-native-addon' || AGENT_ROLE_ORDER.length > 0;
          return (
            <div
              key={capabilityId}
              className="rounded-2xl border px-4 py-4 dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/40 bg-white/80"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                      {meta.title}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        entry.enabled
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {entry.enabled ? '已开启' : '未开启'}
                    </span>
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                      {`优先级 ${entry.priority}`}
                    </span>
                  </div>
                  <div className="text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {meta.description}
                  </div>
                  <div className="text-[11px] font-mono dark:text-claude-darkTextSecondary/80 text-claude-textSecondary/80">
                    {capabilityId}
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(event) => updateCapability(capabilityId, (current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))}
                    className="h-4 w-4 rounded border-claude-border dark:border-claude-darkBorder text-claude-accent focus:ring-claude-accent/40"
                  />
                  {'启用外挂'}
                </label>
              </div>

              {hasAdvancedConfig && (
                <details className="mt-4 rounded-2xl border border-dashed dark:border-claude-darkBorder border-claude-border/80 bg-claude-surface/40 dark:bg-claude-darkSurface/30">
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium dark:text-claude-darkText text-claude-text">
                          {'高级设置'}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                          {'角色、优先级、路径这类内容放这里，需要时再展开。'}
                        </div>
                      </div>
                      <span className="rounded-full bg-claude-accent/10 px-2 py-0.5 text-[11px] font-medium text-claude-accent">
                        {'展开'}
                      </span>
                    </div>
                  </summary>

                  <div className="border-t dark:border-claude-darkBorder border-claude-border/70 px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                      <div>
                        <label className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1">
                          {'优先级'}
                        </label>
                        <input
                          type="number"
                          min={-999}
                          max={999}
                          value={entry.priority}
                          onChange={(event) => updateCapability(capabilityId, (current) => ({
                            ...current,
                            priority: Number.isFinite(Number(event.target.value))
                              ? Number(event.target.value)
                              : current.priority,
                          }))}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                        />
                        <p className="mt-1 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                          {'值越大越先尝试。'}
                        </p>
                      </div>

                      <div>
                        <div className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-2">
                          {'按角色启用'}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {AGENT_ROLE_ORDER.map((roleKey) => (
                            <label
                              key={`${capabilityId}-${roleKey}`}
                              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary"
                            >
                              <input
                                type="checkbox"
                                checked={entry.roles[roleKey]}
                                onChange={(event) => updateRole(capabilityId, roleKey, event.target.checked)}
                                className="h-4 w-4 rounded border-claude-border dark:border-claude-darkBorder text-claude-accent focus:ring-claude-accent/40"
                              />
                              {AGENT_ROLE_LABELS[roleKey]}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {capabilityId === 'office-native-addon' && (
                      // 配置面板布局规则：
                      // 先判断字段是否能在一行内解决；若当前块空白占比过高，不继续堆竖排，
                      // 优先改成并列、递进、折叠或弹层等更收敛的形式。
                      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
                        <div>
                          <label className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1">
                            {'Office 可执行文件路径'}
                          </label>
                          <input
                            type="text"
                            value={entry.discovery?.binaryPath ?? ''}
                            onChange={(event) => updateOfficeDiscovery(capabilityId, {
                              binaryPath: event.target.value,
                            })}
                            placeholder={'留空则只做安全探测，不自动安装'}
                            className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                          />
                          <p className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                            {'建议指向你自己手动放置的 officecli 二进制。这里不会帮你安装，也不会改 PATH。'}
                          </p>
                        </div>

                        <div>
                          <div className="block text-xs font-medium dark:text-claude-darkText text-claude-text mb-2">
                            {'发现策略'}
                          </div>
                          <label
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary"
                          >
                            <input
                              type="checkbox"
                              checked={entry.discovery?.searchCommonInstallDirs ?? true}
                              onChange={(event) => updateOfficeDiscovery(capabilityId, {
                                searchCommonInstallDirs: event.target.checked,
                              })}
                              className="h-4 w-4 rounded border-claude-border dark:border-claude-darkBorder text-claude-accent focus:ring-claude-accent/40"
                            />
                            {'允许只读探测常见安装目录'}
                          </label>
                          <p className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                            {'只做存在性检查，不写入系统目录，不向其他 agent 家目录投放 skill。'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
