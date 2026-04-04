import React from 'react';
import { StarIcon } from '@heroicons/react/24/solid';
import { getTouchButtonClass } from '../../shared/mobileUi';

interface SidebarNavButtonProps {
  active: boolean;
  tone: 'primary' | 'secondary';
  label: string;
  description: string;
  icon: React.ReactNode;
  featured?: boolean;
  onClick: () => void;
}

const SidebarNavButton: React.FC<SidebarNavButtonProps> = ({
  active,
  tone,
  label,
  description,
  icon,
  featured = false,
  onClick,
}) => {
  const className =
    `group w-full text-left ${getTouchButtonClass(`relative rounded-2xl transition-all duration-200 ${
      tone === 'primary' ? 'px-3 py-3' : 'px-2.5 py-2.5'
    }`)} ${
      active
        ? 'bg-white/85 dark:bg-white/[0.1] text-violet-600 dark:text-violet-400 shadow-[0_8px_20px_rgba(203,174,150,0.16)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.28)] border border-white/70 dark:border-white/10'
        : 'dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/80 hover:text-claude-text dark:hover:text-claude-darkText hover:bg-white/55 dark:hover:bg-white/[0.06] border border-transparent'
    }`;

  return (
    <button type="button" onClick={onClick} className={className}>
      <div className={`flex items-start ${tone === 'primary' ? 'gap-3' : 'gap-2.5'}`}>
        <span className={`mt-0.5 flex shrink-0 items-center justify-center text-current dark:bg-white/[0.08] ${
          tone === 'primary'
            ? 'h-9 w-9 rounded-2xl bg-white/75'
            : 'h-8 w-8 rounded-xl bg-white/65'
        }`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`block font-semibold tracking-[-0.01em] dark:text-claude-darkText ${
              tone === 'primary' ? 'text-[15px] text-[#4E453D]' : 'text-[13px] text-[#51473F]'
            }`}>
              {label}
            </span>
            {featured ? (
              <span className={`inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50/90 font-semibold tracking-[0.08em] text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200 ${
                tone === 'primary' ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[9px]'
              }`}>
                <StarIcon className={tone === 'primary' ? 'h-3 w-3' : 'h-2.5 w-2.5'} />
                {'特色'}
              </span>
            ) : null}
          </span>
          <span className={`block dark:text-claude-darkTextSecondary/72 ${
            tone === 'primary'
              ? 'mt-1 text-[11px] leading-5 text-[#8F8276]'
              : 'mt-0.5 text-[10px] leading-5 text-[#938678]'
          }`}>
            {description}
          </span>
        </span>
      </div>
    </button>
  );
};

export default SidebarNavButton;
