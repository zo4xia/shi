export const TOUCH_TARGET_CLASS = 'min-h-11 min-w-11';
export const UI_SURFACE_GAP_CLASS = 'gap-3';
export const UI_SURFACE_COMPACT_GAP_CLASS = 'gap-2.5';
export const UI_SECTION_PADDING_CLASS = 'px-3 pb-3 pt-3';
export const UI_SECTION_CONTENT_CLASS = 'px-3 pb-3';
export const UI_MENU_ICON_CLASS = 'h-4 w-4';
export const UI_MARK_ICON_CLASS = 'h-3.5 w-3.5';
export const UI_BADGE_ICON_CLASS = 'h-3 w-3';
export const UI_BADGE_TEXT_CLASS = 'text-[10px] font-semibold tracking-[0.08em]';
export const UI_LABEL_TEXT_CLASS = 'text-[12px] font-semibold leading-4';
export const UI_META_TEXT_CLASS = 'text-[10px] font-semibold uppercase tracking-[0.18em]';

// [FLOW] Unified main content width for top-level views (Skills/MCP/ScheduledTasks).
export const RESPONSIVE_CONTENT_WRAP_CLASS = 'w-full max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6';

// [FLOW] Horizontal alignment helper when a page manages its own vertical spacing.
export const RESPONSIVE_CONTENT_INNER_CLASS = 'w-full max-w-7xl mx-auto px-3 sm:px-4';

export const getResponsiveTabBarClass = (borderClass: string): string => (
  `flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b ${borderClass}`
);

export const getResponsivePageTitleClass = (colorClass: string): string => (
  `truncate text-base sm:text-lg font-semibold ${colorClass}`
);

export const getTouchButtonClass = (baseClass: string): string => (
  `${TOUCH_TARGET_CLASS} ${baseClass}`
);

export const getResponsiveTabButtonClass = (stateClass: string): string => (
  `relative ${TOUCH_TARGET_CLASS} shrink-0 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${stateClass}`
);
