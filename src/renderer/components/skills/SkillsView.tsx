import React from 'react';
import SkillsManager from './SkillsManager';
import { RESPONSIVE_CONTENT_WRAP_CLASS } from '../../../shared/mobileUi';
import PageHeaderShell from '../ui/PageHeaderShell';

interface SkillsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const SkillsView: React.FC<SkillsViewProps> = ({ isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge }) => {
  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      <PageHeaderShell
        title={'技能中心'}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
      />

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className={RESPONSIVE_CONTENT_WRAP_CLASS}>
          <SkillsManager />
        </div>
      </div>
    </div>
  );
};

export default SkillsView;
