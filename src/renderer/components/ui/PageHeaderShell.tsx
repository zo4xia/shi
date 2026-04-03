import React from 'react';
import { getPlatform } from '../../utils/platform';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import WindowTitleBar from '../window/WindowTitleBar';
import { getResponsivePageTitleClass, getTouchButtonClass, UI_MENU_ICON_CLASS } from '../../../shared/mobileUi';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';

interface PageHeaderShellProps {
  title: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
  leading?: React.ReactNode;
  headerClassName?: string;
}

const PageHeaderShell: React.FC<PageHeaderShellProps> = ({
  title,
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
  leading,
  headerClassName = 'draggable flex h-12 items-center justify-between px-3 sm:px-4 border-b dark:border-claude-darkBorder border-claude-border shrink-0',
}) => {
  const isMac = getPlatform() === 'darwin';
  const isMobileViewport = useIsMobileViewport();
  const shouldShowCollapsedTools = Boolean(isSidebarCollapsed && (onToggleSidebar || onNewChat || updateBadge));

  return (
    <div className={headerClassName}>
      <div className="flex min-w-0 flex-1 items-center space-x-3 h-11">
        {shouldShowCollapsedTools && (
          <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              >
                <SidebarToggleIcon className={UI_MENU_ICON_CLASS} isCollapsed={true} />
              </button>
            )}
            {!isMobileViewport && onNewChat && (
              <button
                type="button"
                onClick={onNewChat}
                className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              >
                <ComposeIcon className={UI_MENU_ICON_CLASS} />
              </button>
            )}
            {!isMobileViewport ? updateBadge : null}
          </div>
        )}
        {leading}
        <h1 className={getResponsivePageTitleClass('dark:text-claude-darkText text-claude-text')}>
          {title}
        </h1>
      </div>
      <WindowTitleBar inline />
    </div>
  );
};

export default PageHeaderShell;
