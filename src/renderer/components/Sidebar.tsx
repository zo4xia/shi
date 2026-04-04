import React from 'react';
import { getPlatform } from '../utils/platform';
import ComposeIcon from './icons/ComposeIcon';
import ConnectorIcon from './icons/ConnectorIcon';
import SearchIcon from './icons/SearchIcon';
import ClockIcon from './icons/ClockIcon';
import PuzzleIcon from './icons/PuzzleIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import { ShoppingBagIcon, PhotoIcon, LinkIcon, HeartIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import {
  getTouchButtonClass,
  UI_LABEL_TEXT_CLASS,
  UI_MARK_ICON_CLASS,
  UI_MENU_ICON_CLASS,
  UI_SECTION_PADDING_CLASS,
} from '../../shared/mobileUi';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import SidebarCompactGrid from './SidebarCompactGrid';
import type { SidebarCompactTileItem } from './SidebarCompactTile';

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
  onShowRoom: _onShowRoom,
  onShowAboutUs,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  updateBadge,
}) => {
  const isMac = getPlatform() === 'darwin';
  const isMobileViewport = useIsMobileViewport();
  const compactQuickItems: SidebarCompactTileItem[] = [
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
      key: 'resourceShare-compact',
      active: activeView === 'resourceShare',
      label: '题词库',
      icon: <LinkIcon className={UI_MENU_ICON_CLASS} />,
      onClick: onShowResourceShare,
      shellClass: 'border-[#dae9ff] bg-[#f3f8ff] text-[#5d7590] hover:bg-[#eaf3ff]',
      iconWrapClass: 'bg-[#e0edff] text-[#6e9ad3]',
    },
    {
      key: 'freeImageGen-compact',
      active: activeView === 'freeImageGen',
      label: '生图',
      icon: <PhotoIcon className={UI_MENU_ICON_CLASS} />,
      onClick: onShowFreeImageGen,
      shellClass: 'border-[#ffdced] bg-[#fff2f8] text-[#8d617a] hover:bg-[#ffe9f3]',
      iconWrapClass: 'bg-[#ffe0ef] text-[#e17cae]',
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
    {
      key: 'settings-compact',
      active: false,
      label: '设置',
      icon: <ConnectorIcon className={UI_MENU_ICON_CLASS} />,
      onClick: onShowSettings,
      shellClass: 'border-[#e8e2da] bg-[#faf6f2] text-[#7c6f64] hover:bg-[#f5eee8]',
      iconWrapClass: 'bg-[#efe7de] text-[#9b8a7b]',
    },
  ];

  return (
    <aside
      className={`sidebar-pearl dark:bg-claude-darkSurfaceMuted flex flex-col overflow-hidden shrink-0 sidebar-transition ${
        isCollapsed
          ? 'w-0 min-w-0'
          : isMobileViewport
            ? 'm-1.5 mr-0 w-[228px] min-w-[228px] max-w-[228px]'
            : 'm-1.5 mr-0 w-[248px] min-w-[248px] max-w-[248px]'
      }`}
      style={isCollapsed ? undefined : {
        borderTopRightRadius: 'var(--uclaw-shell-radius)',
        borderBottomRightRadius: 'var(--uclaw-shell-radius)',
      }}
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
        <div className="space-y-3">
          <SidebarCompactGrid
            title="快捷入口"
            items={compactQuickItems}
          />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
