import React from 'react';
import { Button, type ButtonProps } from '../ui/Button';

export type AppButtonProps = ButtonProps;

export const AppButton: React.FC<AppButtonProps> = (props) => {
  return <Button {...props} />;
};

export default AppButton;
