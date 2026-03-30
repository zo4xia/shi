import React from 'react';
import { getPlatform } from '../../utils/platform';
import McpManager from './McpManager';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import WindowTitleBar from '../window/WindowTitleBar';
import { getResponsivePageTitleClass, getTouchButtonClass, RESPONSIVE_CONTENT_WRAP_CLASS } from '../../../shared/mobileUi';

interface McpViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const McpView: React.FC<McpViewProps> = ({ isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge }) => {
  const isMac = getPlatform() === 'darwin';
  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      <div className="draggable flex h-12 items-center justify-between px-3 sm:px-4 border-b dark:border-claude-darkBorder border-claude-border shrink-0">
        <div className="flex min-w-0 items-center space-x-3 h-11">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className={getResponsivePageTitleClass('dark:text-claude-darkText text-claude-text')}>
            {'外接能力'}
          </h1>
        </div>
        <WindowTitleBar inline />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className={RESPONSIVE_CONTENT_WRAP_CLASS}>
          <McpManager />
        </div>
      </div>
    </div>
  );
};

export default McpView;
