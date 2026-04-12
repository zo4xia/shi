/**
 * FeedbackButton — 右上角浮动"反馈与建议"按钮
 * 点击弹出文本框，发送到企业微信 webhook
 */
import { useState, useRef } from 'react';
import { UI_MARK_ICON_CLASS } from '../../shared/mobileUi';

type FeedbackButtonProps = {
  buttonClassName?: string;
  panelClassName?: string;
  iconOnly?: boolean;
};

const WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=27d03f89-4bbc-4cb9-91e7-db550a945902';

export default function FeedbackButton({ buttonClassName = '', panelClassName = '', iconOnly = false }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'text',
            text: { content: `[UCLAW 用户反馈]\n${text.trim()}\n\n时间: ${new Date().toLocaleString('zh-CN')}` },
          }),
        }),
      });
      setSent(true);
      setText('');
      setTimeout(() => { setSent(false); setIsOpen(false); }, 1500);
    } catch {
      alert('发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setSent(false); }}
        className={`inline-flex items-center gap-1.5 rounded-full bg-claude-accent/90 px-3.5 py-1.5 text-sm font-medium
          leading-none text-white shadow-md transition-colors hover:bg-claude-accent
          whitespace-nowrap backdrop-blur-sm ${buttonClassName}`}
        data-feedback-button="true"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`${UI_MARK_ICON_CLASS} opacity-90`}>
          <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 001.28.53l3.58-3.579a.78.78 0 01.527-.224 41.202 41.202 0 005.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zm0 7a1 1 0 100-2 1 1 0 000 2zM8 8a1 1 0 11-2 0 1 1 0 012 0zm5 1a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        {!iconOnly && '反馈'}
      </button>

      {isOpen && (
        <div className={`absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-2xl
          dark:border-claude-darkBorder border-claude-border
          dark:bg-claude-darkSurface bg-claude-surface ${panelClassName}`}>
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <span className="text-sm font-medium dark:text-claude-darkText text-claude-text">
              反馈与建议
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="关闭反馈面板"
              title="关闭反馈面板"
              className="p-1 rounded-md text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-text dark:hover:text-claude-darkText hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          <div className="px-4 pb-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="说说你的想法、遇到的问题或改进建议..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border dark:border-claude-darkBorder border-claude-border
                dark:bg-claude-darkBg bg-claude-bg text-sm dark:text-claude-darkText text-claude-text
                placeholder:text-claude-textSecondary dark:placeholder:text-claude-darkTextSecondary
                focus:outline-none focus:ring-2 focus:ring-claude-accent/50 resize-none"
              autoFocus
            />
            <div className="mt-2 flex justify-end">
              {sent ? (
                <span className="text-sm text-green-500 font-medium">已发送，感谢反馈！</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    text.trim() && !sending
                      ? 'bg-claude-accent text-white hover:bg-claude-accent/90'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {sending ? '发送中...' : '发送'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
