import React from 'react';
import type { ConversationActionStatus } from './conversationActionStatus';
import ConversationActionButton from './ConversationActionButton';
import ConversationActionStatusBanner from './ConversationActionStatusBanner';

interface ConversationActionBarProps {
  zenModeEnabled: boolean;
  onToggleZenMode: () => void;
  onManualCompress?: () => void | Promise<void>;
  isManualCompressing?: boolean;
  onClearBroadcastBoard?: () => void | Promise<void>;
  onInterruptProcess?: () => void | Promise<void>;
  canInterruptProcess?: boolean;
  isClearingBroadcastBoard?: boolean;
  isInterruptingProcess?: boolean;
  activeStatus?: ConversationActionStatus | null;
}

const ConversationActionBar: React.FC<ConversationActionBarProps> = ({
  zenModeEnabled,
  onToggleZenMode,
  onManualCompress,
  isManualCompressing = false,
  onClearBroadcastBoard,
  onInterruptProcess,
  canInterruptProcess = false,
  isClearingBroadcastBoard = false,
  isInterruptingProcess = false,
  activeStatus = null,
}) => {
  const isAnyActionPending = isManualCompressing || isClearingBroadcastBoard || isInterruptingProcess;

  return (
    <div className="mb-3 flex flex-col gap-2 px-1">
      {activeStatus && <ConversationActionStatusBanner status={activeStatus} />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ConversationActionButton
          shortLabel={zenModeEnabled ? '禅' : '常'}
          label={zenModeEnabled ? '禅模式开' : '禅模式关'}
          tone={zenModeEnabled ? 'emerald' : 'neutral'}
          onClick={onToggleZenMode}
          title={zenModeEnabled ? '禅模式已开启：关闭广播板读写' : '开启禅模式：关闭广播板读写'}
          ariaPressed={zenModeEnabled}
        />
        {onManualCompress && (
          <ConversationActionButton
            shortLabel={isManualCompressing ? '候' : '压'}
            label={isManualCompressing ? '正在压缩...' : '手工压缩'}
            tone="sky"
            onClick={onManualCompress}
            title={isManualCompressing ? '正在压缩当前会话上下文，请稍等' : '手工压缩当前会话上下文'}
            pending={isManualCompressing}
            disabled={isAnyActionPending}
          />
        )}
        {onClearBroadcastBoard && (
          <ConversationActionButton
            shortLabel={isClearingBroadcastBoard ? '候' : '清'}
            label={isClearingBroadcastBoard ? '正在清空...' : '清空广播板'}
            tone="rose"
            onClick={onClearBroadcastBoard}
            title={isClearingBroadcastBoard ? '正在清空当前角色广播板，请稍等' : '清空当前角色的广播板'}
            pending={isClearingBroadcastBoard}
            disabled={isAnyActionPending}
          />
        )}
        {onInterruptProcess && (
          <ConversationActionButton
            shortLabel={isInterruptingProcess ? '候' : '断'}
            label={isInterruptingProcess ? '正在打断...' : '错误进程打断'}
            tone={canInterruptProcess ? 'amber' : 'muted'}
            onClick={onInterruptProcess}
            title={isInterruptingProcess ? '正在请求打断当前进程，请稍等' : '打断当前错误或卡住的进程'}
            pending={isInterruptingProcess}
            disabled={!canInterruptProcess || isAnyActionPending}
          />
        )}
      </div>
    </div>
  );
};

export default ConversationActionBar;
