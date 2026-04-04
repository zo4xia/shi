import React from 'react';
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import Tooltip from '../ui/Tooltip';
import FloatingWidgetShell from '../app-ui/FloatingWidgetShell';
import type { CoworkRightDockAction } from './rightDock';

interface ConversationJumpWidgetProps {
  actions: CoworkRightDockAction[];
}

const rightDockIconMap: Record<CoworkRightDockAction['icon'], React.ReactNode> = {
  'jump-top': <ChevronDoubleUpIcon className="h-4 w-4" />,
  'jump-prev': <ChevronUpIcon className="h-4 w-4" />,
  'jump-bottom': <ChevronDoubleDownIcon className="h-4 w-4" />,
};

const ConversationJumpWidget: React.FC<ConversationJumpWidgetProps> = ({ actions }) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <FloatingWidgetShell title="对话跳转">
      {actions.map((action) => {
        const isPrimaryAction = action.icon === 'jump-bottom';
        const buttonClassName = isPrimaryAction
          ? 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/55 bg-gradient-to-br from-[#f0a762] to-[#d97745] text-white shadow-[0_10px_24px_rgba(217,119,69,0.28)] transition-all hover:-translate-y-0.5 hover:from-[#ef9a4d] hover:to-[#cf6837] dark:border-white/10'
          : 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/55 bg-white/78 text-claude-textSecondary shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:text-claude-text dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkTextSecondary dark:hover:bg-white/[0.1] dark:hover:text-claude-darkText';

        return (
          <Tooltip key={action.id} content={action.label} position="left" delay={120}>
            <button
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              className={buttonClassName}
            >
              {rightDockIconMap[action.icon]}
            </button>
          </Tooltip>
        );
      })}
    </FloatingWidgetShell>
  );
};

export default ConversationJumpWidget;
