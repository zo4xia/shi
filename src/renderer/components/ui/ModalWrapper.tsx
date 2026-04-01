// ROUTE: Component - 模态框包装组件
// API: ModalWrapper - 统一的模态框UI
// CHECKPOINT: 验证模态框交互逻辑

import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';

/**
 * 模态框宽度选项
 */
export type ModalWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

/**
 * ModalWrapper组件属性
 */
export interface ModalWrapperProps {
  /** 是否显示模态框 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 模态框标题 */
  title: string;
  /** 模态框宽度 */
  maxWidth?: ModalWidth;
  /** 内容区域 */
  children: React.ReactNode;
  /** 底部按钮区域(可选) */
  footer?: React.ReactNode;
  /** 标题栏额外内容(可选) */
  headerExtra?: React.ReactNode;
  /** 最大高度(可选,默认55vh) */
  maxHeight?: string;
  /** 点击背景是否关闭(默认true) */
  closeOnBackdropClick?: boolean;
  /** 是否禁用背景滚动(默认true) */
  disableBodyScroll?: boolean;
  /** 移动端是否使用全屏页壳(默认true) */
  mobileFullScreen?: boolean;
}

/**
 * 模态框宽度类名映射
 */
const WIDTH_CLASSES: Record<ModalWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

/**
 * ModalWrapper组件
 * 统一的模态框UI包装器,提供一致的样式和交互
 * 
 * @example
 * <ModalWrapper
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Settings"
 *   footer={
 *     <>
 *       <button onClick={onCancel}>Cancel</button>
 *       <button onClick={onSave}>Save</button>
 *     </>
 *   }
 * >
 *   <div>Modal content here</div>
 * </ModalWrapper>
 */
/* ## {提取} MobilePageShellModal / DesktopCenteredModal
   这里已经是当前 modal 统一壳的主入口。
   后续适合继续拆成：移动端 page-shell 模式、桌面居中 modal 模式、统一 header/footer 动作区。 */
export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  isOpen,
  onClose,
  title,
  maxWidth = 'lg',
  children,
  footer,
  headerExtra,
  maxHeight = '55vh',
  closeOnBackdropClick = true,
  disableBodyScroll = true,
  mobileFullScreen = true,
}) => {
  const isMobileViewport = useIsMobileViewport();
  // 处理背景点击
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdropClick) {
      onClose();
    }
  };

  // 处理ESC键关闭
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // 禁用/恢复背景滚动
  React.useEffect(() => {
    if (!isOpen || !disableBodyScroll) return;

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, disableBodyScroll]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 modal-backdrop-pearl flex ${
        isMobileViewport && mobileFullScreen
          ? 'items-stretch justify-stretch'
          : 'items-center justify-center'
      }`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`modal-title-${title.replace(/\s+/g, '-')}`}
    >
      <div
        className={`modal-content w-full ${isMobileViewport && mobileFullScreen ? '' : WIDTH_CLASSES[maxWidth]} ${isMobileViewport && mobileFullScreen ? '' : 'mx-4'} modal-pearl overflow-hidden flex flex-col max-h-[95vh]`}
        style={{
          width: isMobileViewport && mobileFullScreen ? '100vw' : undefined,
          minHeight: isMobileViewport && mobileFullScreen ? '100dvh' : undefined,
          maxHeight: isMobileViewport && mobileFullScreen ? '100dvh' : undefined,
          borderRadius: isMobileViewport && mobileFullScreen ? '0' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className={`flex items-center gap-3 ${isMobileViewport && mobileFullScreen ? 'px-4 py-4' : 'px-6 py-5'} border-b dark:border-claude-darkBorder border-claude-border modal-header-pearl flex-shrink-0`}>
          <div className="flex-1 min-w-0">
            <h2
              id={`modal-title-${title.replace(/\s+/g, '-')}`}
              className="text-base font-semibold dark:text-claude-darkText text-claude-text truncate"
            >
              {title}
            </h2>
          </div>
          {headerExtra}
          <button
            onClick={onClose}
            className="p-2 rounded-xl dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary transition-colors flex-shrink-0"
            aria-label="Close modal"
            type="button"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div
          className={`${isMobileViewport && mobileFullScreen ? 'px-4 py-4' : 'px-6 py-5'} space-y-4 overflow-y-auto flex-1`}
          style={{ maxHeight: isMobileViewport && mobileFullScreen ? undefined : maxHeight }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className={`flex ${isMobileViewport && mobileFullScreen ? 'flex-col-reverse items-stretch gap-3 px-4 py-4' : 'items-center justify-end gap-3 px-6 py-5'} border-t dark:border-claude-darkBorder border-claude-border modal-footer-pearl flex-shrink-0`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModalWrapper;
