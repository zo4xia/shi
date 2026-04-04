import React from 'react';
import { PaperAirplaneIcon, StopIcon, FolderIcon } from '@heroicons/react/24/solid';
import { ComputerDesktopIcon } from '@heroicons/react/24/outline';
import PaperClipIcon from '../icons/PaperClipIcon';
import ModelSelector from '../ModelSelector';
import FolderSelectorPopover from './FolderSelectorPopover';
import { SkillsButton, ActiveSkillBadge } from '../skills';
import type { Skill } from '../../types/skill';
import type { AgentRoleKey } from '../../../shared/agentRoleConfig';
import { UI_LABEL_TEXT_CLASS, UI_MENU_ICON_CLASS } from '../../../shared/mobileUi';

interface PromptToolRowProps {
  showFolderSelector: boolean;
  workingDirectory: string;
  truncatePath: (path: string, maxLength?: number) => string;
  folderButtonRef: React.RefObject<HTMLButtonElement>;
  showFolderMenu: boolean;
  setShowFolderMenu: React.Dispatch<React.SetStateAction<boolean>>;
  handleFolderSelect: (path: string) => void;
  showModelSelector: boolean;
  sessionRoleKey?: string;
  sessionModelId?: string;
  lockModelSelector: boolean;
  disabled: boolean;
  isStreaming: boolean;
  handleAddFile: () => void;
  handleOpenBrowserEyes: () => void | Promise<void>;
  handleSelectSkill: (skill: Skill) => void;
  handleManageSkills: () => void;
  ensureSkillsLoaded: () => Promise<Skill[]>;
  canSubmit: boolean;
  handleStopClick: () => void;
  handleSubmit: () => void | Promise<void>;
}

const iconButtonClass = 'flex shrink-0 items-center justify-center rounded-lg p-1.5 text-sm text-[#9A9085] transition-colors hover:bg-[#9A9085]/10 hover:text-[#7A7065] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/70';

const PromptToolRow: React.FC<PromptToolRowProps> = ({
  showFolderSelector,
  workingDirectory,
  truncatePath,
  folderButtonRef,
  showFolderMenu,
  setShowFolderMenu,
  handleFolderSelect,
  showModelSelector,
  sessionRoleKey,
  sessionModelId,
  lockModelSelector,
  disabled,
  isStreaming,
  handleAddFile,
  handleOpenBrowserEyes,
  handleSelectSkill,
  handleManageSkills,
  ensureSkillsLoaded,
  canSubmit,
  handleStopClick,
  handleSubmit,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-1.5">
      <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {showFolderSelector && (
          <>
            <div className="relative group">
              <button
                ref={folderButtonRef}
                type="button"
                onClick={() => setShowFolderMenu((current) => !current)}
                className="flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[#9A9085] transition-colors hover:bg-[#9A9085]/10 hover:text-[#7A7065] dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/70"
              >
                <FolderIcon className="h-4 w-4 shrink-0" />
                <span className={`max-w-[120px] truncate sm:max-w-[180px] ${UI_LABEL_TEXT_CLASS}`}>
                  {truncatePath(workingDirectory)}
                </span>
              </button>
              {!showFolderMenu && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 max-w-[min(20rem,calc(100vw-2rem))] px-3.5 py-2.5 text-[13px] leading-relaxed rounded-xl shadow-lg dark:bg-white/10 bg-white/80 dark:text-white/90 text-[#5A5248] dark:border-white/10 border border-white/20 backdrop-blur-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-colors duration-200 pointer-events-none z-50 break-all whitespace-nowrap">
                  {truncatePath(workingDirectory, 120)}
                </div>
              )}
            </div>
            <FolderSelectorPopover
              isOpen={showFolderMenu}
              onClose={() => setShowFolderMenu(false)}
              onSelectFolder={handleFolderSelect}
              anchorRef={folderButtonRef as React.RefObject<HTMLElement>}
            />
          </>
        )}
        {showModelSelector && (
          <ModelSelector
            dropdownDirection="up"
            forcedRoleKey={sessionRoleKey as AgentRoleKey | undefined}
            forcedModelId={sessionModelId}
            readOnly={lockModelSelector}
          />
        )}
        <button
          type="button"
          onClick={handleAddFile}
          className={iconButtonClass}
          title={'添加文件'}
          aria-label={'添加文件'}
          disabled={disabled || isStreaming}
        >
          <PaperClipIcon className={UI_MENU_ICON_CLASS} />
        </button>
        <button
          type="button"
          onClick={() => { void handleOpenBrowserEyes(); }}
          className={iconButtonClass}
          title={'打开小眼睛小电视'}
          aria-label={'打开小眼睛小电视'}
          disabled={disabled}
        >
          <ComputerDesktopIcon className={UI_MENU_ICON_CLASS} />
        </button>
        <SkillsButton
          onSelectSkill={handleSelectSkill}
          onManageSkills={handleManageSkills}
          roleKey={sessionRoleKey}
          onOpen={ensureSkillsLoaded}
        />
        <ActiveSkillBadge />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isStreaming ? (
          <button
            type="button"
            onClick={handleStopClick}
            className="p-2 rounded-xl bg-red-500/90 hover:bg-red-600 text-white transition-colors shadow-sm hover:shadow"
            aria-label="停止"
          >
            <StopIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            className="p-2 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 hover:from-violet-500 hover:to-purple-600 text-white transition-all duration-200 shadow-[0_2px_8px_rgba(139,92,246,0.35)] hover:shadow-[0_4px_12px_rgba(139,92,246,0.45)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100"
            aria-label="发送"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default PromptToolRow;
