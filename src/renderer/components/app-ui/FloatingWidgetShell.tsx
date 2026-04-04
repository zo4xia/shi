import React from 'react';
import { UI_META_TEXT_CLASS, UI_SURFACE_COMPACT_GAP_CLASS } from '../../../shared/mobileUi';

interface FloatingWidgetShellProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
}

const FloatingWidgetShell: React.FC<FloatingWidgetShellProps> = ({
  children,
  title,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-end ${UI_SURFACE_COMPACT_GAP_CLASS} rounded-[22px] border border-white/55 bg-white/72 p-2 shadow-[0_12px_30px_rgba(194,170,145,0.18)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_10px_24px_rgba(0,0,0,0.22)] ${className}`}>
      {title ? (
        <span className={`px-1 text-[#9a7b62] dark:text-claude-darkTextSecondary/75 ${UI_META_TEXT_CLASS}`}>
          {title}
        </span>
      ) : null}
      {children}
    </div>
  );
};

export default FloatingWidgetShell;
