import React from 'react';
import ModalWrapper from './ModalWrapper';

export interface OptionSheetItem {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export interface OptionSheetProps {
  isOpen: boolean;
  title: string;
  items: OptionSheetItem[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

const OptionSheet: React.FC<OptionSheetProps> = ({
  isOpen,
  title,
  items,
  onSelect,
  onClose,
}) => {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      maxHeight="75vh"
    >
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className="flex w-full items-start gap-3 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-left transition-colors hover:bg-white/90 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
          >
            {item.icon ? (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/75 dark:bg-white/[0.08]">
                {item.icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-claude-text dark:text-claude-darkText">
                {item.label}
              </span>
              {item.description ? (
                <span className="mt-1 block text-xs leading-5 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {item.description}
                </span>
              ) : null}
            </span>
            {item.trailing ? (
              <span className="mt-0.5 shrink-0">{item.trailing}</span>
            ) : null}
          </button>
        ))}
      </div>
    </ModalWrapper>
  );
};

export default OptionSheet;
