import { Cog6ToothIcon, SparklesIcon } from '@heroicons/react/24/solid';

type SettingsEntryButtonProps = {
  onClick: () => void;
  className?: string;
};

export default function SettingsEntryButton({ onClick, className = '' }: SettingsEntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="打开设置"
      title="设置"
      className={`group relative inline-flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-full border border-[#f4d8bf] bg-[linear-gradient(135deg,rgba(255,248,238,0.98),rgba(255,235,214,0.96))] px-3.5 text-[#5b4638] shadow-[0_10px_26px_rgba(214,161,107,0.18),inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#efc79f] hover:shadow-[0_14px_34px_rgba(214,161,107,0.24),inset_0_1px_0_rgba(255,255,255,0.92)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] dark:text-claude-darkText dark:shadow-[0_10px_24px_rgba(0,0,0,0.28)] dark:hover:border-white/15 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.08))] ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.85),transparent_42%)] opacity-70" />
      <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/75 text-[#df8b47] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:bg-white/[0.10] dark:text-amber-200">
        <Cog6ToothIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
      </span>
      <span className="relative text-sm font-semibold tracking-[0.01em]">设置</span>
      <span className="relative inline-flex h-5 items-center gap-1 rounded-full bg-[#fff4e8] px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c7783a] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:bg-white/[0.08] dark:text-amber-200">
        <SparklesIcon className="h-2.5 w-2.5" />
        Go
      </span>
    </button>
  );
}
