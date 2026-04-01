import React, { useEffect } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';

interface DeleteConfirmModalProps {
  taskName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  taskName,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <ConfirmDialog
      isOpen={true}
      title={'删除'}
      message={'确定要删除任务「{name}」吗？此操作不可撤销。'.replace('{name}', taskName)}
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmLabel={'删除'}
      cancelLabel={'取消'}
      confirmTone="danger"
    />
  );
};

export default DeleteConfirmModal;
