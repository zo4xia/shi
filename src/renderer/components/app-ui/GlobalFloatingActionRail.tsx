import React from 'react';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import { ConversationJumpWidget } from '../cowork';
import type { CoworkRightDockAction } from '../cowork/rightDock';
import UtilityActionStack from './UtilityActionStack';
import { UI_MENU_ICON_CLASS, UI_SURFACE_COMPACT_GAP_CLASS } from '../../../shared/mobileUi';

interface GlobalFloatingActionRailProps {
  visible: boolean;
  showLeftLauncher: boolean;
  showCollapsedCoworkTools: boolean;
  showJumpRail: boolean;
  rightDockActions: CoworkRightDockAction[];
  compactUtility: boolean;
  updateBadge?: React.ReactNode;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
}

const launcherButtonClass = 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/55 bg-white/78 text-claude-textSecondary shadow-[0_10px_24px_rgba(194,170,145,0.16)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:text-claude-text dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkTextSecondary dark:hover:bg-white/[0.1] dark:hover:text-claude-darkText';

const GlobalFloatingActionRail: React.FC<GlobalFloatingActionRailProps> = ({
  visible,
  showLeftLauncher,
  showCollapsedCoworkTools,
  showJumpRail,
  rightDockActions,
  compactUtility,
  updateBadge,
  onToggleSidebar,
  onNewChat,
  onOpenSettings,
}) => {
  if (!visible) {
    return null;
  }

  return (
    <>
      {showLeftLauncher && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-30 flex items-start justify-start px-3 py-4 sm:px-4">
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={onToggleSidebar}
              className={launcherButtonClass}
              aria-label="展开侧边栏"
            >
              <SidebarToggleIcon className={UI_MENU_ICON_CLASS} isCollapsed={true} />
            </button>
          </div>
        </div>
      )}

      {showJumpRail && rightDockActions.length > 0 ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-30 flex items-center justify-end px-3 sm:px-4">
          <div className="pointer-events-auto">
            <ConversationJumpWidget actions={rightDockActions} />
          </div>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute right-0 top-0 z-30 flex justify-end px-3 py-5 sm:px-4"
      >
        <div className={`pointer-events-auto flex flex-col items-end ${UI_SURFACE_COMPACT_GAP_CLASS}`}>
          {showCollapsedCoworkTools ? (
            <>
              <div className={`flex flex-col items-end ${UI_SURFACE_COMPACT_GAP_CLASS} rounded-[20px] border border-white/55 bg-white/72 p-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]`}>
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className={launcherButtonClass}
                  aria-label="展开侧边栏"
                >
                  <SidebarToggleIcon className={UI_MENU_ICON_CLASS} isCollapsed={true} />
                </button>
                <button
                  type="button"
                  onClick={onNewChat}
                  className={launcherButtonClass}
                  aria-label="新建任务"
                >
                  <ComposeIcon className={UI_MENU_ICON_CLASS} />
                </button>
              </div>
              {updateBadge}
            </>
          ) : null}

          <UtilityActionStack
            compact={compactUtility}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>
    </>
  );
};

export default GlobalFloatingActionRail;
