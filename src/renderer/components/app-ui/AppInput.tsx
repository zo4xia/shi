import React from 'react';
import { Input, type InputProps } from '../ui/Input';

export type AppInputProps = InputProps;

export const AppInput: React.FC<AppInputProps> = (props) => {
  return <Input {...props} />;
};

export default AppInput;
