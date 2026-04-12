import React from 'react';

export interface CardProps {
  /** 卡片变体 */
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive';
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 是否可点击 */
  clickable?: boolean;
  /** 点击事件 */
  onClick?: () => void;
  /** 子元素 */
  children?: React.ReactNode;
  /** 额外类名 */
  className?: string;
  /** 标题 */
  title?: React.ReactNode;
  /** 描述 */
  description?: React.ReactNode;
  /** 右侧操作区 */
  action?: React.ReactNode;
}

const variantClasses: Record<string, string> = {
  default: 'bg-white/60 dark:bg-white/[0.05] border border-white/40 dark:border-white/10 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
  elevated: 'bg-white/70 dark:bg-white/[0.07] border border-white/50 dark:border-white/10 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]',
  outlined: 'bg-transparent border border-white/30 dark:border-white/10',
  interactive: 'bg-white/60 dark:bg-white/[0.05] border border-white/40 dark:border-white/10 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] hover:bg-white/80 dark:hover:bg-white/[0.09] hover:border-white/60 dark:hover:border-white/20 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all duration-200 cursor-pointer',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  compact = false,
  clickable = false,
  onClick,
  children,
  className = '',
  title,
  description,
  action,
}) => {
  const baseClasses = `
    rounded-2xl
    ${variantClasses[variant]}
    ${compact ? 'p-3' : 'p-4'}
    ${clickable ? '' : ''}
    ${className}
  `.trim();

  const handleClick = () => {
    if (clickable && onClick) {
      onClick();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || !onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={baseClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {(title || action) && (
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-claude-text dark:text-claude-darkText">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {description}
              </p>
            )}
          </div>
          {action && <div className="flex-shrink-0 ml-4">{action}</div>}
        </div>
      )}
      <div className={title || description ? '' : ''}>{children}</div>
    </div>
  );
};

export default Card;
