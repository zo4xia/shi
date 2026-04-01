import React from 'react';
import ModalWrapper from './ModalWrapper';

export interface RolePickerDialogOption {
  key: string;
  label: string;
}

export interface RolePickerDialogProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  options: RolePickerDialogOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

const RolePickerDialog: React.FC<RolePickerDialogProps> = ({
  isOpen,
  title,
  description,
  options,
  selectedKey,
  onSelect,
  onConfirm,
  onCancel,
  confirmLabel = '确认',
}) => {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      maxHeight="70vh"
      footer={(
        <button
          type="button"
          onClick={onConfirm}
          className="w-full py-2.5 rounded-xl bg-claude-accent text-white text-sm font-medium hover:bg-claude-accent/90 transition-colors"
        >
          {confirmLabel}
        </button>
      )}
    >
      <div className="space-y-4">
        {description ? (
          <div className="text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {description}
          </div>
        ) : null}
        <div className="space-y-2">
          {options.map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover"
            >
              <input
                type="radio"
                name="role-picker"
                checked={selectedKey === option.key}
                onChange={() => onSelect(option.key)}
                className="w-4 h-4 border-claude-border dark:border-claude-darkBorder text-claude-accent focus:ring-claude-accent"
              />
              <span className="text-sm dark:text-claude-darkText text-claude-text">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </ModalWrapper>
  );
};

export default RolePickerDialog;
