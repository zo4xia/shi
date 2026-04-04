import React from 'react';
import { UI_META_TEXT_CLASS, UI_SURFACE_COMPACT_GAP_CLASS } from '../../shared/mobileUi';
import SidebarCompactTile, { type SidebarCompactTileItem } from './SidebarCompactTile';

interface SidebarCompactGridProps {
  title: string;
  items: SidebarCompactTileItem[];
}

const SidebarCompactGrid: React.FC<SidebarCompactGridProps> = ({
  title,
  items,
}) => {
  return (
    <div>
      <div className={`mb-2 px-1 text-claude-textSecondary/85 dark:text-claude-darkTextSecondary/85 ${UI_META_TEXT_CLASS}`}>
        {title}
      </div>
      <div className={`grid grid-cols-2 auto-rows-fr ${UI_SURFACE_COMPACT_GAP_CLASS}`}>
        {items.map((item) => (
          <SidebarCompactTile key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
};

export default SidebarCompactGrid;
