import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import ModalWrapper from './ModalWrapper';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'accent';
  pending?: boolean;
  details?: React.ReactNode;
}

const CONFIRM_TONE_CLASS: Record<NonNullable<ConfirmDialogProps['confirmTone']>, string> = {
  danger: 'bg-red-500 text-white hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-400',
  accent: 'bg-claude-accent text-white hover:bg-claude-accentHover',
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmTone = 'danger',
  pending = false,
  details,
}) => {
  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      maxHeight="60vh"
      footer={(
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${CONFIRM_TONE_CLASS[confirmTone]}`}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
        </div>
        <p className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {message}
        </p>
        {details ? (
          <div className="mt-3 w-full">
            {details}
          </div>
        ) : null}
      </div>
    </ModalWrapper>
  );
};

export default ConfirmDialog;
