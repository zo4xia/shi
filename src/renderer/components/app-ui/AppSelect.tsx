import React from 'react';
import ThemedSelect from '../ui/ThemedSelect';

export interface AppSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  label?: string;
}

export const AppSelect: React.FC<AppSelectProps> = (props) => {
  return <ThemedSelect {...props} />;
};

export default AppSelect;