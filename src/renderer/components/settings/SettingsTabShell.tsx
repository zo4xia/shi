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
  mobileClassName = 'space-y-4 sm:space-y-5',
  desktopClassName = 'grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-max',
}) => {
  // {标记} UI-UX-PRO-RESPONSIVE: 响应式卡片网格
  // 移动端: space-y-4 | md: 2列 gap-4 | lg: 3列 gap-5
  // auto-rows-max 避免内容拉伸，保证卡片独立高度
  const className = isMobileViewport ? mobileClassName : desktopClassName;

  return <div className={className}>{children}</div>;
};

export default SettingsTabShell;
