/**
 * {标记} 功能：通用开关组件
 * {标记} 用途：布尔值切换、启用/禁用等
 * {标记} 集成：Settings.tsx, IMSettings.tsx, 等所有页面
 * {标记} 状态：新建✅
 */

import { CheckIcon, XMarkIcon } from '@heroicons/react/20/solid';
import React from 'react';

export interface SwitchProps {
  /** 是否选中 */
  checked: boolean;
  /** 变化回调 */
  onChange?: (checked: boolean) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 开关尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示图标 */
  showIcons?: boolean;
  /** 标签文本 */
  label?: string;
  /** 描述文本 */
  description?: string;
  /** 额外类名 */
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: 'w-8 h-4',
  md: 'w-11 h-6',
  lg: 'w-14 h-7',
};

const thumbSizeClasses: Record<string, string> = {
  sm: 'w-3 h-3',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const thumbTranslateClasses: Record<string, string> = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
  lg: 'translate-x-7',
};

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  showIcons = false,
  label,
  description,
  className = '',
}) => {
  const handleClick = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  const baseClasses = `
    relative inline-flex flex-shrink-0
    border-2 border-transparent
    rounded-full
    cursor-pointer
    transition-colors duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-claude-accent
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    ${checked ? 'bg-claude-accent' : 'bg-claude-textTertiary dark:bg-claude-darkTextTertiary'}
    ${sizeClasses[size]}
    ${className}
  `.trim();

  const thumbClasses = `
    pointer-events-none
    inline-block
    rounded-full
    bg-white
    shadow-subtle
    transition-transform duration-200 ease-in-out
    ${thumbSizeClasses[size]}
    ${checked ? thumbTranslateClasses[size] : 'translate-x-0'}
    ${showIcons ? 'flex items-center justify-center' : ''}
  `.trim();

  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        role="switch"
        aria-checked={checked ? 'true' : 'false'}
        aria-disabled={disabled ? 'true' : 'false'}
        className={baseClasses}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <span className="sr-only">
          {checked ? '开启' : '关闭'}
        </span>
        <span className={thumbClasses}>
          {showIcons && (
            <>
              {checked ? (
                <CheckIcon className="h-3 w-3 text-claude-accent" />
              ) : (
                <XMarkIcon className="h-3 w-3 text-gray-400" />
              )}
            </>
          )}
        </span>
      </button>
      {(label || description) && (
        <div className="ml-3">
          {label && (
            <span className="block text-sm font-medium text-claude-text dark:text-claude-darkText">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Switch;
