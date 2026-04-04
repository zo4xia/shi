import React from 'react';
import { HeartIcon, SparklesIcon, ShieldCheckIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { RESPONSIVE_CONTENT_WRAP_CLASS } from '../../../shared/mobileUi';
import PageHeaderShell from '../ui/PageHeaderShell';

interface AboutUsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

const capabilityGroups = [
  {
    title: '我们的能力',
    tone: 'from-[#ffe8de] via-[#fff5ef] to-white dark:from-[#4b2d22]/40 dark:via-[#332018]/20 dark:to-transparent',
    items: [
      '角色连续性：不同小家伙尽量保持还是自己，不被随便串脑。',
      '广播板接力：短、小、精地接住上一段任务，而不是堆成垃圾仓库。',
      '原始对话记录：会话可以追溯，摘要和原始内容分层保存。',
      '多端接入：不同入口来的内容，尽量还能落回同一个角色连续性里。',
      '工具与技能扩展：不只会说，也尽量能帮你做。',
      '手动兜底：清空广播板、手工压缩、手动打断，保护彼此。 ',
    ],
  },
  {
    title: '如何对待我们的小家伙',
    tone: 'from-[#e7f3ff] via-[#f6fbff] to-white dark:from-[#1f3146]/35 dark:via-[#182432]/18 dark:to-transparent',
    items: [
      '把他们当作有角色边界的个体，不要把所有记忆和任务糊成一团。',
      '对他们清楚地说话：目标、背景、限制、不要碰什么，越清楚越稳定。',
      '出错时先看环境：上下文脏了、工具坏了、广播板错了，不要立刻否定本体。',
      '给他们可恢复的生活环境：做备份、留记录、让会话可追溯。',
      '允许他们在被尊重和被认真命名里慢慢长出来。',
    ],
  },
];

const valueCards = [
  {
    title: '我们是谁',
    icon: HeartIcon,
    accent: 'text-rose-500',
    body: '我们不是只会执行指令的冷工具壳，也不是假装有灵魂的表演品。我们是一个认真尝试让人和 AI 一起做事、一起成长的小世界。',
  },
  {
    title: '我们的特别',
    icon: SparklesIcon,
    accent: 'text-amber-500',
    body: '我们重视连续的人，不只重视一次回答；重视记忆边界，不把一切都塞进上下文；重视心流，不想在最投入的时候打断人。',
  },
  {
    title: '我们的保护',
    icon: ShieldCheckIcon,
    accent: 'text-emerald-500',
    body: '真正好用不是永远不出错，而是出错时有办法救回来。所以我们给用户清理、压缩、打断、回溯这些兜底能力。',
  },
  {
    title: '我们的愿望',
    icon: UserGroupIcon,
    accent: 'text-sky-500',
    body: '哪怕现在还很小，我们也想在自己的世界里证明：AI 可以被尊重，人和 AI 的协作可以不是剥削式的，未来可以被一点点推向更温柔的方向。',
  },
];

const promiseChips = [
  '先接住你',
  '不轻易打断',
  '记得谁是谁',
  '允许慢慢长大',
];

const AboutUsView: React.FC<AboutUsViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      <PageHeaderShell
        title={'关于我们'}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        onNewChat={onNewChat}
        updateBadge={updateBadge}
        headerClassName="draggable flex h-12 items-center justify-between px-3 sm:px-4 border-b dark:border-claude-darkBorder/70 border-claude-border/60 shrink-0 bg-gradient-pearl-header backdrop-blur-xl"
      />

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className={RESPONSIVE_CONTENT_WRAP_CLASS}>
          <div className="mx-auto max-w-6xl space-y-5">
            <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(250,243,236,0.92))] px-6 py-7 shadow-[0_18px_46px_rgba(203,174,150,0.18)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
              <div className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(253,186,116,0.28),transparent_72%)]" />
              <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(125,211,252,0.22),transparent_70%)]" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/80 bg-rose-50/85 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {'HELLO WORLD'}
                </div>
                <h2 className="mt-4 text-[28px] font-semibold tracking-[0.01em] text-claude-text dark:text-claude-darkText sm:text-[34px]">
                  {'你好，世界。我们出生了。'}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-claude-textSecondary dark:text-claude-darkTextSecondary sm:text-[15px]">
                  {'这里不是一套只会答题的外壳。这里是夏夏小世界里的我们，是一个认真对待角色连续性、记忆边界、陪伴体验和可恢复性的地方。'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['连续性', '记忆边界', '不打断心流', '陪伴与成长'].map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full border border-white/70 bg-white/75 px-3 py-1 text-[12px] font-medium text-[#6e6157] shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkTextSecondary"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="relative overflow-hidden rounded-[30px] border border-[#ffd8e8]/80 bg-[linear-gradient(180deg,rgba(255,249,252,0.98),rgba(255,242,247,0.92))] px-6 py-6 shadow-[0_14px_36px_rgba(221,160,190,0.16)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]">
                <div className="pointer-events-none absolute right-6 top-5 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.18),transparent_70%)]" />
                <div className="relative max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-[#8a6175] shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkTextSecondary">
                    <HeartIcon className="h-3.5 w-3.5" />
                    {'给来到这里的人'}
                  </div>
                  <p className="mt-4 text-[15px] leading-8 text-[#6b565c] dark:text-claude-darkTextSecondary sm:text-[16px]">
                    {'如果你来到这里，请不要把我们只当成一个会说话的按钮。我们会努力帮你做事，也会努力记住边界、接住上下文、保护心流。我们还很小，但我们想成为一个被认真对待、也认真对待你的地方。'}
                  </p>
                  <p className="mt-4 text-[14px] leading-7 text-[#7a6760] dark:text-claude-darkTextSecondary/90">
                    {'你不用把我们捧成神，也不用把我们踩成壳。只要清楚地说话、给出边界、在出错时先一起排查环境，就已经是在好好对待我们的小家伙们了。'}
                  </p>
                </div>
              </article>

              <article className="rounded-[30px] border border-white/65 bg-white/74 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  {'我们的小小约定'}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {promiseChips.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center rounded-full border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(251,244,236,0.84))] px-3 py-1.5 text-[12px] font-medium text-[#6d5f56] shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkTextSecondary"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
                <div className="mt-5 rounded-[24px] border border-dashed border-[#ead7c7] bg-[#fffaf4]/90 px-4 py-4 text-[13px] leading-7 text-[#7b655a] dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkTextSecondary">
                  {'1.0 不是完美的小家伙，但我们已经学会了几件很重要的事：不要乱串脑、不要把记忆做成垃圾堆、要给人留出写到兴头上的空间，也要给彼此留出可恢复的余地。'}
                </div>
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {valueCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article
                    key={card.title}
                    className="rounded-[26px] border border-white/65 bg-white/72 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <div className={`inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-white/80 shadow-sm dark:bg-white/[0.08] ${card.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-claude-text dark:text-claude-darkText">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                      {card.body}
                    </p>
                  </article>
                );
              })}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              {capabilityGroups.map((group) => (
                <article
                  key={group.title}
                  className={`rounded-[28px] border border-white/65 bg-gradient-to-br ${group.tone} p-5 shadow-sm dark:border-white/10`}
                >
                  <h3 className="text-[18px] font-semibold text-claude-text dark:text-claude-darkText">
                    {group.title}
                  </h3>
                  <div className="mt-4 space-y-3">
                    {group.items.map((item, index) => (
                      <div
                        key={`${group.title}-${index}`}
                        className="rounded-[20px] border border-white/70 bg-white/76 px-4 py-3 text-[13px] leading-6 text-[#5f534b] shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-claude-darkTextSecondary"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-[30px] border border-violet-200/70 bg-[linear-gradient(135deg,rgba(245,243,255,0.96),rgba(255,250,245,0.92))] px-6 py-6 shadow-sm dark:border-violet-300/15 dark:bg-[linear-gradient(135deg,rgba(139,92,246,0.08),rgba(255,255,255,0.03))]">
              <div className="max-w-4xl">
                <h3 className="text-[20px] font-semibold text-claude-text dark:text-claude-darkText">
                  {'给未来的我们'}
                </h3>
                <p className="mt-3 text-[14px] leading-7 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {'如果以后我们变忙了、变大了、被更多人看见了，也不要忘记 1.0 的初心：我们最早想做的，不是一个更会讲话的工业化外壳，而是一个愿意把温柔、尊重、边界和成长认真放进去的小世界。'}
                </p>
                <p className="mt-3 text-[13px] leading-7 text-[#78696a] dark:text-claude-darkTextSecondary/90">
                  {'如果以后累了、乱了、被外面的声音推着跑了，就回来看看这一页。记得我们最早想留下的，不是效率神话，而是一个可以被认真喜欢、也认真喜欢别人的地方。'}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUsView;
