import React from 'react';

interface TrialAccessGateProps {
  isOpen: boolean;
  code: string;
  currentDay: string;
  isSubmitting: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const TrialAccessGate: React.FC<TrialAccessGateProps> = ({
  isOpen,
  code,
  currentDay,
  isSubmitting,
  error,
  onChange,
  onSubmit,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(22,17,13,0.56)] px-4 backdrop-blur-[5px]">
      <div className="w-full max-w-md rounded-[30px] border border-[#eadccf] bg-[#fff8f1] p-6 shadow-[0_28px_90px_rgba(93,72,52,0.22)] dark:border-white/10 dark:bg-[#26221e]">
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b07a44] dark:text-[#f0c28c]">
            UCLAW PREVIEW
          </div>
          <div className="mt-3 text-[20px] font-semibold tracking-[-0.01em] text-[#4E453D] dark:text-claude-darkText">
            uclaw v1 商业预览版
          </div>
          <div className="mt-2 text-[12px] leading-6 text-[#8B7D71] dark:text-claude-darkTextSecondary/80">
            pin码
          </div>
          <div className="mt-2 text-[11px] leading-5 text-[#a18f81] dark:text-claude-darkTextSecondary/70">
            {currentDay ? `今日批次：${currentDay}` : '正在同步今日批次...'}
          </div>
        </div>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isSubmitting) {
              onSubmit();
            }
          }}
        >
          <label className="block text-sm font-medium text-[#5b4e43] dark:text-claude-darkText">
            pin码
          </label>
          <input
            autoFocus
            type="password"
            value={code}
            onChange={(event) => onChange(event.target.value)}
            placeholder="输入 pin码"
            className="w-full rounded-2xl border border-[#e7d7c7] bg-white px-4 py-3 text-center text-base tracking-[0.18em] text-[#5b4e43] shadow-inner outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/70 dark:border-white/10 dark:bg-[#1b1815] dark:text-claude-darkText dark:focus:border-amber-300/30 dark:focus:ring-amber-300/10"
          />
          <div className="min-h-[22px] text-center text-[11px] leading-5 text-red-500 dark:text-red-300">
            {error || ' '}
          </div>
          <div className="text-center text-[11px] leading-5 text-[#8B7D71] dark:text-claude-darkTextSecondary/80">
            pin码申请 @微信号 作者
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[#5f5248] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#554940] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#f2e7db] dark:text-[#453930] dark:hover:bg-[#f6ede4]"
          >
            {isSubmitting ? '验证中...' : '进入预览'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TrialAccessGate;
