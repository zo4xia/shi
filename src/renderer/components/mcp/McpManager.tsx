// {路标} FLOW-PAGE-MCP
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import SearchIcon from '../icons/SearchIcon';
import TrashIcon from '../icons/TrashIcon';
import PencilIcon from '../icons/PencilIcon';
import ConnectorIcon from '../icons/ConnectorIcon';
import { mcpService } from '../../services/mcp';
import { setMcpServers } from '../../store/slices/mcpSlice';
import { RootState } from '../../store';
import { McpServerConfig, McpServerFormData, McpRegistryEntry } from '../../types/mcp';
import { mcpRegistry, mcpCategories } from '../../data/mcpRegistry';
import { AGENT_ROLE_ORDER, AGENT_ROLE_SHORT_LABELS } from '../../../shared/agentRoleConfig';
import ErrorMessage from '../ErrorMessage';
import Tooltip from '../ui/Tooltip';
import McpServerFormModal from './McpServerFormModal';
import ConfirmDialog from '../ui/ConfirmDialog';
import RolePickerDialog from '../ui/RolePickerDialog';
import { getResponsiveTabBarClass, getResponsiveTabButtonClass } from '../../../shared/mobileUi';
import { RUNTIME_FLOW_TAGS } from '../../../shared/runtimeFlowTags';
import { webSocketClient, WS_EVENTS } from '../../services/webSocketClient';
import { skillService } from '../../services/skill';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import { useIsMediumViewport } from '../../hooks/useIsMediumViewport';

const mcpDescMap: Record<string, string> = {
  mcpDesc_tavily: '实时网页搜索、智能数据提取和网站爬取',
  mcpDesc_github: 'GitHub 平台集成：仓库、Issues、PR、Actions 管理',
  mcpDesc_gitlab: 'GitLab API 集成：项目管理、合并请求、流水线',
  mcpDesc_context7: '为 AI 编程提供最新的库文档和代码示例',
  mcpDesc_google_drive: 'Google Drive 文件访问和搜索，自动导出 Workspace 文件',
  mcpDesc_gmail: 'Gmail 邮件管理：读取、发送、搜索邮件，支持自动认证',
  mcpDesc_google_calendar: 'Google Calendar 日程管理：创建、查询、更新日历事件',
  mcpDesc_notion: 'Notion API：搜索、创建/更新页面、管理数据库',
  mcpDesc_slack: 'Slack 工作区：频道管理、消息发送、用户查询',
  mcpDesc_todoist: '任务管理：创建、更新、完成和组织待办事项',
  mcpDesc_playwright: '高级浏览器自动化，支持 Chromium/Firefox/WebKit',
  mcpDesc_canva: 'Canva 设计平台：创建和管理设计、模板操作',
  mcpDesc_firecrawl: '网页抓取与数据提取：支持批处理、结构化提取和内容分析',
  mcpDesc_fetch: '网页内容抓取和 HTML 转 Markdown，适合 LLM 消费',
};

