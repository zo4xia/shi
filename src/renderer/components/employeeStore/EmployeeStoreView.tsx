import React from 'react';
import { ShoppingBagIcon } from '@heroicons/react/24/outline';
import { RESPONSIVE_CONTENT_WRAP_CLASS } from '../../../shared/mobileUi';
import PageHeaderShell from '../ui/PageHeaderShell';

interface EmployeeStoreViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const EmployeeStoreView: React.FC<EmployeeStoreViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      <PageHeaderShell
        title={'Agent 商店'}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
        headerClassName="draggable flex h-12 items-center justify-between px-3 sm:px-4 border-b dark:border-claude-darkBorder/70 border-claude-border/60 shrink-0 bg-gradient-pearl-header backdrop-blur-xl"
      />

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className={RESPONSIVE_CONTENT_WRAP_CLASS}>
          {/* [FLOW] 雇员商店先交付为遮罩占位页，文案和结构提前就位，避免后续再拆侧边栏导航。 */}
          <div className="mx-auto max-w-5xl space-y-5">
            <div className="rounded-[28px] border dark:border-white/10 border-black/5 bg-white/62 dark:bg-white/[0.04] px-5 py-5 shadow-sm backdrop-blur-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-amber-700 dark:text-amber-300 dark:bg-amber-500/15">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {'COMING SOON'}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#f5eee5] to-[#f8f4ef] text-amber-600 shadow-sm dark:from-white/[0.08] dark:to-white/[0.03] dark:text-amber-300">
                  <ShoppingBagIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-[0.01em] dark:text-claude-darkText text-claude-text">
                    {'Agent 商店'}
                  </h2>
                  <p className="mt-1 text-sm leading-6 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'开箱即用、已经整理好的特色伙伴与能力组合，会在这里逐步上架。'}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[30px] border dark:border-white/10 border-black/5 bg-gradient-to-br from-white/66 via-white/58 to-[#f8f3ec]/72 dark:from-white/[0.04] dark:via-white/[0.03] dark:to-white/[0.02] min-h-[400px] shadow-sm">
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.10),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.08),transparent_24%)]" />
              <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-[22px] border dark:border-white/8 border-black/5 dark:bg-white/[0.03] bg-white/46 p-4 space-y-3 shadow-[0_6px_18px_rgba(90,82,72,0.05)]"
                  >
                    <div className="h-4 w-24 rounded-full dark:bg-white/10 bg-[#c9b8a5]/20" />
                    <div className="h-3 w-16 rounded-full dark:bg-white/10 bg-[#c9b8a5]/18" />
                    <div className="space-y-2 pt-2">
                      <div className="h-3 w-full rounded-full dark:bg-white/10 bg-[#c9b8a5]/18" />
                      <div className="h-3 w-5/6 rounded-full dark:bg-white/10 bg-[#c9b8a5]/18" />
                      <div className="h-3 w-2/3 rounded-full dark:bg-white/10 bg-[#c9b8a5]/18" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[3px] bg-white/34 dark:bg-black/28">
                <div className="rounded-[28px] border dark:border-white/10 border-black/5 bg-white/82 dark:bg-claude-darkSurface/82 px-8 py-7 text-center shadow-xl">
                  <p className="text-lg font-semibold tracking-[0.01em] dark:text-claude-darkText text-claude-text">
                    {'敬请期待'}
                  </p>
                  <p className="mt-2 text-sm leading-6 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'特色伙伴与精选能力包正在整理中，后续会以更清楚的方式上架。'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeStoreView;
