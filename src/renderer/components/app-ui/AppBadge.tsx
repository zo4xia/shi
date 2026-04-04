import React from 'react';
import { Badge, type BadgeProps } from '../ui/Badge';

export type AppBadgeProps = BadgeProps;

export const AppBadge: React.FC<AppBadgeProps> = (props) => {
  return <Badge {...props} />;
};

export default AppBadge;
