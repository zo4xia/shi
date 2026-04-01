import React from 'react';
import ModalWrapper from './ModalWrapper';

export interface ImportDialogProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  body: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  pending?: boolean;
}

const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  title,
  description,
  body,
  confirmLabel = '导入',
  onConfirm,
  onCancel,
  confirmDisabled = false,
  pending = false,
}) => {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="md"
      maxHeight="75vh"
      footer={(
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled || pending}
          className="w-full py-2.5 rounded-xl bg-claude-accent text-white text-sm font-medium hover:bg-claude-accent/90 transition-colors disabled:opacity-50"
        >
          {pending ? '处理中...' : confirmLabel}
        </button>
      )}
    >
      <div className="space-y-3">
        {description ? (
          <div className="text-sm leading-6 dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {description}
          </div>
        ) : null}
        {body}
      </div>
    </ModalWrapper>
  );
};

export default ImportDialog;
