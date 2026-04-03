import React, { Suspense, useRef, useState } from 'react';
import PuzzleIcon from '../icons/PuzzleIcon';
import { Skill } from '../../types/skill';
import { UI_MENU_ICON_CLASS } from '../../../shared/mobileUi';

const SkillsPopover = React.lazy(() => import('./SkillsPopover'));

interface SkillsButtonProps {
  onSelectSkill: (skill: Skill) => void;
  onManageSkills: () => void;
  className?: string;
  roleKey?: string;
  onOpen?: () => unknown | Promise<unknown>;
}

const SkillsButton: React.FC<SkillsButtonProps> = ({
  onSelectSkill,
  onManageSkills,
  className = '',
  roleKey,
  onOpen,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleButtonClick = () => {
    if (!isPopoverOpen) {
      void onOpen?.();
    }
    setIsPopoverOpen(prev => !prev);
  };

  const handleClosePopover = () => {
    setIsPopoverOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        className={`p-2 rounded-xl dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-accent dark:hover:text-claude-accent hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors ${className}`}
        title="Skills"
      >
        <PuzzleIcon className={UI_MENU_ICON_CLASS} />
      </button>
      {isPopoverOpen && (
        <Suspense fallback={null}>
          <SkillsPopover
            isOpen={isPopoverOpen}
            onClose={handleClosePopover}
            onSelectSkill={onSelectSkill}
            onManageSkills={onManageSkills}
            anchorRef={buttonRef}
            roleKey={roleKey}
          />
        </Suspense>
      )}
    </div>
  );
};

export default SkillsButton;
