import type { ConversationActionStatusAccent } from './conversationActionStatus';

export type ConversationActionButtonTone =
  | 'neutral'
  | 'emerald'
  | 'sky'
  | 'rose'
  | 'amber'
  | 'muted';

export const conversationActionStatusToneClassMap: Record<ConversationActionStatusAccent, string> = {
  sky: 'border-sky-200/80 bg-sky-50/92 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200',
  rose: 'border-rose-200/80 bg-rose-50/92 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
  amber: 'border-amber-200/80 bg-amber-50/92 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
  emerald: 'border-emerald-200/80 bg-emerald-50/92 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
};

export const conversationActionButtonToneClassMap: Record<ConversationActionButtonTone, string> = {
  neutral: 'border border-white/25 bg-white/60 text-[#7A7065] hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60 dark:hover:bg-white/[0.08]',
  emerald: 'border border-emerald-300/60 bg-emerald-50/85 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/16',
  sky: 'border border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/16',
  rose: 'border border-rose-200/70 bg-rose-50/85 text-rose-700 hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200 dark:hover:bg-rose-400/16',
  amber: 'border border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/16',
  muted: 'border border-white/20 bg-white/55 text-[#a59c93] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/35',
};
