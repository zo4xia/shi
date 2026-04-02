import React from 'react';

type SettingsTabShellProps = {
  isMobileViewport: boolean;
  children: React.ReactNode;
  mobileClassName?: string;
  desktopClassName?: string;
};

const SettingsTabShell: React.FC<SettingsTabShellProps> = ({
  isMobileViewport,
  children,
  mobileClassName = 'space-y-4',
  desktopClassName = 'grid grid-cols-2 gap-4 xl:gap-5',
}) => {
  const className = isMobileViewport ? mobileClassName : desktopClassName;

  return <div className={className}>{children}</div>;
};

export default SettingsTabShell;
