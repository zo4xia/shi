export type CoworkRightDockActionIcon = 'jump-top' | 'jump-prev' | 'jump-bottom';

export interface CoworkRightDockAction {
  id: string;
  label: string;
  icon: CoworkRightDockActionIcon;
  onClick: () => void;
}
