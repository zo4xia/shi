import React from 'react';
import { Modal, type ModalProps } from '../ui/Modal';

export interface AppModalProps extends ModalProps {}

export const AppModal: React.FC<AppModalProps> = (props) => {
  return <Modal {...props} />;
};

export default AppModal;