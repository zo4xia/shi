import React, { useEffect, useState } from 'react';

interface EmbeddedIframeViewProps {
  title: string;
  url: string;
}

/**
 * 隐藏 iframe 滚动条的原理：
 * iframe 内部是跨域页面，外部 CSS 无法穿透。
 * 所以让 iframe 比容器宽 20px，滚动条被推到右侧不可见区域，
 * 外层 overflow:hidden 裁掉。用户能正常滚动但看不到滚动条。
 */
const EmbeddedIframeView: React.FC<EmbeddedIframeViewProps> = ({ title, url }) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
  }, [url]);

  return (
    <div
      className="embedded-iframe-view relative h-full w-full overflow-hidden rounded-b-[var(--uclaw-shell-radius)]"
    >
      {/* {BREAKPOINT} IFRAME-EMBED-VIEW
          {FLOW} IFRAME-CROSS-ORIGIN-SHELL: 这里承载跨域 iframe；若出现“内容不显示 / 浏览器报错很多”，优先排查站点响应头、X-Frame-Options/CSP、referrerPolicy 与目标站可嵌入性。 */}
      {/* iframe 容器 — 右侧多出 SCROLLBAR_GUTTER 被裁掉 */}
      <div
        className="absolute inset-0 overflow-hidden rounded-b-[var(--uclaw-shell-radius)]"
      >
        <iframe
          title={title}
          src={url}
          className="absolute top-0 left-0 h-full border-0 w-[calc(100%+20px)] rounded-b-[var(--uclaw-shell-radius)]"
          referrerPolicy="no-referrer"
          onLoad={() => {
            setIsLoading(false);
          }}
        />
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-pearl-100 dark:bg-claude-darkBg rounded-b-[var(--uclaw-shell-radius)]"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-7 h-7 border-2 border-claude-accent/20 border-t-claude-accent rounded-full animate-spin" />
            <span className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary tracking-wide">{'加载中...'}</span>
          </div>
        </div>
      )}

      {/* Banner overlay */}
      <div
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none h-[132px]"
      >
        <div
          className="absolute inset-0 rounded-b-[var(--uclaw-shell-radius)] [backdrop-filter:blur(24px)_saturate(140%)] [-webkit-backdrop-filter:blur(24px)_saturate(140%)] [background:linear-gradient(to_bottom,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0.18)_18%,rgba(255,255,255,0.08)_42%,rgba(255,255,255,0.03)_64%,rgba(255,255,255,0.01)_80%,transparent_100%)] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,0.98)_34%,rgba(0,0,0,0.76)_62%,rgba(0,0,0,0.28)_84%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,0.98)_34%,rgba(0,0,0,0.76)_62%,rgba(0,0,0,0.28)_84%,transparent_100%)]"
        />
        <div
          className="absolute inset-0 opacity-80 rounded-b-[var(--uclaw-shell-radius)] [background:linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.06)_34%,transparent_100%)]"
        />
        <div
          className="absolute inset-x-0 top-0 h-20 opacity-75 [background:radial-gradient(120%_90%_at_50%_0%,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0.12)_36%,rgba(255,255,255,0.03)_62%,transparent_100%)]"
        />
        <div
          className="absolute inset-x-0 top-0 h-px bg-white/40 dark:bg-white/16 [box-shadow:0_1px_18px_rgba(255,255,255,0.18)]"
        />
        <div className="relative h-16 pointer-events-none" />
      </div>
    </div>
  );
};

export default EmbeddedIframeView;
