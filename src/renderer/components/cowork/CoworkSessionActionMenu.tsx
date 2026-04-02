import React from 'react';
import { ShareIcon } from '@heroicons/react/24/outline';
import PencilSquareIcon from '../icons/PencilSquareIcon';
import TrashIcon from '../icons/TrashIcon';

const PushPinIcon: React.FC<React.SVGProps<SVGSVGElement> & { slashed?: boolean }> = ({
  slashed,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <g transform="rotate(45 12 12)">
      <path d="M9 3h6l-1 5 2 2v2H8v-2l2-2-1-5z" />
      <path d="M12 12v9" />
    </g>
    {slashed && <path d="M5 5L19 19" />}
  </svg>
);

interface CoworkSessionActionMenuProps {
  top: number;
  left: number;
  pinned: boolean;
  isExportingImage: boolean;
  onRename: React.MouseEventHandler<HTMLButtonElement>;
  onTogglePin: React.MouseEventHandler<HTMLButtonElement>;
  onShare: React.MouseEventHandler<HTMLButtonElement>;
  onExportMarkdown: React.MouseEventHandler<HTMLButtonElement>;
  onDelete: React.MouseEventHandler<HTMLButtonElement>;
}

const CoworkSessionActionMenu = React.forwardRef<HTMLDivElement, CoworkSessionActionMenuProps>(
  (
    {
      top,
      left,
      pinned,
      isExportingImage,
      onRename,
      onTogglePin,
      onShare,
      onExportMarkdown,
      onDelete,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[180px] rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-popover popover-enter overflow-hidden"
        style={{ top, left }}
        role="menu"
      >
        <button
          type="button"
          onClick={onRename}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
        >
          <PencilSquareIcon className="h-4 w-4" />
          {'重命名'}
        </button>
        <button
          type="button"
          onClick={onTogglePin}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
        >
          <PushPinIcon
            slashed={pinned}
            className={`h-4 w-4 ${pinned ? 'opacity-60' : ''}`}
          />
          {pinned ? '取消置顶' : '置顶任务'}
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={isExportingImage}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShareIcon className="h-4 w-4" />
          {'分享'}
        </button>
        <button
          type="button"
          onClick={onExportMarkdown}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
        >
          <ShareIcon className="h-4 w-4" />
          {'导出 Markdown'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <TrashIcon className="h-4 w-4" />
          {'删除任务'}
        </button>
      </div>
    );
  }
);

CoworkSessionActionMenu.displayName = 'CoworkSessionActionMenu';

export default CoworkSessionActionMenu;
