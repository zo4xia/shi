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
    className={`rounded-xl border dark:border-claude-darkBorder/70 border-claude-border/70 bg-claude-surface/60 dark:bg-claude-darkSurface/30 px-4 py-4 sm:px-5 sm:py-5 transition-colors hover:bg-claude-surface dark:hover:bg-claude-darkSurface/40 ${className}`.trim()}
  >
    <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
      <div className="min-w-0 flex-1">
        <h4 className="text-[13px] font-semibold dark:text-claude-darkText text-claude-text sm:text-sm">
          {title}
        </h4>
        {description ? (
          <p className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0 flex-none">{actions}</div> : null}
    </div>
    {children}
  </section>
);

export default SettingsSectionCard;
