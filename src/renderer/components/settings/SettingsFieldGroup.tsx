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
    <div>
      <label
        htmlFor={labelFor}
        className="block text-sm font-medium dark:text-claude-darkText text-claude-text mb-1"
      >
        {label}
      </label>
      {helper ? (
        <p className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary leading-5">
          {helper}
        </p>
      ) : null}
    </div>
    {children}
  </div>
);

export default SettingsFieldGroup;
