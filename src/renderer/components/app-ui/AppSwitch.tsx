import React from 'react';
import { Switch, type SwitchProps } from '../ui/Switch';

export type AppSwitchProps = SwitchProps;

export const AppSwitch: React.FC<AppSwitchProps> = (props) => {
  return <Switch {...props} />;
};

export default AppSwitch;
