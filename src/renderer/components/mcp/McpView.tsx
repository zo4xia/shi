import React from 'react';
import McpManager from './McpManager';
import { RESPONSIVE_CONTENT_WRAP_CLASS } from '../../../shared/mobileUi';
import PageHeaderShell from '../ui/PageHeaderShell';

interface McpViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const McpView: React.FC<McpViewProps> = ({ isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge }) => {
  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      <PageHeaderShell
        title={'外接能力'}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
      />

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className={RESPONSIVE_CONTENT_WRAP_CLASS}>
          <McpManager />
        </div>
      </div>
    </div>
  );
};

export default McpView;
