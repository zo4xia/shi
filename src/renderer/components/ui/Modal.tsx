/**
 * {标记} 功能：通用模态框组件
 * {标记} 用途：对话框、确认框、表单弹窗等
 * {标记} 集成：Settings.tsx, IMSettings.tsx, CoworkPermissionModal 等
 * {标记} 状态：新建✅
 */

import { XMarkIcon } from '@heroicons/react/20/solid';
import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题 */
  title?: React.ReactNode;
  /** 描述 */
  description?: React.ReactNode;
  /** 子元素 */
  children?: React.ReactNode;
  /** 底部操作区 */
  footer?: React.ReactNode;
  /** 是否显示关闭按钮 */
  showCloseButton?: boolean;
  /** 是否允许点击遮罩关闭 */
  closeOnOverlayClick?: boolean;
  /** 是否允许按 ESC 关闭 */
  closeOnEsc?: boolean;
  /** 模态框尺寸 */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** 额外类名 */
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-[90vw] h-[90vh]',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  size = 'md',
  className = '',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // 处理 ESC 键关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEsc, onClose]);

  // 阻止背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // 聚焦管理
  useEffect(() => {
    if (open && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [open]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  // {标记} Z-LAYER-MODAL: 标准模态框层 (z-50)
  const baseClasses = `
    fixed inset-0 z-50
    flex items-center justify-center
    p-4 sm:p-6
  `.trim();

  const overlayClasses = `
    fixed inset-0
    bg-black/40
    backdrop-blur-sm
    transition-opacity duration-300
    animate-in fade-in
  `.trim();

  const modalClasses = `
    relative
    w-full ${sizeClasses[size]}
    bg-claude-surface dark:bg-claude-darkSurface
    rounded-2xl
    shadow-modal
    border border-claude-border dark:border-claude-darkBorder
    overflow-hidden
    transition-colors duration-300
    animate-in fade-in zoom-in-95 slide-in-from-bottom-4
    ${className}
  `.trim();

  return (
    <div className={baseClasses} onClick={handleOverlayClick}>
      <div className={overlayClasses} />
      <div ref={modalRef} className={modalClasses}>
        {/* 标题栏 */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between px-4 py-3 border-b border-claude-border dark:border-claude-darkBorder">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-claude-text dark:text-claude-darkText">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="关闭弹窗"
                title="关闭弹窗"
                className="ml-4 p-1.5 rounded-lg text-claude-textSecondary hover:text-claude-text dark:text-claude-darkTextSecondary dark:hover:text-claude-darkText hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* 内容区 */}
        <div className="px-4 py-4 overflow-y-auto max-h-[60vh]">
          {children}
        </div>

        {/* 底部操作区 */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-claude-border dark:border-claude-darkBorder bg-claude-surface/50 dark:bg-claude-darkSurface/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
