// {路标} FLOW-PAGE-TASKS
import React, { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setViewMode, selectTask } from '../../store/slices/scheduledTaskSlice';
import { scheduledTaskService } from '../../services/scheduledTask';
import { showGlobalToast } from '../../services/toast';
import { getPlatform } from '../../utils/platform';
import TaskList from './TaskList';
import TaskForm from './TaskForm';
import TaskDetail from './TaskDetail';
import AllRunsHistory from './AllRunsHistory';
import DeleteConfirmModal from './DeleteConfirmModal';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { RESPONSIVE_CONTENT_INNER_CLASS } from '../../../shared/mobileUi';
import PageHeaderShell from '../ui/PageHeaderShell';

interface ScheduledTasksViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

type TabType = 'tasks' | 'history';

const ScheduledTasksView: React.FC<ScheduledTasksViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const dispatch = useDispatch();
  const viewMode = useSelector((state: RootState) => state.scheduledTask.viewMode);
  const selectedTaskId = useSelector((state: RootState) => state.scheduledTask.selectedTaskId);
  const tasks = useSelector((state: RootState) => state.scheduledTask.tasks);
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [deleteTaskInfo, setDeleteTaskInfo] = useState<{ id: string; name: string } | null>(null);

  const handleRequestDelete = useCallback((taskId: string, taskName: string) => {
    setDeleteTaskInfo({ id: taskId, name: taskName });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTaskInfo) return;
    const taskId = deleteTaskInfo.id;
    setDeleteTaskInfo(null);
    try {
      await scheduledTaskService.deleteTask(taskId);
      showGlobalToast('任务已删除');
    } catch (error) {
      showGlobalToast(error instanceof Error ? error.message : '删除任务失败');
      return;
    }
    // If we were viewing this task's detail, go back to list
    if (selectedTaskId === taskId) {
      dispatch(selectTask(null));
      dispatch(setViewMode('list'));
    }
  }, [deleteTaskInfo, selectedTaskId, dispatch]);

  const handleCancelDelete = useCallback(() => {
    setDeleteTaskInfo(null);
  }, []);

  useEffect(() => {
    void scheduledTaskService.init();
  }, []);

  const handleBackToList = () => {
    dispatch(selectTask(null));
    dispatch(setViewMode('list'));
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'tasks') {
      dispatch(selectTask(null));
      dispatch(setViewMode('list'));
    }
  };

  // Show tabs only in list view (not in create/edit/detail sub-views)
  const showTabs = viewMode === 'list' && !selectedTaskId;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <PageHeaderShell
        title={'定时任务'}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
        leading={viewMode !== 'list' ? (
          <button
            onClick={handleBackToList}
            className="non-draggable p-2 rounded-lg dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary transition-colors"
            aria-label={'返回'}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        ) : undefined}
        headerClassName="draggable flex h-12 items-center justify-between px-4 border-b dark:border-claude-darkBorder border-claude-border shrink-0"
      />

      {/* Tabs + New Task button */}
      {showTabs && (
        <div className="border-b dark:border-claude-darkBorder border-claude-border shrink-0">
          {/* [FLOW] Keep ScheduledTasks tabs aligned to the same main content width as Skills/MCP pages. */}
          <div className={`${RESPONSIVE_CONTENT_INNER_CLASS} flex items-center justify-between`}>
            <div className="flex">
              <button
                type="button"
                onClick={() => handleTabChange('tasks')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  activeTab === 'tasks'
                    ? 'dark:text-claude-darkText text-claude-text'
                    : 'dark:text-claude-darkTextSecondary text-claude-textSecondary hover:dark:text-claude-darkText hover:text-claude-text'
                }`}
              >
                {'任务'}
                {activeTab === 'tasks' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-claude-accent rounded-t" />
                )}
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('history')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                  activeTab === 'history'
                    ? 'dark:text-claude-darkText text-claude-text'
                    : 'dark:text-claude-darkTextSecondary text-claude-textSecondary hover:dark:text-claude-darkText hover:text-claude-text'
                }`}
              >
                {'历史'}
                {activeTab === 'history' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-claude-accent rounded-t" />
                )}
              </button>
            </div>
            {activeTab === 'tasks' && (
              <button
                type="button"
                onClick={() => dispatch(setViewMode('create'))}
                className="px-3 py-1 text-sm font-medium bg-claude-accent text-white rounded-lg hover:bg-claude-accentHover transition-colors"
              >
                {'新建任务'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        {/* [FLOW] Unify content width with Skills/MCP while keeping existing sub-view behavior. */}
        <div className={RESPONSIVE_CONTENT_INNER_CLASS}>
          {showTabs && activeTab === 'history' ? (
            <AllRunsHistory />
          ) : (
            <>
              {viewMode === 'list' && <TaskList onRequestDelete={handleRequestDelete} />}
              {viewMode === 'create' && (
                <TaskForm
                  mode="create"
                  onCancel={handleBackToList}
                  onSaved={handleBackToList}
                />
              )}
              {viewMode === 'edit' && selectedTask && (
                <TaskForm
                  mode="edit"
                  task={selectedTask}
                  onCancel={() => dispatch(setViewMode('detail'))}
                  onSaved={() => dispatch(setViewMode('detail'))}
                />
              )}
              {viewMode === 'detail' && selectedTask && (
                <TaskDetail task={selectedTask} onRequestDelete={handleRequestDelete} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTaskInfo && (
        <DeleteConfirmModal
          taskName={deleteTaskInfo.name}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
};

export default ScheduledTasksView;
