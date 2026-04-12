/**
 * {标记} 功能：通用输入框组件
 * {标记} 用途：统一输入框样式，支持多种变体
 * {标记} 集成：Settings.tsx, IMSettings.tsx, 等所有页面
 * {标记} 状态：新建✅
 */

import { EyeIcon, EyeSlashIcon, XCircleIcon } from '@heroicons/react/20/solid';
import React, { forwardRef, useState } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 输入框变体 */
  variant?: 'default' | 'error' | 'success';
  /** 输入框尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 左侧图标 */
  leftIcon?: React.ReactNode;
  /** 右侧图标 */
  rightIcon?: React.ReactNode;
  /** 是否显示清除按钮 */
  clearable?: boolean;
  /** 清除回调 */
  onClear?: () => void;
  /** 是否为密码类型 */
  isPassword?: boolean;
  /** 错误提示 */
  errorMessage?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 标签 */
  label?: React.ReactNode;
}

const sizeClasses: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

const variantClasses: Record<string, string> = {
  default: 'border-claude-border dark:border-claude-darkBorder focus:border-claude-accent focus:ring-1 focus:ring-claude-accent',
  error: 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500',
  success: 'border-green-500 focus:border-green-500 focus:ring-1 focus:ring-green-500',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      size = 'md',
      compact = false,
      leftIcon,
      rightIcon,
      clearable = false,
      onClear,
      isPassword = false,
      errorMessage,
      helperText,
      label,
      className = '',
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordType = isPassword || props.type === 'password';
    const [, setIsFocused] = useState(false);

    const handleClear = () => {
      if (onClear) {
        onClear();
      }
      if (onChange) {
        onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
      }
    };

    const showClearButton = clearable && value && !isPasswordType;
    const showPasswordToggle = isPasswordType;
    const showClearButtons = showClearButton || showPasswordToggle || rightIcon;

    const inputClasses = `
      w-full bg-transparent border rounded-xl
      transition-colors duration-200
      placeholder:text-claude-textTertiary dark:placeholder:text-claude-darkTextTertiary
      disabled:opacity-50 disabled:cursor-not-allowed
      ${sizeClasses[size]}
      ${compact ? 'py-1' : ''}
      ${variantClasses[variant]}
      ${leftIcon ? 'pl-10' : ''}
      ${showClearButtons ? 'pr-10' : ''}
      ${className}
    `.trim();

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-claude-text dark:text-claude-darkText mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-claude-textSecondary dark:text-claude-darkTextSecondary pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={inputClasses}
            type={isPasswordType && !showPassword ? 'password' : 'text'}
            value={value}
            onChange={onChange}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {showClearButtons && !showPasswordToggle && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="清空输入"
                title="清空输入"
                className="text-claude-textTertiary hover:text-claude-text dark:text-claude-darkTextTertiary dark:hover:text-claude-darkText transition-colors"
              >
                <XCircleIcon className="h-4 w-4" />
              </button>
            )}
            {showPasswordToggle && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                title={showPassword ? '隐藏密码' : '显示密码'}
                className="text-claude-textTertiary hover:text-claude-text dark:text-claude-darkTextTertiary dark:hover:text-claude-darkText transition-colors"
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
            )}
            {rightIcon && !showClearButton && !showPasswordToggle && (
              <div className="text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {rightIcon}
              </div>
            )}
          </div>
        </div>
        {errorMessage && (
          <p className="mt-1 text-xs text-red-500">{errorMessage}</p>
        )}
        {helperText && !errorMessage && (
          <p className="mt-1 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
