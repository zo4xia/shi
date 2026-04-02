import React from 'react';
import { Badge, type BadgeProps } from '../ui/Badge';

export interface AppBadgeProps extends BadgeProps {}

export const AppBadge: React.FC<AppBadgeProps> = (props) => {
  return <Badge {...props} />;
};

export default AppBadge;