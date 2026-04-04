import React from 'react';
import { UI_LABEL_TEXT_CLASS } from '../../shared/mobileUi';

export interface SidebarCompactTileItem {
  key: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  shellClass: string;
  iconWrapClass: string;
}

interface SidebarCompactTileProps {
  item: SidebarCompactTileItem;
}

const SidebarCompactTile: React.FC<SidebarCompactTileProps> = ({ item }) => {
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`group min-h-[92px] rounded-[24px] border px-3 py-3 text-center transition-all duration-200 ${
        item.active
          ? `${item.shellClass} ring-2 ring-white/70 shadow-[0_10px_22px_rgba(203,174,150,0.16)] dark:ring-white/10`
          : `${item.shellClass} shadow-[0_6px_18px_rgba(203,174,150,0.10)]`
      }`}
    >
      <div className="flex h-full flex-col items-center justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${item.iconWrapClass}`}>
          {item.icon}
        </span>
        <span className={`block ${UI_LABEL_TEXT_CLASS}`}>
          {item.label}
        </span>
      </div>
    </button>
  );
};

export default SidebarCompactTile;
