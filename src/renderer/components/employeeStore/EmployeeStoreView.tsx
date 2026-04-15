import {
  ArrowsPointingOutIcon,
  CircleStackIcon,
  BookOpenIcon,
  ShoppingBagIcon,
  SparklesIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import React, { useMemo, useState } from 'react';
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  type AgentRoleConfigEntry,
  type AgentRoleKey,
  resolveAgentRolesFromConfig,
} from '../../../shared/agentRoleConfig';
import { RESPONSIVE_CONTENT_WRAP_CLASS } from '../../../shared/mobileUi';
import { configService } from '../../services/config';
import PageHeaderShell from '../ui/PageHeaderShell';
import ThemedSelect from '../ui/ThemedSelect';

interface EmployeeStoreViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '未设置';
  }
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-2)}`;
}

function summarizeProvider(role: AgentRoleConfigEntry): string {
  if (!role.apiUrl.trim()) {
    return '未配置';
  }
  return '已配置线路';
}

const SERVICE_ROUTE_META: Record<'novel' | 'drama', {
  label: string;
  outputMode: string;
  knowledgeSource: string;
  routeHint: string;
  nextStep: string;
}> = {
  novel: {
    label: '小说',
    outputMode: '小说单页输出',
    knowledgeSource: 'v0-novel 影子包',
    routeHint: '用户先选“小说”，页面先完成第一层大类分流，后面 skill 只处理写作问答与产出。',
    nextStep: '适合挂写作辅助、章节生成、润色修订、长文问答入口。',
  },
  drama: {
    label: '短剧',
    outputMode: '短剧单页输出',
    knowledgeSource: 'v0-drama 影子包',
    routeHint: '用户先选“短剧”，页面先完成第一层大类分流，后面 skill 只处理改编、分镜、交付草案。',
    nextStep: '适合挂梗概改编、短剧拆分镜、短视频脚本与交付草案入口。',
  },
};

const EmployeeStoreView: React.FC<EmployeeStoreViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const appConfig = configService.getConfig();
  const roleMap = useMemo(() => resolveAgentRolesFromConfig(appConfig), [appConfig]);
  const selectableRoles = useMemo(
    () => AGENT_ROLE_ORDER.filter((roleKey) => roleMap[roleKey].enabled || roleMap[roleKey].apiUrl || roleMap[roleKey].modelId),
    [roleMap],
  );
  const roleOptions = useMemo(
    () => (selectableRoles.length > 0 ? selectableRoles : AGENT_ROLE_ORDER).map((roleKey) => ({
      value: roleKey,
      label: roleMap[roleKey].label || AGENT_ROLE_LABELS[roleKey],
    })),
    [roleMap, selectableRoles],
  );
  const [selectedRoleKey, setSelectedRoleKey] = useState<AgentRoleKey>(roleOptions[0]?.value as AgentRoleKey || 'writer');
  const [selectedServiceType, setSelectedServiceType] = useState<'novel' | 'drama'>('novel');
  const selectedRole = roleMap[selectedRoleKey];
  const selectedServiceMeta = SERVICE_ROUTE_META[selectedServiceType];

  return (
    <div className="flex h-full flex-col bg-claude-bg dark:bg-claude-darkBg">
      <PageHeaderShell
        title={'Agent 商店'}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
        headerClassName="draggable flex h-12 items-center justify-between border-b border-claude-border/60 bg-gradient-pearl-header px-3 backdrop-blur-xl dark:border-claude-darkBorder/70 sm:px-4"
      />

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className={RESPONSIVE_CONTENT_WRAP_CLASS}>
          <div className="mx-auto max-w-6xl space-y-5">
            <section className="rounded-[28px] border border-black/5 bg-white/62 px-5 py-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {'SERVICE COUNTER V0'}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#f5eee5] to-[#f8f4ef] text-amber-600 shadow-sm dark:from-white/[0.08] dark:to-white/[0.03] dark:text-amber-300">
                  <ShoppingBagIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-[0.01em] text-claude-text dark:text-claude-darkText">
                    {'商店服务台'}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    {'先把商店页从家里的现役链里拎成独立壳。左边只做角色 API 选择，右边留给后续 iframe / v0 服务包。'}
                  </p>
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-[30px] border border-black/5 bg-gradient-to-br from-white/68 via-white/58 to-[#f8f3ec]/78 shadow-sm dark:border-white/10 dark:from-white/[0.04] dark:via-white/[0.03] dark:to-white/[0.02]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.10),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.08),transparent_22%)]" />

              <div className="relative grid min-h-[560px] gap-0 lg:grid-cols-[minmax(300px,30%)_minmax(0,70%)]">
                <aside className="border-b border-black/5 px-5 py-5 dark:border-white/10 lg:border-b-0 lg:border-r">
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-claude-text dark:text-claude-darkText">
                        <SparklesIcon className="h-4 w-4" />
                        {'服务员借用哪个角色'}
                      </div>
                      <p className="mt-1 text-xs leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        {'这里只借角色的 API 配置和风格投影，不直接触碰家里小 agent 的真实记忆、本体和技能源文件。'}
                      </p>
                    </div>

                    <div className="rounded-[24px] border border-black/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <ThemedSelect
                        id="employee-store-role-select"
                        value={selectedRoleKey}
                        onChange={(value) => setSelectedRoleKey(value as AgentRoleKey)}
                        options={roleOptions}
                        label="角色"
                      />
                    </div>

                    <div className="rounded-[24px] border border-black/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="text-sm font-semibold text-claude-text dark:text-claude-darkText">
                        {'基础服务选项'}
                      </div>
                      <div className="mt-3 grid gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedServiceType('novel')}
                          className={`flex items-start gap-3 rounded-[20px] border px-4 py-3 text-left transition ${
                            selectedServiceType === 'novel'
                              ? 'border-amber-400/45 bg-amber-500/10 text-amber-900 dark:border-amber-300/35 dark:bg-amber-400/10 dark:text-amber-100'
                              : 'border-black/5 bg-white/55 text-claude-text hover:bg-white/70 dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkText dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <BookOpenIcon className="mt-0.5 h-5 w-5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{'1. 小说'}</span>
                            <span className="mt-1 block text-xs leading-6 text-current/80">
                              {'偏长文问答、写作辅助、章节生成与修订方向。'}
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedServiceType('drama')}
                          className={`flex items-start gap-3 rounded-[20px] border px-4 py-3 text-left transition ${
                            selectedServiceType === 'drama'
                              ? 'border-amber-400/45 bg-amber-500/10 text-amber-900 dark:border-amber-300/35 dark:bg-amber-400/10 dark:text-amber-100'
                              : 'border-black/5 bg-white/55 text-claude-text hover:bg-white/70 dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkText dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <VideoCameraIcon className="mt-0.5 h-5 w-5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{'2. 短剧'}</span>
                            <span className="mt-1 block text-xs leading-6 text-current/80">
                              {'偏短剧梗概、改编、分镜拆解与交付草案方向。'}
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-dashed border-[#c9b8a5]/35 bg-[#fbf6f0]/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="text-sm font-semibold text-claude-text dark:text-claude-darkText">
                        {'系统路由'}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        {selectedServiceMeta.routeHint}
                      </div>
                      <div className="mt-3 rounded-[18px] border border-black/5 bg-white/65 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="text-[11px] tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                          {'下一跳'}
                        </div>
                        <div className="mt-1 text-sm font-medium text-claude-text dark:text-claude-darkText">
                          {selectedServiceMeta.nextStep}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-[22px] border border-black/5 bg-white/56 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="text-[11px] font-medium tracking-[0.14em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                          {'当前接线'}
                        </div>
                        <div className="mt-2 text-base font-semibold text-claude-text dark:text-claude-darkText">
                          {selectedRole.label}
                        </div>
                        <div className="mt-1 text-xs leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                          {selectedRole.description}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <div className="rounded-[22px] border border-black/5 bg-white/56 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            <CircleStackIcon className="h-4 w-4" />
                            {'API 来源'}
                          </div>
                          <div className="mt-2 text-sm font-medium text-claude-text dark:text-claude-darkText">
                            {summarizeProvider(selectedRole)}
                          </div>
                          <div className="mt-1 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {selectedRole.apiFormat === 'anthropic' ? 'Anthropic 协议（来源隐藏）' : 'OpenAI 兼容协议（来源隐藏）'}
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-black/5 bg-white/56 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="text-[11px] font-medium tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {'模型'}
                          </div>
                          <div className="mt-2 text-sm font-medium text-claude-text dark:text-claude-darkText">
                            {selectedRole.modelId || '未设置'}
                          </div>
                          <div className="mt-1 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {selectedRole.supportsImage ? '支持图片理解' : '纯文本主链'}
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-black/5 bg-white/56 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="text-[11px] font-medium tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {'密钥状态'}
                          </div>
                          <div className="mt-2 text-sm font-medium text-claude-text dark:text-claude-darkText">
                            {maskSecret(selectedRole.apiKey)}
                          </div>
                          <div className="mt-1 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {'前台只看状态，不显示完整 key。'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-dashed border-amber-400/35 bg-amber-500/8 px-4 py-4 dark:bg-amber-500/10">
                      <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        {'当前边界'}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs leading-6 text-amber-900/80 dark:text-amber-100/85">
                        <li>{'只借 API 配置，不借真实角色身份。'}</li>
                        <li>{'后续只接 v0 服务包，不直接读家里的完整 SKILLs。'}</li>
                        <li>{'右侧窗口可以接 iframe / 外部服务页 / 轻问答投影。'}</li>
                      </ul>
                    </div>
                  </div>
                </aside>

                <main className="flex min-h-[420px] flex-col p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-claude-text dark:text-claude-darkText">
                        {'服务窗口'}
                      </div>
                      <div className="mt-1 text-xs leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        {'这里先挖空，后面可以挂 iframe、公开问答页、或 v0 服务包的单页入口。'}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/55 px-3 py-1.5 text-[11px] font-medium tracking-[0.1em] text-claude-textSecondary dark:border-white/10 dark:bg-white/[0.04] dark:text-claude-darkTextSecondary">
                      <ArrowsPointingOutIcon className="h-4 w-4" />
                      {'70% 预留区'}
                    </div>
                  </div>

                  <div className="mt-5 flex-1 rounded-[28px] border border-dashed border-black/10 bg-white/45 p-5 dark:border-white/12 dark:bg-black/10">
                    <div className="grid h-full min-h-[320px] gap-4 lg:grid-rows-[auto_1fr_auto]">
                      <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[20px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="text-[11px] tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                          {'服务模式'}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-claude-text dark:text-claude-darkText">
                          {selectedServiceMeta.outputMode}
                        </div>
                      </div>
                        <div className="rounded-[20px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="text-[11px] tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {'技能来源'}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-claude-text dark:text-claude-darkText">
                            {selectedServiceMeta.knowledgeSource}
                          </div>
                        </div>
                        <div className="rounded-[20px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="text-[11px] tracking-[0.12em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {'返回策略'}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-claude-text dark:text-claude-darkText">
                            {'只回最终结果'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center rounded-[24px] border border-dashed border-[#c9b8a5]/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(248,243,236,0.42))] px-6 py-8 text-center dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))]">
                        <div className="max-w-lg">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#f6efe6] to-[#f1e7da] text-amber-600 shadow-sm dark:from-white/[0.08] dark:to-white/[0.03] dark:text-amber-300">
                            <SparklesIcon className="h-7 w-7" />
                          </div>
                          <div className="mt-4 text-lg font-semibold tracking-[0.01em] text-claude-text dark:text-claude-darkText">
                            {`${selectedServiceMeta.label}服务窗口`}
                          </div>
                          <p className="mt-2 text-sm leading-7 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {`${selectedServiceMeta.routeHint} 现在先把窗口挖出来，后面接 iframe 或 v0 服务页时，不需要再让 skill 自己承担第一跳分流。`}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-black/5 bg-white/55 px-4 py-3 text-xs leading-6 text-claude-textSecondary dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkTextSecondary">
                        {`当前预选角色：${selectedRole.label}；基础服务：${selectedServiceMeta.label}。第一层路由已经由页面接管，后续这里可以挂“开始对话 / 打开 iframe / 进入服务页”按钮，但不会直连 ${selectedRole.key} 的真实记忆与附件家。`}
                      </div>
                    </div>
                  </div>
                </main>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeStoreView;
