import React from 'react';
import CoworkPromptInput, { type CoworkPromptInputRef, type CoworkSubmitOptions } from './CoworkPromptInput';
import { buildSessionPreviewText, type SessionSourceFilter } from './sessionRecordUtils';
import { coworkService } from '../../services/cowork';
import type { CoworkImageAttachment, CoworkSessionSummary } from '../../types/cowork';

export interface HomePromptPanelProps {
  latestVisibleSession: CoworkSessionSummary | null;
  promptInputRef: React.RefObject<CoworkPromptInputRef>;
  onStartSession: (prompt: string, skillPrompt?: string, imageAttachments?: CoworkImageAttachment[], submitOptions?: CoworkSubmitOptions) => Promise<void> | void;
  onStopSession: () => void;
  isStreaming: boolean;
  workingDirectory?: string | null;
  onWorkingDirectoryChange: (dir: string) => Promise<void>;
  onShowSessionHistory?: (filter?: SessionSourceFilter) => void;
  onShowSkills?: () => void;
}

const HomePromptPanel: React.FC<HomePromptPanelProps> = ({
  latestVisibleSession,
  promptInputRef,
  onStartSession,
  onStopSession,
  isStreaming,
  workingDirectory,
  onWorkingDirectoryChange,
  onShowSessionHistory,
  onShowSkills,
}) => (
  <div className="uclaw-home-input-region uclaw-panel-shell">
    <div className="px-3 pt-3">
      {latestVisibleSession ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/60 px-3.5 py-2.5 dark:border-violet-400/15 dark:bg-violet-400/[0.06] sm:rounded-full">
          <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              最近一个对话
            </span>
            <span className="mx-2 text-violet-400/70 dark:text-violet-300/40">·</span>
            <span className="inline-block max-w-full align-bottom truncate text-xs leading-5 text-claude-textSecondary dark:text-claude-darkTextSecondary">
              摘要：{buildSessionPreviewText(latestVisibleSession)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void coworkService.loadSession(latestVisibleSession.id);
              }}
              className="inline-flex items-center text-xs font-medium text-violet-700 transition-colors hover:text-violet-800 hover:underline dark:text-violet-300 dark:hover:text-violet-200"
            >
              点击继续
            </button>
            <button
              type="button"
              onClick={() => onShowSessionHistory?.('all')}
              className="inline-flex items-center text-xs text-claude-textSecondary transition-colors hover:text-claude-text hover:underline dark:text-claude-darkTextSecondary dark:hover:text-claude-darkText"
            >
              所有记录
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
            Start Here
          </div>
          <div className="mt-1 text-[15px] font-medium leading-6 text-claude-text dark:text-claude-darkText">
            给小伙伴分配任务，或直接开始一段对话
          </div>
        </div>
      )}
    </div>
    <div className="uclaw-panel-inner">
      <CoworkPromptInput
        ref={promptInputRef}
        onSubmit={onStartSession}
        onStop={onStopSession}
        isStreaming={isStreaming}
        placeholder="分配一个任务或提问任何问题"
        size="large"
        workingDirectory={workingDirectory ?? undefined}
        onWorkingDirectoryChange={onWorkingDirectoryChange}
        showFolderSelector={true}
        onManageSkills={() => onShowSkills?.()}
      />
    </div>
  </div>
);

export default HomePromptPanel;
