import React, { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { coworkService } from '../services/cowork';
import { getPlatform } from '../utils/platform';
import ComposeIcon from './icons/ComposeIcon';
import ConnectorIcon from './icons/ConnectorIcon';
import SearchIcon from './icons/SearchIcon';
import ClockIcon from './icons/ClockIcon';
import PuzzleIcon from './icons/PuzzleIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import TrashIcon from './icons/TrashIcon';
import { ExclamationTriangleIcon, ShoppingBagIcon, PhotoIcon, LinkIcon, ChatBubbleLeftRightIcon, HeartIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import {
  getTouchButtonClass,
  UI_BADGE_ICON_CLASS,
  UI_BADGE_TEXT_CLASS,
  UI_LABEL_TEXT_CLASS,
  UI_MARK_ICON_CLASS,
  UI_MENU_ICON_CLASS,
  UI_META_TEXT_CLASS,
  UI_SECTION_PADDING_CLASS,
  UI_SURFACE_COMPACT_GAP_CLASS,
  UI_SURFACE_GAP_CLASS,
} from '../../shared/mobileUi';
import ConfirmDialog from './ui/ConfirmDialog';
import { useIsMediumViewport } from '../hooks/useIsMediumViewport';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';

interface SidebarProps {
  onShowSettings: () => void;
  onShowLogin?: () => void;
  activeView: 'cowork' | 'skills' | 'scheduledTasks' | 'mcp' | 'employeeStore' | 'resourceShare' | 'freeImageGen' | 'sessionHistory' | 'room' | 'aboutUs';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onShowSessionHistory: () => void;
  onShowMcp: () => void;
  onShowEmployeeStore: () => void;
  onShowResourceShare: () => void;
  onShowFreeImageGen: () => void;
  onShowRoom: () => void;
  onShowAboutUs: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  updateBadge?: React.ReactNode;
}

/* ── 辅助区按钮图标映射 ── */
const EXTRA_ICON_MAP: Record<string, React.ReactNode> = {
  resourceShare: <LinkIcon className="h-4 w-4" />,
  freeImageGen: <PhotoIcon className="h-4 w-4" />,
};

/* ── 辅助区按钮配色 ── */
const EXTRA_ITEMS: {
  key: string;
  label: string;
  iconColor: string;
  activeBg: string;
  handler: 'onShowResourceShare' | 'onShowFreeImageGen';
}[] = [
  { key: 'resourceShare', label: '提示词大全', iconColor: 'text-blue-500', activeBg: 'from-blue-500/15 to-blue-500/5', handler: 'onShowResourceShare' },
  { key: 'freeImageGen', label: '免费生图', iconColor: 'text-pink-500', activeBg: 'from-pink-500/15 to-pink-500/5', handler: 'onShowFreeImageGen' },
];

const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  activeView,
  onShowSkills,
  onShowCowork: _onShowCowork,
  onShowScheduledTasks,
  onShowSessionHistory,
  onShowMcp,
  onShowEmployeeStore,
  onShowResourceShare,
  onShowFreeImageGen,
  onShowRoom,
  onShowAboutUs,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  updateBadge,
}) => {
  const sessions = useSelector((state: RootState) => state.cowork.sessions);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const isMac = getPlatform() === 'darwin';
  const isMediumViewport = useIsMediumViewport();
  const isMobileViewport = useIsMobileViewport();
  const isCompactSidebar = !isCollapsed && (isMediumViewport || isMobileViewport);

  const handlerMap: Record<string, () => void> = {
    onShowResourceShare,
    onShowFreeImageGen,
    onShowEmployeeStore,
  };
  const primaryNavItems: Array<{
    key: SidebarProps['activeView'];
    label: string;
    description: string;
    icon: React.ReactNode;
    onClick: () => void;
    featured?: boolean;
  }> = [
    { key: 'cowork', label: '新建任务', description: '回到当前对话主线。', icon: <ComposeIcon className="h-4 w-4" />, onClick: onNewChat },
    { key: 'sessionHistory', label: '对话记录', description: '查看最近会话和足迹。', icon: <SearchIcon className="h-4 w-4" />, onClick: onShowSessionHistory },
    { key: 'room', label: 'Room', description: '大家的小乐园和实验壳。', icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />, onClick: onShowRoom, featured: true },
  ];
  const workspaceNavItems: Array<{
    key: SidebarProps['activeView'];
    label: string;
    description: string;
    icon: React.ReactNode;
    onClick: () => void;
    featured?: boolean;
  }> = [
    { key: 'scheduledTasks', label: '定时任务', description: '让日常工作自己跑。', icon: <ClockIcon className="h-4 w-4" />, onClick: onShowScheduledTasks },
    { key: 'skills', label: '技能 skills', description: '按需装配能力。', icon: <PuzzleIcon className="h-4 w-4" />, onClick: onShowSkills },
    { key: 'mcp', label: '插件 MCP', description: '工具连接口。', icon: <ConnectorIcon className="h-4 w-4" />, onClick: onShowMcp },
    { key: 'employeeStore', label: 'Agent 商店', description: '新的伙伴和角色入口。', icon: <ShoppingBagIcon className="h-4 w-4" />, onClick: onShowEmployeeStore, featured: true },
  ];

  useEffect(() => {
    if (!isCollapsed) return;
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setShowBatchDeleteConfirm(false);
  }, [isCollapsed]);

  const handleExitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setShowBatchDeleteConfirm(false);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === sessions.length) {
        return new Set();
      }
      return new Set(sessions.map(s => s.id));
    });
  }, [sessions]);

  const handleBatchDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    setShowBatchDeleteConfirm(true);
  }, [selectedIds.size]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await coworkService.deleteSessions(ids);
    handleExitBatchMode();
  }, [selectedIds, handleExitBatchMode]);

  /* ── 主导航按钮样式 ── */
  const navBtnClass = (isActive: boolean, tone: 'primary' | 'secondary') =>
    `group w-full text-left ${getTouchButtonClass(`relative rounded-2xl transition-all duration-200 ${
      tone === 'primary'
        ? 'px-3 py-3'
        : 'px-2.5 py-2.5'
    }`)} ${
      isActive
        ? 'bg-white/85 dark:bg-white/[0.1] text-violet-600 dark:text-violet-400 shadow-[0_8px_20px_rgba(203,174,150,0.16)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.28)] border border-white/70 dark:border-white/10'
        : 'dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/80 hover:text-claude-text dark:hover:text-claude-darkText hover:bg-white/55 dark:hover:bg-white/[0.06] border border-transparent'
    }`;

  const sectionShellClass = 'rounded-[22px] border border-white/60 bg-white/45 p-2 shadow-[0_10px_24px_rgba(203,174,150,0.08)] dark:border-white/10 dark:bg-white/[0.03]';
  const compactQuickItems: Array<{
    key: string;
    active: boolean;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    shellClass: string;
    iconWrapClass: string;
  }> = [
    {
      key: 'cowork-compact',
      active: activeView === 'cowork',
      label: '新话题',
      icon: <ComposeIcon className="h-4 w-4" />,
      onClick: onNewChat,
      shellClass: 'border-[#ffd7d7] bg-[#fff0ef] text-[#8a5751] hover:bg-[#ffe8e5]',
      iconWrapClass: 'bg-[#ffdede] text-[#d9786c]',
    },
    {
      key: 'sessionHistory-compact',
      active: activeView === 'sessionHistory',
      label: '频道',
      icon: <SearchIcon className="h-4 w-4" />,
      onClick: onShowSessionHistory,
      shellClass: 'border-[#dbe5ff] bg-[#f3f6ff] text-[#56607f] hover:bg-[#ebf0ff]',
      iconWrapClass: 'bg-[#dfe8ff] text-[#6f81d8]',
    },
    {
      key: 'room-compact',
      active: activeView === 'room',
      label: 'Room',
      icon: <ChatBubbleLeftRightIcon className={UI_MENU_ICON_CLASS} />,
      onClick: onShowRoom,
      shellClass: 'border-[#dff1ff] bg-[#f1f9ff] text-[#4f738a] hover:bg-[#e7f4ff]',
      iconWrapClass: 'bg-[#dff1ff] text-[#74a8d6]',
    },
    {
      key: 'scheduledTasks-compact',
      active: activeView === 'scheduledTasks',
      label: '定时',
      icon: <ClockIcon className="h-4 w-4" />,
      onClick: onShowScheduledTasks,
      shellClass: 'border-[#ffe4b8] bg-[#fff5df] text-[#846542] hover:bg-[#fff0cf]',
      iconWrapClass: 'bg-[#ffe8c8] text-[#d09a4e]',
    },
    {
      key: 'skills-compact',
      active: activeView === 'skills',
      label: '技能',
      icon: <PuzzleIcon className="h-4 w-4" />,
      onClick: onShowSkills,
      shellClass: 'border-[#d8f0e0] bg-[#eefaf2] text-[#4e7a61] hover:bg-[#e4f6ea]',
      iconWrapClass: 'bg-[#d8f4e1] text-[#4fb47b]',
    },
    {
      key: 'mcp-compact',
      active: activeView === 'mcp',
      label: '插件',
      icon: <ConnectorIcon className="h-4 w-4" />,
      onClick: onShowMcp,
      shellClass: 'border-[#e7ddff] bg-[#f7f2ff] text-[#6d5a88] hover:bg-[#f1e9ff]',
      iconWrapClass: 'bg-[#e8deff] text-[#9c7be6]',
    },
    {
      key: 'employeeStore-compact',
      active: activeView === 'employeeStore',
      label: '商店',
      icon: <ShoppingBagIcon className={UI_MENU_ICON_CLASS} />,
      onClick: onShowEmployeeStore,
      shellClass: 'border-[#ffd8ee] bg-[#fff0f8] text-[#8b5e77] hover:bg-[#ffe7f3]',
      iconWrapClass: 'bg-[#ffdff0] text-[#db7fb0]',
    },
    {
      key: 'aboutUs-compact',
      active: activeView === 'aboutUs',
      label: '关于我们',
      icon: <HeartIcon className={UI_MENU_ICON_CLASS} />,
      onClick: onShowAboutUs,
      shellClass: 'border-[#ffe3ef] bg-[#fff5fa] text-[#916275] hover:bg-[#ffedf5]',
      iconWrapClass: 'bg-[#ffe5f0] text-[#dd7ea7]',
    },
  ];

  if (isCompactSidebar) {
    return (
      <aside
        className={`sidebar-pearl dark:bg-claude-darkSurfaceMuted flex flex-col overflow-hidden shrink-0 ${isMobileViewport ? 'w-[228px] min-w-[228px] max-w-[228px]' : 'w-[248px] min-w-[248px] max-w-[248px]'}`}
      >
        <div className={UI_SECTION_PADDING_CLASS}>
          <div className="draggable sidebar-header-drag flex items-center justify-between gap-3">
            <div className={`min-w-0 ${isMac ? 'pl-[68px]' : ''}`}>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/82 px-3 py-1.5 text-[12px] font-semibold tracking-[0.14em] text-[#4f453d] shadow-[0_10px_28px_rgba(194,170,145,0.14)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkText">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-violet-300 to-violet-400 text-[#5b4338] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:text-[#2d211b]">
                  <StarIcon className={UI_MARK_ICON_CLASS} />
                </span>
                <span className="truncate">UCLAW</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              className={getTouchButtonClass('non-draggable inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              aria-label="收起"
            >
              <SidebarToggleIcon className="h-4 w-4" isCollapsed={false} />
            </button>
          </div>
          {updateBadge ? <div className="mt-2">{updateBadge}</div> : null}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className={`space-y-3 ${UI_SURFACE_GAP_CLASS}`}>
            <div>
              <div className={`mb-2 px-1 ${UI_META_TEXT_CLASS} dark:text-claude-darkTextSecondary/85 text-claude-textSecondary/85`}>
                {'快捷入口'}
              </div>
              <div className={`grid grid-cols-2 ${UI_SURFACE_COMPACT_GAP_CLASS}`}>
                {compactQuickItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    className={`group min-h-[92px] rounded-[24px] border px-3 py-3 text-center transition-all duration-200 ${
                      item.active
                        ? `${item.shellClass} ring-2 ring-white/70 shadow-[0_10px_22px_rgba(203,174,150,0.16)] dark:ring-white/10`
                        : `${item.shellClass} shadow-[0_6px_18px_rgba(203,174,150,0.10)]`
                    }`}
                  >
                    <div className="flex h-full flex-col items-center justify-between gap-3">
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${item.iconWrapClass}`}>
                        {item.icon}
                      </span>
                      <span className={`block ${UI_LABEL_TEXT_CLASS}`}>
                        {item.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onShowAboutUs}
            className={`mb-2 w-full min-h-11 min-w-11 inline-flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors ${
              activeView === 'aboutUs'
                ? 'border-[#ffd7e8] bg-[#fff3f9] text-[#8f6078] dark:border-white/10 dark:bg-white/[0.08] dark:text-claude-darkText'
                : 'border-white/60 bg-white/45 dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-white/55 dark:hover:bg-white/[0.06]'
            }`}
            aria-label="关于我们"
          >
            <HeartIcon className={UI_MENU_ICON_CLASS} />
            关于我们
          </button>
          <button
            type="button"
            onClick={onShowSettings}
            className="w-full min-h-11 min-w-11 inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/45 px-3 py-2.5 text-sm font-medium dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="设置"
          >
            <ConnectorIcon className={UI_MENU_ICON_CLASS} />
            设置
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`sidebar-pearl dark:bg-claude-darkSurfaceMuted flex flex-col sidebar-transition overflow-hidden ${
        isCollapsed
          ? 'w-0 min-w-0'
          : 'w-[30%] min-w-[270px] max-w-[410px] shrink-0'
      }`}
    >
      {/* ── 顶部：主导航 ── */}
      <div className="pt-3 pb-3">
        <div className="draggable sidebar-header-drag flex items-center justify-between gap-3 px-3">
          <div className={`min-w-0 ${isMac ? 'pl-[68px]' : ''}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/78 px-3 py-1.5 text-[12px] font-semibold tracking-[0.14em] text-[#4f453d] shadow-[0_10px_28px_rgba(194,170,145,0.14)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkText">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-violet-300 to-violet-400 text-[#5b4338] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:text-[#2d211b]">
                <StarIcon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">UCLAW</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={getTouchButtonClass('non-draggable inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
            aria-label={isCollapsed ? '展开' : '收起'}
          >
            <SidebarToggleIcon className="h-4 w-4" isCollapsed={isCollapsed} />
          </button>
        </div>
        {updateBadge ? (
          <div className={`mt-2 px-3 ${isMac ? 'pl-[calc(68px+0.75rem)]' : ''}`}>
            {updateBadge}
          </div>
        ) : null}
        <div className="mt-3 space-y-3 px-3">
          <div>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] dark:text-claude-darkTextSecondary/85 text-claude-textSecondary/85">
              {'主路径'}
            </div>
            <div className={sectionShellClass}>
              {primaryNavItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className={navBtnClass(activeView === item.key, 'primary')}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-current dark:bg-white/[0.08]">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-[15px] font-semibold tracking-[-0.01em] dark:text-claude-darkText text-[#4E453D]">
                          {item.label}
                        </span>
                        {item.featured ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50/90 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                            <StarIcon className="h-3 w-3" />
                            {'特色'}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 dark:text-claude-darkTextSecondary/72 text-[#8F8276]">
                        {item.description}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] dark:text-claude-darkTextSecondary/85 text-claude-textSecondary/85">
              {'工作台'}
            </div>
            <div className={sectionShellClass}>
              {workspaceNavItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className={navBtnClass(activeView === item.key, 'secondary')}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/65 text-current dark:bg-white/[0.06]">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-[13px] font-semibold tracking-[-0.01em] dark:text-claude-darkText text-[#51473F]">
                          {item.label}
                        </span>
                        {item.featured ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50/90 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                            <StarIcon className="h-2.5 w-2.5" />
                            {'特色'}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-5 dark:text-claude-darkTextSecondary/70 text-[#938678]">
                        {item.description}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] dark:text-claude-darkTextSecondary/85 text-claude-textSecondary/85">
              {'关于'}
            </div>
            <div className={sectionShellClass}>
              <button
                type="button"
                onClick={onShowAboutUs}
                className={navBtnClass(activeView === 'aboutUs', 'secondary')}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/65 text-current dark:bg-white/[0.06]">
                    <HeartIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold tracking-[-0.01em] dark:text-claude-darkText text-[#51473F]">
                      {'关于我们'}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-5 dark:text-claude-darkTextSecondary/70 text-[#938678]">
                      {'看看我们是谁，也看看怎样好好对待小家伙们。'}
                    </span>
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 撑开中间空间，把辅助区推到底部 */}
      <div className="flex-1" />

      {/* ── 底部：辅助区 + 设置 ── */}
      {isBatchMode ? (
        <div className="px-3 pb-3 pt-1 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
            <input
              type="checkbox"
              checked={selectedIds.size === sessions.length && sessions.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-claude-accent cursor-pointer"
            />
            {'全选'}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchDeleteClick}
              disabled={selectedIds.size === 0}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                selectedIds.size > 0
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {selectedIds.size > 0 ? `${selectedIds.size}` : ''}
            </button>
            <button
              type="button"
              onClick={handleExitBatchMode}
              className="px-3 py-1.5 text-sm font-medium rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
            >
              {'取消'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {/* ── 辅助入口：彩色图标 + 红点"热"标签 ── */}
          <div>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] dark:text-claude-darkTextSecondary/85 text-claude-textSecondary/85">
              {'灵感角'}
            </div>
            <div className={sectionShellClass}>
              {EXTRA_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => { handlerMap[item.handler](); }}
                  className={`relative group w-full ${getTouchButtonClass('inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-200')} ${
                    activeView === item.key
                      ? `bg-white/80 dark:bg-white/[0.1] ${item.iconColor} shadow-[0_1px_4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)] border border-white/60 dark:border-white/10`
                      : 'dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/80 hover:text-claude-text dark:hover:text-claude-darkText hover:bg-white/50 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className={activeView === item.key ? '' : item.iconColor}>
                    {EXTRA_ICON_MAP[item.key]}
                  </span>
                  <span className="text-[12px] font-semibold tracking-[-0.01em] dark:text-claude-darkText text-[#51473F]">
                    {item.label}
                  </span>
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400/80 flex-shrink-0" />
                </button>
              ))}
              <a
                href="https://uclaw.bolt.host/"
                target="_blank"
                rel="noopener noreferrer"
                className={`relative group w-full ${getTouchButtonClass('inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors duration-200')} dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/80 hover:text-claude-text dark:hover:text-claude-darkText hover:bg-claude-surfaceHover/40 dark:hover:bg-claude-darkSurfaceHover/40`}
              >
                <span className="text-violet-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </span>
                <span className="text-[12px] font-semibold tracking-[-0.01em] dark:text-claude-darkText text-[#51473F]">
                  {'超IN题词库'}
                </span>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400/80 flex-shrink-0" />
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onShowSettings()}
            className={`w-full ${getTouchButtonClass('inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/45 px-3 py-2.5 text-sm font-medium dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-white/55 dark:hover:bg-white/[0.06] transition-colors')}`}
            aria-label={'设置'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M14 17H5" /><path d="M19 7h-9" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
            {'设置'}
          </button>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          title={'确认批量删除'}
          message={'确定要删除选中的 {count} 个任务吗？此操作不可撤销。'.replace('{count}', String(selectedIds.size))}
          onConfirm={handleBatchDelete}
          onCancel={() => setShowBatchDeleteConfirm(false)}
          confirmLabel={`删除 (${selectedIds.size})`}
          cancelLabel={'取消'}
          confirmTone="danger"
        />
      )}
    </aside>
  );
};

export default Sidebar;
