import React from 'react';
import { Card, type CardProps } from '../ui/Card';

export type AppCardProps = CardProps;

export const AppCard: React.FC<AppCardProps> = (props) => {
  return <Card {...props} />;
};

export default AppCard;
