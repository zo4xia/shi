import React from 'react';
import Tooltip from '../ui/Tooltip';

export interface AppTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  maxWidth?: string;
  disabled?: boolean;
}

export const AppTooltip: React.FC<AppTooltipProps> = (props) => {
  return <Tooltip {...props} />;
};

export default AppTooltip;