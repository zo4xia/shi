import React, { useEffect, useMemo, useState } from 'react';
import { ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface EmbeddedBrowserModalProps {
  title: string;
  url: string;
  onClose: () => void;
}

const EmbeddedBrowserModal: React.FC<EmbeddedBrowserModalProps> = ({ title, url, onClose }) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setIsLoading(true);
  }, [url]);

  const openInBrowser = useMemo(() => async () => {
    const openExternal = window.electron?.shell?.openExternal;
    if (typeof openExternal === 'function') {
      await openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md "
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="relative flex w-[min(92vw,1280px)] max-h-[88vh] flex-col overflow-hidden border border-claude-border dark:border-claude-darkBorder bg-claude-surface dark:bg-claude-darkSurface p-4 shadow-2xl"
        style={{
          borderRadius: 'calc(var(--uclaw-shell-radius) + 0.5rem)',
          aspectRatio: 'var(--uclaw-shell-aspect-ratio)',
        }}
      >
        <div className="pointer-events-none absolute -top-5 left-10 h-12 w-28 rounded-full bg-white/55 blur-xl dark:bg-fuchsia-200/10" />
        <div className="pointer-events-none absolute -right-4 top-10 h-28 w-28 rounded-full bg-sky-200/40 blur-2xl dark:bg-sky-400/10" />
        <div className="pointer-events-none absolute -bottom-4 left-1/2 h-12 w-40 -translate-x-1/2 rounded-full bg-rose-200/50 blur-2xl dark:bg-violet-300/10" />

        <div className="pointer-events-none flex items-center justify-between px-5 pt-1">
          <div className="h-3 w-16 rounded-full bg-white/60 shadow-inner dark:bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-rose-300/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(251,113,133,0.35)] dark:bg-rose-400/80" />
            <div className="h-3 w-3 rounded-full bg-amber-200/95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.82),0_2px_6px_rgba(251,191,36,0.26)] dark:bg-amber-300/80" />
            <div className="h-3 w-3 rounded-full bg-sky-300/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(56,189,248,0.28)] dark:bg-sky-400/80" />
          </div>
        </div>

        <div className="relative mt-2 flex flex-1 flex-col overflow-hidden rounded-[1.8rem] border border-claude-border dark:border-claude-darkBorder bg-claude-surface dark:bg-claude-darkSurface">
          <div className="flex items-center justify-between gap-3 border-b border-white/55 px-5 py-3 dark:border-white/10">
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-rose-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:bg-white/8 dark:text-rose-200">
                <span className="text-xs">✦</span>
                <span>BLINGBLING 小眼睛</span>
              </div>
              <h3 className="truncate text-sm font-semibold text-claude-text dark:text-claude-darkText">{title}</h3>
              <p className="truncate text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">{url}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-full bg-white/65 px-3 py-1 text-[11px] font-medium text-violet-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:bg-white/8 dark:text-violet-200 md:block">
                小电视模式
              </div>
              <button
                type="button"
                onClick={() => void openInBrowser()}
                className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-claude-textSecondary shadow-[0_6px_14px_rgba(255,194,214,0.2),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all hover:-translate-y-0.5 hover:bg-white hover:text-claude-accent dark:border-white/10 dark:bg-white/8 dark:text-claude-darkTextSecondary dark:shadow-none dark:hover:bg-white/12 dark:hover:text-claude-accent"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                <span>{'打开'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭弹窗"
                title="关闭弹窗"
                className="rounded-full border border-white/60 bg-white/70 p-1.5 text-claude-textSecondary shadow-[0_6px_14px_rgba(255,194,214,0.2),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all hover:-translate-y-0.5 hover:bg-white hover:text-claude-text dark:border-white/10 dark:bg-white/8 dark:text-claude-darkTextSecondary dark:shadow-none dark:hover:bg-white/12 dark:hover:text-claude-darkText"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="relative flex-1 p-4">
            <div className="absolute inset-x-10 top-2 h-5 rounded-full bg-white/70 blur-xl dark:bg-white/6" />
            <div className="relative flex h-full flex-col overflow-hidden rounded-[1.6rem] border dark:border-claude-darkBorder border-claude-border">
              <div className="pointer-events-none absolute left-4 top-4 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(74,222,128,0.55)] dark:bg-emerald-400" />
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-claude-surface/80 dark:bg-claude-darkSurface/80 text-sm text-claude-textSecondary backdrop-blur-sm dark:text-claude-darkTextSecondary">
                  <div className="rounded-[1.25rem] border border-white/70 bg-white/75 px-5 py-3 text-center shadow-[0_12px_30px_rgba(255,186,211,0.2)] dark:border-white/10 dark:bg-white/6 dark:shadow-none">
                    <div className="mb-1 text-base">🫧</div>
                    <div className="font-medium">小眼睛正在眨一眨</div>
                    <div className="mt-1 text-xs opacity-75">把页面轻轻装进小电视里...</div>
                  </div>
                </div>
              )}
              <iframe
                title={title}
                src={url}
                className="h-full w-full rounded-[0.95rem] border-0 bg-white"
                referrerPolicy="no-referrer"
                onLoad={() => setIsLoading(false)}
              />
            </div>
          </div>

          <div className="pointer-events-none flex items-center justify-between px-8 pb-4 pt-1">
            <div className="h-3 w-14 rounded-full bg-rose-200/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:bg-rose-300/15" />
            <div className="h-4 w-24 rounded-full bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:bg-white/8" />
            <div className="h-3 w-14 rounded-full bg-sky-200/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:bg-sky-300/15" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedBrowserModal;

