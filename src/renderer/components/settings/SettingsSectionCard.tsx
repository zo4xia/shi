import React from 'react';

type SettingsSectionCardProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const SettingsSectionCard: React.FC<SettingsSectionCardProps> = ({
  title,
  description,
  actions,
  children,
  className = '',
}) => (
  <section
    className={`rounded-[24px] border border-white/60 bg-white/55 px-4 py-4 shadow-[0_10px_24px_rgba(203,174,150,0.08)] dark:border-white/10 dark:bg-white/[0.03] sm:px-5 sm:py-5 ${className}`.trim()}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold dark:text-claude-darkText text-claude-text sm:text-sm">
          {title}
        </h4>
        {description ? (
          <p className="mt-1 hidden text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
    <div className="mt-4">
      {children}
    </div>
  </section>
);

export default SettingsSectionCard;
