// ROUTE: Component - 选项按钮组件
// API: OptionButton - 统一的选项按钮UI
// CHECKPOINT: 验证选中状态和交互逻辑

import React from 'react';

/**
 * OptionButton组件属性
 */
export interface OptionButtonProps {
  /** 选项标签 */
  label: string;
  /** 选项描述(可选) */
  description?: string;
  /** 是否选中 */
  isSelected: boolean;
  /** 点击回调 */
  onClick: () => void;
  /** 是否支持多选(显示复选框) */
  multiSelect?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 额外的CSS类名 */
  className?: string;
}

/**
 * OptionButton组件
 * 用于显示可选择的选项,支持单选和多选模式
 *
 * @example
 * // 单选模式
 * <OptionButton
 *   label="Option 1"
 *   description="This is option 1"
 *   isSelected={selected === 'option1'}
 *   onClick={() => setSelected('option1')}
 * />
 *
 * @example
 * // 多选模式
 * <OptionButton
 *   label="Option 2"
 *   description="This is option 2"
 *   isSelected={selected.includes('option2')}
 *   onClick={() => toggleSelection('option2')}
 *   multiSelect
 * />
 */
export const OptionButton: React.FC<OptionButtonProps> = ({
  label,
  description,
  isSelected,
  onClick,
  multiSelect = false,
  disabled = false,
  className = '',
}) => {
  const buttonClasses = [
    'w-full text-left rounded-xl border px-4 py-2.5 transition-colors',
    isSelected
      ? 'border-claude-accent bg-claude-accent/15 text-claude-text dark:text-claude-darkText shadow-sm'
      : 'border-claude-border dark:border-claude-darkBorder dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    className
  ].filter(Boolean).join(' ');

  const checkboxClasses = [
    'mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 transition-colors',
    isSelected
      ? 'bg-claude-accent border-claude-accent'
      : 'border-claude-border dark:border-claude-darkBorder'
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={buttonClasses}
      aria-pressed={isSelected ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3">
        {multiSelect && (
          <div
            className={checkboxClasses}
            aria-hidden="true"
          >
            {isSelected && (
              <svg className="w-full h-full text-white" viewBox="0 0 16 16" fill="none">
                <path
                  d="M13 4L6 11L3 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs mt-1 opacity-80">{description}</div>
          )}
        </div>
        {isSelected && !multiSelect && (
          <div
            className="flex-shrink-0 w-4 h-4 rounded-full bg-claude-accent"
            aria-hidden="true"
          >
            <svg className="w-full h-full text-white" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 8L7 11L12 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
};

export default OptionButton;