const TRANSPORT_BADGE_COLORS: Record<string, string> = {
  stdio: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  sse: 'bg-green-500/10 text-green-600 dark:text-green-400',
  http: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const formatMcpScopeLabel = (scope: string): string => {
  if (scope === 'all') {
    return '全部角色';
  }
  return AGENT_ROLE_SHORT_LABELS[scope as keyof typeof AGENT_ROLE_SHORT_LABELS] || '当前角色';
};

type McpTab = 'supported' | 'templates';

const McpManager: React.FC = () => {
  const isMobileViewport = useIsMobileViewport();
  const isMediumViewport = useIsMediumViewport();
  const shouldHideHeaderSearch = isMobileViewport || isMediumViewport;
  const dispatch = useDispatch();
  const servers = useSelector((state: RootState) => state.mcp.servers);

  const [activeTab, setActiveTab] = useState<McpTab>('supported');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<McpServerConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [installingRegistry, setInstallingRegistry] = useState<McpRegistryEntry | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [dynamicRegistry] = useState<McpRegistryEntry[]>(mcpRegistry);
  const [dynamicCategories] = useState<ReadonlyArray<{ id: string; key: string; name_zh?: string; name_en?: string }>>(mcpCategories);
  const [installRolePicker, setInstallRolePicker] = useState<McpRegistryEntry | null>(null);
  const [installRoleSelection, setInstallRoleSelection] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<typeof AGENT_ROLE_ORDER[number]>(AGENT_ROLE_ORDER[0]);
  const [runtimeMcpTools, setRuntimeMcpTools] = useState<Array<{ id: string; name: string; transportType: string; scope: string }>>([]);
  const [runtimeWarnings, setRuntimeWarnings] = useState<string[]>([]);
  const [showGuideNote, setShowGuideNote] = useState(false);
  const [showRuntimeNote, setShowRuntimeNote] = useState(false);

  useEffect(() => {
    let isActive = true;
    const loadServers = async () => {
      const loaded = await mcpService.loadServers();
      if (!isActive) return;
      dispatch(setMcpServers(loaded));
    };
    const loadRoleRuntime = async () => {
      const payload = await skillService.getRoleRuntime(selectedRole);
      if (!isActive) return;
      setRuntimeMcpTools(payload?.capabilitySnapshot?.runtimeMcpTools ?? []);
      setRuntimeWarnings(payload?.capabilitySnapshot?.warnings ?? []);
    };
    void loadServers();
    void loadRoleRuntime();
    const unsubscribe = webSocketClient.on(WS_EVENTS.MCP_CHANGED, () => {
      void loadServers();
      void loadRoleRuntime();
    });
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [dispatch, selectedRole]);

  const roleScopedActiveServers = useMemo(() => {
    return servers.filter((server) => (
      server.enabled
      && server.registryId !== 'memory'
      && (server.agentRoleKey === 'all' || server.agentRoleKey === selectedRole)
    ));
  }, [selectedRole, servers]);

  const getRegistryEntryDescription = (entry: McpRegistryEntry): string => {
    const remoteDescription = entry.description_zh;
    if (remoteDescription) return remoteDescription;
    if (entry.descriptionKey) return mcpDescMap[entry.descriptionKey] || '';
    return '';
  };

  const getCategoryLabel = (categoryId?: string): string => {
    if (!categoryId) {
      return '工具';
    }
    const category = dynamicCategories.find((entry) => entry.id === categoryId);
    return category?.name_zh || category?.key || '工具';
  };

  const getRegistryEntryForServer = (server: McpServerConfig): McpRegistryEntry | undefined => {
    if (server.registryId) {
      return dynamicRegistry.find(entry => entry.id === server.registryId);
    }
    if (!server.isBuiltIn) return undefined;
    return dynamicRegistry.find((entry) => (
      entry.name.toLowerCase() === server.name.toLowerCase()
      && entry.transportType === server.transportType
      && entry.command === server.command
    ));
  };

  const getInstalledDescription = (server: McpServerConfig): string => {
    const persistedDescription = server.description?.trim();
    if (persistedDescription) return persistedDescription;
    const registryEntry = getRegistryEntryForServer(server);
    if (registryEntry) {
      const registryDescription = getRegistryEntryDescription(registryEntry).trim();
      if (registryDescription) return registryDescription;
    }
    return '已接入当前系统的外部能力。';
  };

  const runtimeVisibleServerIds = useMemo(() => {
    return new Set(runtimeMcpTools.map((tool) => tool.id));
  }, [runtimeMcpTools]);

  const runtimeSupportedServers = useMemo(() => {
    return roleScopedActiveServers.filter((server) => runtimeVisibleServerIds.has(server.id));
  }, [roleScopedActiveServers, runtimeVisibleServerIds]);

  const hiddenServerCount = useMemo(() => {
    return roleScopedActiveServers.length - runtimeSupportedServers.length;
  }, [roleScopedActiveServers.length, runtimeSupportedServers.length]);

  const supportedRegistryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const server of runtimeSupportedServers) {
      if (server.registryId) {
        ids.add(server.registryId);
        continue;
      }
      const registryEntry = getRegistryEntryForServer(server);
      if (registryEntry) {
        ids.add(registryEntry.id);
      }
    }
    return ids;
  }, [runtimeSupportedServers, dynamicRegistry]);

  const filteredMarketplace = useMemo(() => {
    const query = searchQuery.toLowerCase();
    let entries = dynamicRegistry.filter((entry) => entry.id !== 'memory');
    if (query) {
      entries = entries.filter(e =>
        e.name.toLowerCase().includes(query)
        || getRegistryEntryDescription(e).toLowerCase().includes(query)
      );
    }
    if (activeCategory !== 'all') {
      entries = entries.filter(e => e.category === activeCategory);
    }
    entries = entries.filter((entry) => !supportedRegistryIds.has(entry.id));
    return entries;
  }, [searchQuery, activeCategory, dynamicRegistry, supportedRegistryIds]);

  const filteredInstalled = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return runtimeSupportedServers;
    return runtimeSupportedServers.filter(server =>
      server.name.toLowerCase().includes(query)
      || getInstalledDescription(server).toLowerCase().includes(query)
    );
  }, [runtimeSupportedServers, searchQuery, dynamicRegistry]);

  const handleToggleEnabled = async (serverId: string) => {
    const targetServer = servers.find(s => s.id === serverId);
    if (!targetServer) return;
    try {
      const updatedServers = await mcpService.setServerEnabled(serverId, !targetServer.enabled);
      dispatch(setMcpServers(updatedServers));
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '更新 MCP 服务失败');
    }
  };

  const handleRequestDelete = (server: McpServerConfig) => {
    setActionError('');
    setPendingDelete(server);
  };

  const handleCancelDelete = () => {
    if (isDeleting) return;
    setPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setActionError('');
    const result = await mcpService.deleteServer(pendingDelete.id);
    if (!result.success) {
      setActionError(result.error || '删除 MCP 服务失败');
      setIsDeleting(false);
      return;
    }
    if (result.servers) {
      dispatch(setMcpServers(result.servers));
    }
    setIsDeleting(false);
    setPendingDelete(null);
  };

  const handleOpenEditForm = (server: McpServerConfig) => {
    setEditingServer(server);
    setInstallingRegistry(null);
    setIsFormOpen(true);
  };

  const handleInstallFromRegistry = (entry: McpRegistryEntry) => {
    setInstallRolePicker(entry);
    setInstallRoleSelection('all');
  };

  const handleConfirmRoleAndOpenForm = () => {
    if (!installRolePicker) return;
    setEditingServer(null);
    setInstallingRegistry(installRolePicker);
    setIsFormOpen(true);
    setInstallRolePicker(null);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingServer(null);
    setInstallingRegistry(null);
  };

  const handleSaveForm = async (data: McpServerFormData) => {
    setActionError('');
    if (editingServer && editingServer.id) {
      const result = await mcpService.updateServer(editingServer.id, data);
      if (!result.success) {
        setActionError(result.error || '更新 MCP 服务失败');
        return;
      }
      if (result.servers) {
        dispatch(setMcpServers(result.servers));
      }
    } else {
      const createData = { ...data, agentRoleKey: installRoleSelection };
      const result = await mcpService.createServer(createData);
      if (!result.success) {
        setActionError(result.error || '创建 MCP 服务失败');
        return;
      }
      if (result.servers) {
        dispatch(setMcpServers(result.servers));
      }
    }
    handleCloseForm();
  };

  const existingNames = useMemo(() => servers.map(s => s.name), [servers]);

  const marketplaceCount = useMemo(
    () => dynamicRegistry.filter((entry) => (
      entry.id !== 'memory' && !supportedRegistryIds.has(entry.id)
    )).length,
    [dynamicRegistry, supportedRegistryIds]
  );

  const tabClass = (tab: McpTab) => getResponsiveTabButtonClass(
    activeTab === tab
      ? 'dark:text-claude-darkText text-claude-text'
      : 'dark:text-claude-darkTextSecondary text-claude-textSecondary hover:dark:text-claude-darkText hover:text-claude-text'
  );

  const tabIndicatorClass = (tab: McpTab) =>
    `absolute bottom-0 left-0 right-0 h-0.5 rounded-full transition-colors ${
      activeTab === tab ? 'bg-claude-accent' : 'bg-transparent'
    }`;

  return (
    <div className="space-y-6">
      <section
        aria-label="工具条"
        className="space-y-4 rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/30 px-4 py-4"
      >
        {/* Description */}
        <p className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {'把外部工具接给当前角色。首屏只看用途和归属，细节点进去再看。'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGuideNote((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 dark:border-sky-800/70 bg-sky-50/90 dark:bg-sky-950/20 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-200 transition-colors"
          >
            <InformationCircleIcon className="h-3.5 w-3.5" />
            {'说明'}
          </button>
          <button
            type="button"
            onClick={() => setShowRuntimeNote((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/90 dark:bg-emerald-950/20 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-200 transition-colors"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {`当前接入 ${AGENT_ROLE_SHORT_LABELS[selectedRole]} · ${runtimeMcpTools.length}`}
          </button>
        </div>

        {showGuideNote && (
          <div className="rounded-2xl border border-sky-200/80 dark:border-sky-800/70 bg-sky-50/90 dark:bg-sky-950/20 px-4 py-3 space-y-1.5">
            <p className="text-sm leading-6 text-sky-700 dark:text-sky-200">
              {'这里展示的是 MCP 工具链，不是 Skill 文件夹。真正已经能用的放在“当前支持”；还没装或还要填 key 的放在“可接入”。一期先隐藏自定义入口，避免把未收口能力提前暴露。旧 Memory 兼容记录不再算 MCP 可接入项。'}
            </p>
            <div className="space-y-1 text-xs leading-5 text-sky-600 dark:text-sky-300/90">
              <div>{'这里优先看“当前角色现在能不能用”，而不是先看技术配置长相。'}</div>
              <div>{'已经接入的能力会按角色过滤展示；没到当前角色的，不会冒充成可用。'}</div>
              <div>{'记忆相关能力会继续回写系统记忆链，不需要用户理解底层存放路径。'}</div>
            </div>
          </div>
        )}

        {showRuntimeNote && (
          <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/90 dark:bg-emerald-950/20 px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {AGENT_ROLE_ORDER.map((roleKey) => (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => setSelectedRole(roleKey)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedRole === roleKey
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/70 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                  }`}
                >
                  {AGENT_ROLE_SHORT_LABELS[roleKey]}
                </button>
              ))}
            </div>
            <div className="text-xs leading-5 text-emerald-700/90 dark:text-emerald-200/90">
              {`当前角色 ${AGENT_ROLE_SHORT_LABELS[selectedRole]} 现在会带上 ${runtimeMcpTools.length} 个 MCP 工具。`}
            </div>
            {hiddenServerCount > 0 && (
              <div className="text-[11px] leading-5 text-emerald-700/80 dark:text-emerald-200/80">
                {`另有 ${hiddenServerCount} 条配置暂时还没对当前角色生效，已先收起。`}
              </div>
            )}
            {runtimeMcpTools.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {runtimeMcpTools.map((tool) => (
                  <span
                    key={`${selectedRole}:${tool.id}`}
                    className="rounded-full bg-white/80 dark:bg-emerald-900/30 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-200"
                  >
                    {`${tool.name} · ${formatMcpScopeLabel(tool.scope)}`}
                  </span>
                ))}
              </div>
            )}
            {runtimeWarnings.length > 0 && (
              <div className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                {runtimeWarnings[0]}
              </div>
            )}
          </div>
        )}

        {actionError && (
          <ErrorMessage
            message={actionError}
            onClose={() => setActionError('')}
          />
        )}

        {!shouldHideHeaderSearch && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
              <input
                type="text"
                placeholder={'搜索 MCP 服务'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className={getResponsiveTabBarClass('dark:border-claude-darkBorder border-claude-border')}>
          <button type="button" onClick={() => setActiveTab('supported')} className={tabClass('supported')}>
            {'当前支持'}
            {runtimeSupportedServers.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover">
                {runtimeSupportedServers.length}
              </span>
            )}
            <div className={tabIndicatorClass('supported')} />
          </button>
          <button type="button" onClick={() => setActiveTab('templates')} className={tabClass('templates')}>
            {'可接入'}
            {marketplaceCount > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover">
                {marketplaceCount}
              </span>
            )}
            <div className={tabIndicatorClass('templates')} />
          </button>
        </div>
      </section>

      <section
        aria-label="已装区"
        className="space-y-4 rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/30 px-4 py-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
              {'当前已装'}
            </p>
            <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
              {'展示当前角色已激活的 MCP 服务，点击卡片可查看详情或编辑。'}
            </p>
          </div>
          <span className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
            {`${runtimeSupportedServers.length} 个配置`}
          </span>
        </div>
        {activeTab === 'supported' ? (
          <div className="grid grid-cols-2 gap-4">
            {filteredInstalled.length === 0 ? (
              <div className="col-span-2 text-center py-12 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'当前角色还没有可用的 MCP 支持'}
              </div>
            ) : (
              filteredInstalled.map((server) => {
                const registryEntry = getRegistryEntryForServer(server);
                const installedDescription = getInstalledDescription(server);
                return (
                  <div
                    key={server.id}
                    className="rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/50 bg-claude-surface/50 p-3 transition-colors hover:border-claude-accent/50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg dark:bg-claude-darkSurface bg-claude-surface flex items-center justify-center flex-shrink-0">
                          <ConnectorIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                        </div>
                        <span className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">
                          {server.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditForm(server)}
                          className="p-1 rounded-lg text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent dark:hover:text-claude-accent transition-colors"
                          title={'编辑 MCP 服务'}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRequestDelete(server)}
                          className="p-1 rounded-lg text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title={'删除 MCP 服务'}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                        <div
                          className={`w-9 h-5 rounded-full flex items-center transition-colors cursor-pointer flex-shrink-0 ${
                            server.enabled ? 'bg-claude-accent' : 'dark:bg-claude-darkBorder bg-claude-border'
                          }`}
                          onClick={() => handleToggleEnabled(server.id)}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full bg-white shadow-md transform transition-transform ${
                              server.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    <Tooltip
                      content={installedDescription}
                      position="bottom"
                      maxWidth="360px"
                      className="block w-full"
                    >
                      <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary line-clamp-2 mb-2">
                        {installedDescription}
                      </p>
                    </Tooltip>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300 font-medium">
                        {getCategoryLabel(registryEntry?.category)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                        {server.agentRoleKey === 'all'
                          ? '全部角色'
                          : (AGENT_ROLE_SHORT_LABELS[server.agentRoleKey] || server.agentRoleKey || '当前角色')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        runtimeVisibleServerIds.has(server.id)
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}>
                        {runtimeVisibleServerIds.has(server.id) ? '当前可用' : '暂未生效'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'请切换到“当前支持”选项卡查看已装 MCP 服务。'}
          </div>
        )}
      </section>

      <section
        aria-label="市场区"
        className="space-y-4 rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/30 px-4 py-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
              {'市场区'}
            </p>
            <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
              {'展示尚未在当前角色可用的可接入能力，需额外安装或绑定。'}
            </p>
          </div>
          <span className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
            {`${marketplaceCount} 个条目`}
          </span>
        </div>
        {activeTab === 'templates' ? (
          <div>
            <div className="mb-4 rounded-xl border border-sky-200/70 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              {'这里显示的是尚未在当前角色真实可用的可接入能力。它们说明“这条接入链支持”，但很多在真正可用前还需要安装、绑定角色，或补环境变量 / API Key。'}
            </div>

            {/* Category filter pills */}
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              {dynamicCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-claude-accent text-white'
                      : 'dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover border dark:border-claude-darkBorder border-claude-border'
                  }`}
                >
                  {cat.name_zh || cat.key}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {filteredMarketplace.length === 0 ? (
                <div className="col-span-2 text-center py-12 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'暂无 MCP 服务'}
                </div>
              ) : (
                filteredMarketplace.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/50 bg-claude-surface/50 p-3 transition-colors hover:border-claude-accent/50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg dark:bg-claude-darkSurface bg-claude-surface flex items-center justify-center flex-shrink-0">
                          <ConnectorIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                        </div>
                        <span className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">
                          {entry.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleInstallFromRegistry(entry)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-claude-accent text-white hover:bg-claude-accent/90 transition-colors"
                        >
                          {'接入'}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary line-clamp-2 mb-2">
                      {getRegistryEntryDescription(entry)}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300 font-medium">
                        {getCategoryLabel(entry.category)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${TRANSPORT_BADGE_COLORS[entry.transportType] || ''}`}>
                        {entry.transportType}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                        {'待接入'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'请切换到“可接入”选项卡查看市场中还未激活的 MCP 工具。'}
          </div>
        )}
      </section>

      {/* ## {提取} ConfirmDialog
          这里是 MCP 的确认删除弹窗。
          后续适合和 Skills / Sidebar / ScheduledTasks 统一抽成公共 ConfirmDialog。 */}
      {/* Delete confirmation modal */}
      {pendingDelete && (
        <ConfirmDialog
          isOpen={true}
          title={'删除 MCP 服务'}
          message={'确定删除 MCP 服务"{name}"吗？'.replace('{name}', pendingDelete.name)}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
          confirmLabel={'确认删除'}
          cancelLabel={'取消'}
          confirmTone="danger"
          pending={isDeleting}
          details={actionError ? <div className="text-xs text-red-500">{actionError}</div> : undefined}
        />
      )}

      {/* ## {提取} RolePickerDialog
          这里是 MCP 安装角色选择弹窗。
          后续适合抽成公共 RolePickerDialog，避免每个管理页自己写一套。 */}
      {/* Role picker modal */}
      {installRolePicker && createPortal(
        <RolePickerDialog
          isOpen={true}
          title={'安装 MCP 服务到角色'}
          description={
            <>
              {'选择要绑定 '}
              <span className="font-medium dark:text-claude-darkText text-claude-text">{installRolePicker.name}</span>
              {' 的角色：'}
            </>
          }
          options={[{ key: 'all', label: '全部角色（公共）' }, ...AGENT_ROLE_ORDER.map(k => ({ key: k, label: AGENT_ROLE_SHORT_LABELS[k] }))]}
          selectedKey={installRoleSelection}
          onSelect={setInstallRoleSelection}
          onConfirm={handleConfirmRoleAndOpenForm}
          onCancel={() => setInstallRolePicker(null)}
          confirmLabel={'安装'}
        />
      , document.body)}

      {/* Edit / Registry-install form modal */}
      <McpServerFormModal
        isOpen={isFormOpen}
        server={editingServer}
        registryEntry={installingRegistry}
        existingNames={existingNames}
        onClose={handleCloseForm}
        onSave={handleSaveForm}
      />
    </div>
  );
};

export default McpManager;
