import React from 'react';

type SettingsFieldGroupProps = {
  label: string;
  labelFor?: string;
  helper?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const SettingsFieldGroup: React.FC<SettingsFieldGroupProps> = ({
  label,
  labelFor,
  helper,
  children,
  className = '',
}) => (
  <div className={`space-y-2 ${className}`.trim()}>
    <div className="space-y-1">
      <label
        htmlFor={labelFor}
        className="text-sm font-medium dark:text-claude-darkText text-claude-text"
      >
        {label}
      </label>
      {helper ? (
        <p className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary leading-5">
          {helper}
        </p>
      ) : null}
    </div>
    <div className="grid gap-1">
      {children}
    </div>
  </div>
);

export default SettingsFieldGroup;
