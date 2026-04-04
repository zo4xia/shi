import React from 'react';
import type { ConversationActionStatus } from './conversationActionStatus';
import { conversationActionStatusToneClassMap } from './conversationActionStyles';

interface ConversationActionStatusBannerProps {
  status: ConversationActionStatus;
}

const ConversationActionStatusBanner: React.FC<ConversationActionStatusBannerProps> = ({ status }) => {
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] shadow-sm backdrop-blur-sm ${conversationActionStatusToneClassMap[status.accent]}`}>
      <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/70 text-[10px] font-semibold dark:bg-white/10">
        候
      </span>
      <div className="min-w-0">
        <div className="font-semibold">{status.label}</div>
        <div className="mt-0.5 leading-4 opacity-90">{status.description}</div>
      </div>
    </div>
  );
};

export default ConversationActionStatusBanner;
