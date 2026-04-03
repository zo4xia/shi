import { showGlobalToast } from '../../services/toast';
import React, { useRef, useEffect, useState, useCallback, useMemo, useDeferredValue, startTransition } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import type { CoworkMessage, CoworkMessageMetadata, CoworkImageAttachment, CoworkRenderableImage } from '../../types/cowork';
import { getSkillDisplayName, type Skill } from '../../types/skill';
import CoworkPromptInput from './CoworkPromptInput';
import MarkdownContent from '../MarkdownContent';
import {
  CheckIcon,
  InformationCircleIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { FolderIcon } from '@heroicons/react/24/solid';
import { coworkService } from '../../services/cowork';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import PuzzleIcon from '../icons/PuzzleIcon';
import EllipsisHorizontalIcon from '../icons/EllipsisHorizontalIcon';
import WindowTitleBar from '../window/WindowTitleBar';
import { getCompactFolderName } from '../../utils/path';
import { WebFileOperations } from '../../utils/fileOperations';
import { isWebBuild } from '../../utils/platform';
import { configService } from '../../services/config';
import { renderAgentRoleAvatar } from '../../utils/agentRoleDisplay';
import {
  getAgentRoleDisplayAvatar,
  getAgentRoleDisplayLabel,
  resolveAgentRolesFromConfig,
  type AgentRoleKey,
} from '../../../shared/agentRoleConfig';
import * as SessionDetailHelpers from './sessionDetailHelpers';
import CoworkImagePreviewModal from './CoworkImagePreviewModal';
import CoworkSessionActionMenu from './CoworkSessionActionMenu';
import { inferSessionSource } from './sessionRecordUtils';
import {
  UI_LABEL_TEXT_CLASS,
  UI_MENU_ICON_CLASS,
  UI_META_TEXT_CLASS,
  getTouchButtonClass,
} from '../../../shared/mobileUi';
import type { CoworkRightDockAction } from './rightDock';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import { useIsMediumViewport } from '../../hooks/useIsMediumViewport';


interface CoworkSessionDetailProps {
  onManageSkills?: () => void;
  onContinue: (prompt: string, skillPrompt?: string, imageAttachments?: CoworkImageAttachment[]) => void;
  onStop: () => void;
  onNavigateHome?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
  onSetRightDockActions?: (actions: CoworkRightDockAction[]) => void;
}

// Local functions that are not in helpers
const getToolResultDisplay = (message: CoworkMessage): string => {
  if (SessionDetailHelpers.hasText(message.content)) {
    return message.content;
  }
  if (SessionDetailHelpers.hasText(message.metadata?.toolResult)) {
    return message.metadata?.toolResult ?? '';
  }
  if (SessionDetailHelpers.hasText(message.metadata?.error)) {
    return message.metadata?.error ?? '';
  }
  return '';
};

type AssistantSurfaceTone = 'reply' | 'thinking' | 'tool' | 'system' | 'error';

const ASSISTANT_SURFACE_STYLES: Record<AssistantSurfaceTone, string> = {
  reply: 'border-emerald-500/20 bg-emerald-500/[0.04] shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]',
  thinking: 'border-dashed border-amber-500/25 bg-amber-500/[0.035] shadow-none dark:border-amber-300/20 dark:bg-amber-300/[0.06]',
  tool: 'border-dashed border-sky-500/25 bg-sky-500/[0.035] shadow-none dark:border-sky-300/20 dark:bg-sky-300/[0.06]',
  system: 'border-dashed border-slate-500/20 bg-slate-500/[0.035] shadow-none dark:border-slate-300/15 dark:bg-slate-300/[0.05]',
  error: 'border-dashed border-red-500/25 bg-red-500/[0.035] shadow-none dark:border-red-300/20 dark:bg-red-300/[0.06]',
};

const ASSISTANT_BADGE_STYLES: Record<AssistantSurfaceTone, string> = {
  reply: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/15 dark:text-emerald-200',
  thinking: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/15 dark:text-amber-200',
  tool: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/15 dark:text-sky-200',
  system: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:border-slate-300/20 dark:bg-slate-300/15 dark:text-slate-200',
  error: 'border-red-500/25 bg-red-500/10 text-red-700 dark:border-red-300/20 dark:bg-red-300/15 dark:text-red-200',
};

const AssistantSectionBadge: React.FC<{
  label: string;
  tone: AssistantSurfaceTone;
  detail?: string | null;
  pulse?: boolean;
}> = ({ label, tone, detail, pulse = false }) => (
  <div className="mb-2 flex flex-wrap items-center gap-2">
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium leading-none ${ASSISTANT_BADGE_STYLES[tone]}`}>
      {pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {label}
    </span>
    {detail ? (
      <span className="text-[11px] leading-none dark:text-claude-darkTextSecondary/80 text-claude-textSecondary/80">
        {detail}
      </span>
    ) : null}
  </div>
);

const runWhenIdle = (task: () => void): (() => void) => {
  const browserWindow = window as Window & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof browserWindow.requestIdleCallback === 'function') {
    const handle = browserWindow.requestIdleCallback(task);
    return () => {
      if (typeof browserWindow.cancelIdleCallback === 'function') {
        browserWindow.cancelIdleCallback(handle);
      }
    };
  }

  const fallbackHandle = window.setTimeout(task, 16);
  return () => {
    window.clearTimeout(fallbackHandle);
  };
};

const getRenderableImageSrc = (image: CoworkRenderableImage): string | null => {
  if (image.base64Data && image.mimeType) {
    return `data:${image.mimeType};base64,${image.base64Data}`;
  }
  if (typeof image.url === 'string' && image.url.trim()) {
    return image.url.trim();
  }
  return null;
};

const MessageImageGallery: React.FC<{
  images: CoworkRenderableImage[];
  compact?: boolean;
  generated?: boolean;
}> = React.memo(({ images, compact = false, generated = false }) => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; name: string } | null>(null);
  const renderableImages = useMemo(
    () => images
      .map((image) => ({
        image,
        src: getRenderableImageSrc(image),
      }))
      .filter((entry): entry is { image: CoworkRenderableImage; src: string } => Boolean(entry.src)),
    [images]
  );

  if (renderableImages.length === 0) {
    return null;
  }

  return (
    <>
      <div className={`${compact ? '' : 'mt-2'} space-y-3`}>
        {generated ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
            <PhotoIcon className="h-3.5 w-3.5" />
            {'生成结果'}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
        {renderableImages.map(({ image, src }, idx) => (
          <button
            key={`${image.name}-${idx}`}
            type="button"
            className="relative group overflow-hidden rounded-[20px] border border-claude-border/60 bg-white/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-claude-accent/40 hover:shadow-md dark:border-claude-darkBorder/60 dark:bg-white/[0.04]"
            onClick={() => setExpandedImage({ src, name: image.name })}
            title={image.name}
          >
            <div className="flex h-[220px] w-[220px] items-center justify-center bg-gradient-to-br from-[#f7f4ef] to-[#f2ede7] p-3 dark:from-white/[0.04] dark:to-white/[0.02] sm:h-[240px] sm:w-[240px]">
            <img
              src={src}
              alt={image.name}
              className="max-h-full max-w-full rounded-xl object-contain"
            />
            </div>
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-xl bg-black/58 px-2.5 py-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
              <PhotoIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{image.name}</span>
              <span className="ml-auto shrink-0 text-white/80">{'点击查看'}</span>
            </div>
          </button>
        ))}
        </div>
      </div>
      {expandedImage && (
        <CoworkImagePreviewModal
          src={expandedImage.src}
          alt={expandedImage.name}
          fileName={expandedImage.name}
          onClose={() => setExpandedImage(null)}
        />
      )}
    </>
  );
});

const formatMarkdownTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
};

const CacheHitBadge: React.FC<{ source?: string | null }> = React.memo(({ source }) => {
  const sourceLabel = source === 'turn_cache' ? 'turn cache' : (source || 'cache');
  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium"
      title={`命中缓存来源: ${sourceLabel}`}
    >
      <CheckIcon className="h-3.5 w-3.5" />
      <span>{'缓存命中'}</span>
    </div>
  );
});

const encodeBase64Utf8 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

type ToolGroupItem = {
  type: 'tool_group';
  toolUse: CoworkMessage;
  toolResult?: CoworkMessage | null;
};

type DisplayItem =
  | { type: 'message'; message: CoworkMessage }
  | ToolGroupItem;

type AssistantTurnItem =
  | { type: 'assistant'; message: CoworkMessage }
  | { type: 'system'; message: CoworkMessage }
  | { type: 'tool_group'; group: ToolGroupItem }
  | { type: 'tool_result'; message: CoworkMessage };

type ConversationTurn = {
  id: string;
  userMessage: CoworkMessage | null;
  assistantItems: AssistantTurnItem[];
};

const COLLAPSED_VISIBLE_TURN_COUNT = 12;
const HISTORY_LOAD_STEP = 40;
const AUTO_LOAD_TOP_THRESHOLD_PX = 72;
const AUTO_LOAD_REQUIRED_PULL_SCREENS = 2;
const IDENTITY_DISPLAY_TEXT = (value: string): string => value;

const buildMarkdownExport = (
  session: RootState['cowork']['currentSession'],
  options?: { turnLimit?: number }
): string => {
  // {BREAKPOINT} continuity-ui-display-boundary-001
  // {标记} 展示边界: 这里是 markdown 导出策略，不是真相源定义；任何过滤/折叠都不能反向当成记忆或原始对话依据。
  if (!session) return '';

  const exportedMessages = options?.turnLimit && options.turnLimit > 0
    ? flattenConversationTurns(
      buildConversationTurns(buildDisplayItems(session.messages)).slice(-options.turnLimit)
    )
    : session.messages;

  const lines: string[] = [
    `# ${session.title || '新会话'}`,
    '',
    `- Session ID: ${session.id}`,
    `- Status: ${session.status}`,
    `- Role: ${session.agentRoleKey || 'unknown'}`,
    `- Model: ${session.modelId || 'unknown'}`,
    `- Workspace: ${session.cwd || ''}`,
    `- Created At: ${formatMarkdownTimestamp(session.createdAt)}`,
    `- Updated At: ${formatMarkdownTimestamp(session.updatedAt)}`,
    '',
    '---',
    '',
  ];

  for (const message of exportedMessages) {
    const timestamp = formatMarkdownTimestamp(message.timestamp);
    if (message.type === 'user') {
      lines.push(`## User · ${timestamp}`, '', message.content || '', '');
      continue;
    }

    if (message.type === 'assistant') {
      if (message.metadata?.isThinking && !message.metadata?.isStreaming && !message.content?.trim()) {
        continue;
      }
      const stage = getAssistantStage(message);
      if (stage && stage !== 'final_result') {
        lines.push(`## Assistant Process · ${stage} · ${timestamp}`, '', message.content || '', '');
        continue;
      }
      lines.push(`## Assistant · ${timestamp}`, '', message.content || '', '');
      continue;
    }

    if (message.type === 'system') {
      const content = message.content || (SessionDetailHelpers.hasText(message.metadata?.error) ? message.metadata.error : '');
      if (content.trim()) {
        lines.push(`## System · ${timestamp}`, '', content, '');
      }
      continue;
    }

    if (message.type === 'tool_use') {
      const toolName = typeof message.metadata?.toolName === 'string' ? message.metadata.toolName : 'Tool';
      const toolInput = SessionDetailHelpers.formatToolInput(toolName, message.metadata?.toolInput, 'json');
      lines.push(`## Tool Use · ${toolName} · ${timestamp}`, '', '```json', toolInput || '{}', '```', '');
      continue;
    }

    if (message.type === 'tool_result') {
      const toolName = typeof message.metadata?.toolName === 'string' ? message.metadata.toolName : 'Tool';
      const toolOutput = getToolResultDisplay(message);
      lines.push(`## Tool Result · ${toolName} · ${timestamp}`, '', '```text', toolOutput || '', '```', '');
    }
  }

  return `${lines.join('\n').trim()}\n`;
};

const buildManualCompressionSummary = (
  session: RootState['cowork']['currentSession'],
  turns: ConversationTurn[],
  options?: { turnLimit?: number }
): string => {
  if (!session) return '';

  const scopedTurns = options?.turnLimit && options.turnLimit > 0
    ? turns.slice(-options.turnLimit)
    : turns.slice(-8);

  const lines: string[] = [
    `# ${session.title || '当前对话压缩摘要'}`,
    '',
    '## 压缩摘要',
  ];

  if (scopedTurns.length === 0) {
    lines.push('- 当前没有可压缩的对话内容。');
    return `${lines.join('\n').trim()}\n`;
  }

  scopedTurns.forEach((turn, index) => {
    const userText = (turn.userMessage?.content || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const assistantText = turn.assistantItems
      .filter((item) => item.type === 'assistant')
      .map((item) => (item.message.content || '').trim().replace(/\s+/g, ' '))
      .join(' ')
      .slice(0, 180);

    lines.push(`### 回合 ${index + 1}`);
    if (userText) lines.push(`- 用户：${userText}`);
    if (assistantText) lines.push(`- 助手：${assistantText}`);
    if (turn.assistantItems.some((item) => item.type === 'tool_group')) {
      lines.push('- 工具：本回合发生过工具调用。');
    }
    lines.push('');
  });

  lines.push('## 使用建议');
  lines.push('- 这是一份手工压缩摘要，可复制后作为下一轮上下文继续使用。');

  return `${lines.join('\n').trim()}\n`;
};

const buildDisplayItems = (messages: CoworkMessage[]): DisplayItem[] => {
  const items: DisplayItem[] = [];
  const groupsByToolUseId = new Map<string, ToolGroupItem>();
  let pendingAdjacentGroup: ToolGroupItem | null = null;

  for (const message of messages) {
    if (message.type === 'tool_use') {
      const group: ToolGroupItem = { type: 'tool_group', toolUse: message };
      items.push(group);

      const toolUseId = message.metadata?.toolUseId;
      if (typeof toolUseId === 'string' && toolUseId.trim()) {
        groupsByToolUseId.set(toolUseId, group);
      }
      pendingAdjacentGroup = group;
      continue;
    }

    if (message.type === 'tool_result') {
      let matched = false;
      const toolUseId = message.metadata?.toolUseId;
      if (typeof toolUseId === 'string' && groupsByToolUseId.has(toolUseId)) {
        const group = groupsByToolUseId.get(toolUseId);
        if (group) {
          group.toolResult = message;
          matched = true;
        }
      } else if (pendingAdjacentGroup && !pendingAdjacentGroup.toolResult) {
        pendingAdjacentGroup.toolResult = message;
        matched = true;
      }

      pendingAdjacentGroup = null;
      if (!matched) {
        items.push({ type: 'message', message });
      }
      continue;
    }

    pendingAdjacentGroup = null;
    items.push({ type: 'message', message });
  }

  return items;
};

const buildConversationTurns = (items: DisplayItem[]): ConversationTurn[] => {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;
  let orphanIndex = 0;

  const ensureTurn = (): ConversationTurn => {
    if (currentTurn) return currentTurn;
    const orphanTurn: ConversationTurn = {
      id: `orphan-${orphanIndex++}`,
      userMessage: null,
      assistantItems: [],
    };
    turns.push(orphanTurn);
    currentTurn = orphanTurn;
    return orphanTurn;
  };

  for (const item of items) {
    if (item.type === 'message' && item.message.type === 'user') {
      currentTurn = {
        id: item.message.id,
        userMessage: item.message,
        assistantItems: [],
      };
      turns.push(currentTurn);
      continue;
    }

    const turn = ensureTurn();
    if (item.type === 'tool_group') {
      turn.assistantItems.push({ type: 'tool_group', group: item });
      continue;
    }

    const message = item.message;
    if (message.type === 'assistant') {
      turn.assistantItems.push({ type: 'assistant', message });
      continue;
    }

    if (message.type === 'system') {
      turn.assistantItems.push({ type: 'system', message });
      continue;
    }

    if (message.type === 'tool_result') {
      turn.assistantItems.push({ type: 'tool_result', message });
      continue;
    }

    if (message.type === 'tool_use') {
      turn.assistantItems.push({
        type: 'tool_group',
        group: {
          type: 'tool_group',
          toolUse: message,
        },
      });
    }
  }

  return turns;
};

const countConversationTurns = (messages: CoworkMessage[]): number => (
  buildConversationTurns(buildDisplayItems(messages)).length
);

const flattenConversationTurns = (turns: ConversationTurn[]): CoworkMessage[] => {
  const messages: CoworkMessage[] = [];
  for (const turn of turns) {
    if (turn.userMessage) {
      messages.push(turn.userMessage);
    }
    for (const item of turn.assistantItems) {
      if (item.type === 'tool_group') {
        messages.push(item.group.toolUse);
        if (item.group.toolResult) {
          messages.push(item.group.toolResult);
        }
        continue;
      }
      messages.push(item.message);
    }
  }
  return messages;
};

function findLastUserMessageIndex(messages: CoworkMessage[] | null | undefined): number {
  if (!messages || messages.length === 0) {
    return -1;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.type === 'user') {
      return index;
    }
  }
  return -1;
}

const isRenderableAssistantOrSystemMessage = (message: CoworkMessage): boolean => {
  if (SessionDetailHelpers.hasText(message.content) || SessionDetailHelpers.hasText(message.metadata?.error)) {
    return true;
  }
  if (message.metadata?.isThinking) {
    return Boolean(message.metadata?.isStreaming);
  }
  return false;
};

const isVisibleAssistantTurnItem = (item: AssistantTurnItem): boolean => {
  if (item.type === 'assistant' || item.type === 'system') {
    return isRenderableAssistantOrSystemMessage(item.message);
  }
  if (item.type === 'tool_result') {
    return SessionDetailHelpers.hasText(getToolResultDisplay(item.message));
  }
  return true;
};

const getVisibleAssistantItems = (assistantItems: AssistantTurnItem[]): AssistantTurnItem[] =>
  assistantItems.filter(isVisibleAssistantTurnItem);

const hasRenderableAssistantContent = (turn: ConversationTurn): boolean => (
  getVisibleAssistantItems(turn.assistantItems).length > 0
);

const getToolResultLineCount = (result: string): number => {
  if (!result) return 0;
  return result.split('\n').length;
};

const TodoWriteInputView: React.FC<{ items: SessionDetailHelpers.ParsedTodoItem[] }> = ({ items }) => {
  const getStatusCheckboxClass = (status: SessionDetailHelpers.TodoStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500 text-green-500';
      case 'in_progress':
        return 'bg-transparent border-blue-500';
      case 'pending':
      case 'unknown':
      default:
        return 'bg-transparent dark:border-claude-darkTextSecondary/60 border-claude-textSecondary/60';
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={`todo-item-${index}`}
          className="flex items-start gap-2"
        >
          <span className={`mt-0.5 h-4 w-4 rounded-[4px] border flex-shrink-0 inline-flex items-center justify-center ${getStatusCheckboxClass(item.status)}`}>
            {item.status === 'completed' && <CheckIcon className="h-3 w-3 stroke-[2.5]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={`text-xs whitespace-pre-wrap break-words leading-5 ${
              item.status === 'completed'
                ? 'dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/80'
                : 'dark:text-claude-darkText text-claude-text'
            }`}>
              {item.primaryText}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ToolCallGroup: React.FC<{
  group: ToolGroupItem;
  isLastInSequence?: boolean;
  mapDisplayText?: (value: string) => string;
}> = ({
  group,
  isLastInSequence = true,
  mapDisplayText,
}) => {
  const { toolUse, toolResult } = group;
  const toolName = typeof toolUse.metadata?.toolName === 'string' ? toolUse.metadata.toolName : 'Tool';
  const toolInput = toolUse.metadata?.toolInput;
  const isTodoWriteTool = SessionDetailHelpers.isTodoWriteToolName(toolName);
  const todoItems = isTodoWriteTool ? SessionDetailHelpers.parseTodoWriteItems(toolInput) : null;
  const mapText = mapDisplayText ?? ((value: string) => value);
  const toolInputDisplayRaw = SessionDetailHelpers.formatToolInput(toolName, toolInput);
  const toolInputDisplay = toolInputDisplayRaw ? mapText(toolInputDisplayRaw) : null;
  const toolInputSummaryRaw = SessionDetailHelpers.getToolInputSummary(toolName, toolInput) ?? toolInputDisplayRaw;
  const toolInputSummary = toolInputSummaryRaw ? mapText(toolInputSummaryRaw) : null;
  const toolResultDisplayRaw = toolResult ? getToolResultDisplay(toolResult) : '';
  const toolResultDisplay = mapText(toolResultDisplayRaw);
  const isToolError = Boolean(toolResult?.metadata?.isError || toolResult?.metadata?.error);
  const [isExpanded, setIsExpanded] = useState(false);
  const resultLineCount = getToolResultLineCount(toolResultDisplay);
  const toolTone: AssistantSurfaceTone = !toolResult ? 'tool' : (isToolError ? 'error' : 'tool');
  const toolStatusText = !toolResult ? '过程信息，不会作为正式回复发送' : (isToolError ? '过程信息，工具执行失败' : '过程信息，工具执行完成');

  // Check if this is a Bash-like tool that should show terminal style
  const isBashTool = toolName === 'Bash';

  return (
    <div className={`relative rounded-2xl border px-3 py-3 ${ASSISTANT_SURFACE_STYLES[toolTone]}`}>
      {/* Vertical connecting line to next tool group */}
      {!isLastInSequence && (
        <div className="absolute left-[14px] top-[42px] bottom-[-10px] w-px dark:bg-claude-darkTextSecondary/20 bg-claude-textSecondary/20" />
      )}
      <AssistantSectionBadge
        label={'过程信息 · 工具'}
        tone={toolTone}
        detail={toolStatusText}
        pulse={!toolResult}
      />
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-2 text-left group relative z-10"
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
          !toolResult
            ? 'bg-blue-500 animate-pulse'
            : isToolError
              ? 'bg-red-500'
              : 'bg-green-500'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {toolName}
            </span>
            {toolInputSummary && (
              <code className="text-xs dark:text-claude-darkTextSecondary/80 text-claude-textSecondary/80 font-mono truncate max-w-[400px]">
                {toolInputSummary}
              </code>
            )}
          </div>
            {toolResult && resultLineCount > 0 && !isTodoWriteTool && (
              <div className="text-xs dark:text-claude-darkTextSecondary/60 text-claude-textSecondary/60 mt-0.5">
                {`已返回 ${resultLineCount} ${resultLineCount === 1 ? 'line' : 'lines'}，点开查看详情`}
              </div>
            )}
          {!toolResult && (
            <div className="text-xs dark:text-claude-darkTextSecondary/60 text-claude-textSecondary/60 mt-0.5">
              {'执行中，属于过程信息'}
            </div>
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="ml-4 mt-2">
          {isBashTool ? (
            // Terminal-style display for Bash commands
            <div className="rounded-lg overflow-hidden border dark:border-claude-darkBorder border-claude-border">
              {/* Terminal header */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 dark:bg-claude-darkSurface bg-claude-surfaceInset">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="ml-2 text-[10px] dark:text-claude-darkTextSecondary text-claude-textSecondary font-medium">Terminal</span>
              </div>
              {/* Terminal content */}
              <div className="dark:bg-claude-darkSurfaceInset bg-claude-surfaceInset px-3 py-3 max-h-72 overflow-y-auto font-mono text-xs">
                {toolInputDisplay && (
                  <div className="dark:text-claude-darkText text-claude-text">
                    <span className="text-claude-accent select-none">$ </span>
                    <span className="whitespace-pre-wrap break-words">{toolInputDisplay}</span>
                  </div>
                )}
                {toolResult && toolResultDisplay && (
                  <div className={`mt-1.5 whitespace-pre-wrap break-words ${
                    isToolError ? 'text-red-400' : 'dark:text-claude-darkTextSecondary text-claude-textSecondary'
                  }`}>
                    {toolResultDisplay}
                  </div>
                )}
                {!toolResult && (
                  <div className="dark:text-claude-darkTextSecondary/60 text-claude-textSecondary/60 mt-1.5 italic">
                    {'执行中'}
                  </div>
                )}
              </div>
            </div>
          ) : isTodoWriteTool && todoItems ? (
            <TodoWriteInputView items={todoItems} />
          ) : (
            // Standard display for other tools with input/output labels
            <div className="space-y-2">
              {toolInputDisplay && (
                <div>
                  <div className="text-[10px] font-medium dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70 uppercase tracking-wider mb-1">
                    {'工具参数'}
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <pre className="text-xs dark:text-claude-darkText text-claude-text whitespace-pre-wrap break-words font-mono">
                      {toolInputDisplay}
                    </pre>
                  </div>
                </div>
              )}
              {toolResult && (
                <div>
                  <div className="text-[10px] font-medium dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70 uppercase tracking-wider mb-1">
                    {'执行结果'}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <pre className={`text-xs whitespace-pre-wrap break-words font-mono ${
                      isToolError ? 'text-red-500' : 'dark:text-claude-darkText text-claude-text'
                    }`}>
                      {toolResultDisplay}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Copy button component
const CopyButton: React.FC<{
  content: string;
  visible: boolean;
}> = ({ content, visible }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      title={'复制到剪贴板'}
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 text-green-500"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 text-[var(--icon-secondary)]"
          aria-hidden="true"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
        </svg>
      )}
    </button>
  );
};

const UserMessageItem: React.FC<{
  message: CoworkMessage;
  skills: Skill[];
  userLabel?: string;
  userAvatar?: string;
}> = React.memo(({ message, skills, userLabel = '用户', userAvatar = '🙂' }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Get skills used for this message
  const messageSkillIds = (message.metadata as CoworkMessageMetadata)?.skillIds || [];
  const messageSkills = messageSkillIds
    .map(id => skills.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  // Get image attachments from metadata
  const imageAttachments = ((message.metadata as CoworkMessageMetadata)?.imageAttachments ?? []) as CoworkImageAttachment[];

  return (
    <div
      className="py-2 px-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-3xl mx-auto">
        <div className="pl-4 sm:pl-8 md:pl-12">
          <div className="flex items-start gap-3 flex-row-reverse">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/80 text-base shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
              {renderAgentRoleAvatar(userAvatar, {
                alt: userLabel,
                fallback: '🙂',
                className: 'h-full w-full object-cover text-[16px] leading-none flex items-center justify-center',
              })}
            </div>
            <div className="w-full min-w-0 flex flex-col items-end">
              <div className="mb-1 text-[11px] font-medium text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {userLabel}
              </div>
              <div className="w-fit max-w-[42rem] rounded-2xl px-4 py-2.5 dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text shadow-subtle">
                {message.content?.trim() && (
                  <MarkdownContent
                    content={message.content}
                    className="max-w-none whitespace-pre-wrap break-words"
                  />
                )}
                {imageAttachments.length > 0 && <MessageImageGallery images={imageAttachments} compact={!message.content?.trim()} />}
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                {messageSkills.map(skill => (
                  <div
                    key={skill.id}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-claude-accent/5 dark:bg-claude-accent/10"
                    title={skill.description}
                  >
                    <PuzzleIcon className="h-2.5 w-2.5 text-claude-accent/70" />
                    <span className="text-[10px] font-medium text-claude-accent/70 max-w-[60px] truncate">
                      {getSkillDisplayName(skill)}
                    </span>
                  </div>
                ))}
                <CopyButton
                  content={message.content}
                  visible={isHovered}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const AssistantMessageItem: React.FC<{
  message: CoworkMessage;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
  mapDisplayText?: (value: string) => string;
  showCopyButton?: boolean;
  roleLabel?: string;
  roleAvatar?: string;
}> = React.memo(({
  message,
  resolveLocalFilePath,
  mapDisplayText,
  showCopyButton = false,
  roleLabel = '助手',
  roleAvatar = '🤖',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const displayContent = mapDisplayText ? mapDisplayText(message.content) : message.content;
  const deferMarkdown = Boolean(message.metadata?.isStreaming);
  const parsedContentBlocks = useMemo<SessionDetailHelpers.AssistantContentBlock[]>(() => (
    deferMarkdown
      ? [{ type: 'markdown', content: displayContent }]
      : SessionDetailHelpers.splitAssistantContentBlocks(displayContent)
  ), [deferMarkdown, displayContent]);
  const generatedImages = (((message.metadata as CoworkMessageMetadata)?.generatedImages ?? []) as CoworkRenderableImage[]);
  const cacheHit = Boolean(message.metadata?.cacheHit);
  const cacheSource = typeof message.metadata?.cacheSource === 'string' ? message.metadata.cacheSource : null;
  const continuitySource = typeof message.metadata?.continuitySource === 'string' ? message.metadata.continuitySource : null;
  const promptTokens = typeof message.metadata?.promptTokens === 'number' ? message.metadata.promptTokens : null;
  const completionTokens = typeof message.metadata?.completionTokens === 'number' ? message.metadata.completionTokens : null;
  const totalTokens = typeof message.metadata?.totalTokens === 'number' ? message.metadata.totalTokens : null;
  const stage = getAssistantStage(message);
  const isFormalReply = isFinalAssistantMessage(message);
  const tone: AssistantSurfaceTone = isFormalReply
    ? 'reply'
    : stage === 'tool_trace'
      ? 'tool'
      : 'system';
  const badgeLabel = isFormalReply
    ? '正式回复'
    : stage === 'pre_tool'
      ? '过程信息 · 执行前说明'
      : stage === 'tool_trace'
        ? '过程信息 · 运行轨迹'
        : '过程信息 · 系统提示';
  const badgeDetail = isFormalReply
    ? (message.metadata?.isStreaming ? '正在输出给你' : '这是会发送给你的最终内容')
    : stage === 'pre_tool'
      ? '工具调用前的过程说明，不会作为正式回复发送'
      : stage === 'tool_trace'
        ? '工具调用记录，已从正式回复中拆出'
        : '过程信息，不会作为正式回复发送';

  return (
    <div
      className={`relative rounded-2xl border px-4 py-3 ${ASSISTANT_SURFACE_STYLES[tone]}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/80 text-base shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
          {renderAgentRoleAvatar(roleAvatar, {
            alt: roleLabel,
            fallback: '🤖',
            className: 'h-full w-full object-cover text-[15px] leading-none flex items-center justify-center',
          })}
        </div>
        <div className="min-w-0 text-[11px] font-medium text-claude-textSecondary dark:text-claude-darkTextSecondary">
          {roleLabel}
        </div>
      </div>
      <AssistantSectionBadge
        label={badgeLabel}
        tone={tone}
        detail={badgeDetail}
        pulse={Boolean(message.metadata?.isStreaming) && isFormalReply}
      />
      <div className="dark:text-claude-darkText text-claude-text">
        {(cacheHit || continuitySource || Number.isFinite(promptTokens) || Number.isFinite(completionTokens) || Number.isFinite(totalTokens)) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {cacheHit && <CacheHitBadge source={cacheSource} />}
            <ContinuitySourceBadge source={continuitySource} />
            <TokenUsageBadge
              promptTokens={promptTokens}
              completionTokens={completionTokens}
              totalTokens={totalTokens}
            />
          </div>
        )}
        <div className="space-y-3">
          {parsedContentBlocks.length > 0 ? parsedContentBlocks.map((block, index) => {
            if (block.type === 'tool_trace') {
              return (
                <AssistantToolTraceBlock
                  key={`tool-trace-${message.id}-${index}`}
                  content={block.content}
                />
              );
            }

            if (block.type === 'html') {
              return (
                <AssistantHtmlBlock
                  key={`html-${message.id}-${index}`}
                  html={block.content}
                />
              );
            }

            return (
              <MarkdownContent
                key={`markdown-${message.id}-${index}`}
                content={block.content}
                className="prose prose-sm dark:prose-invert max-w-none"
                resolveLocalFilePath={resolveLocalFilePath}
                deferMarkdown={deferMarkdown}
              />
            );
          }) : (
            <MarkdownContent
              content={displayContent}
              className="prose prose-sm dark:prose-invert max-w-none"
              resolveLocalFilePath={resolveLocalFilePath}
              deferMarkdown={deferMarkdown}
            />
          )}
        </div>
        {generatedImages.length > 0 && (
          <MessageImageGallery images={generatedImages} compact={!displayContent?.trim()} generated />
        )}
      </div>
      {showCopyButton && (
        <div className="flex items-center gap-1.5 mt-1">
          <CopyButton
            content={displayContent}
            visible={isHovered}
          />
        </div>
      )}
    </div>
  );
});

// Streaming activity bar shown between messages and input
const StreamingActivityBar: React.FC<{ messages: CoworkMessage[] }> = ({ messages }) => {
  // {标记} P1-STREAMING-ACTIVITY-MEMO: 活动条状态改为 memo 计算，减少流式阶段重复全扫。
  const statusText = useMemo(() => {
    const toolResultIds = new Set<string>();
    for (const msg of messages) {
      const id = msg.metadata?.toolUseId;
      if (msg.type === 'tool_result' && typeof id === 'string') {
        toolResultIds.add(id);
      }
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type !== 'tool_use') {
        continue;
      }
      const id = msg.metadata?.toolUseId;
      if (typeof id !== 'string' || toolResultIds.has(id)) {
        continue;
      }
      const toolName = typeof msg.metadata?.toolName === 'string' ? msg.metadata.toolName : null;
      if (toolName) {
        return `${'执行中'} ${toolName}...`;
      }
      break;
    }

    return `${'执行中'}`;
  }, [messages]);

  return (
    <div className="shrink-0 animate-fade-in px-4">
      <div className="max-w-3xl mx-auto">
        <div className="streaming-bar" />
        <div className="py-1">
          <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
};

const TypingDots: React.FC = () => (
  <div className="flex items-center space-x-1.5 py-1">
    <div className="w-2 h-2 rounded-full bg-claude-accent animate-bounce" style={{ animationDelay: '0ms' }} />
    <div className="w-2 h-2 rounded-full bg-claude-accent animate-bounce" style={{ animationDelay: '150ms' }} />
    <div className="w-2 h-2 rounded-full bg-claude-accent animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
);

const ThinkingBlock: React.FC<{
  message: CoworkMessage;
  mapDisplayText?: (value: string) => string;
}> = React.memo(({ message, mapDisplayText }) => {
  const isCurrentlyStreaming = Boolean(message.metadata?.isStreaming);
  const [isExpanded, setIsExpanded] = useState(isCurrentlyStreaming);
  const displayContent = mapDisplayText ? mapDisplayText(message.content) : message.content;

  // Auto-expand while streaming, auto-collapse when streaming completes
  useEffect(() => {
    if (isCurrentlyStreaming) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [isCurrentlyStreaming]);

  return (
    <div className={`rounded-2xl border overflow-hidden ${ASSISTANT_SURFACE_STYLES.thinking}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-3 text-left dark:hover:bg-claude-darkSurfaceHover/30 hover:bg-claude-surfaceHover/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <AssistantSectionBadge
              label={'过程信息 · 思考'}
              tone={'thinking'}
              detail={isCurrentlyStreaming ? '内部处理中，不是最终回复' : '内部过程记录，默认收起'}
              pulse={isCurrentlyStreaming}
            />
            {!isExpanded && (
              <div className="text-xs leading-5 dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70">
                {'这部分只是内部过程信息，展开后查看，不会当作正式答复。'}
              </div>
            )}
          </div>
          <ChevronRightIcon
            className={`mt-1 h-3.5 w-3.5 dark:text-claude-darkTextSecondary text-claude-textSecondary flex-shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto">
          <div className="text-xs leading-relaxed dark:text-claude-darkTextSecondary/80 text-claude-textSecondary/80 whitespace-pre-wrap">
            {displayContent}
          </div>
        </div>
      )}
    </div>
  );
});

const ContinuitySourceBadge: React.FC<{ source?: string | null }> = React.memo(({ source }) => {
  if (!source) {
    return null;
  }

  const label = source === 'shared-thread'
    ? '广播板接力'
    : source === 'durable-memory'
      ? '长期记忆回补'
      : '无连续性命中';

  const title = source === 'shared-thread'
    ? '当前回复优先命中了 24h 广播板接力'
    : source === 'durable-memory'
      ? '当前回复由长期记忆兜底回补'
      : '当前回复没有命中广播板或长期记忆';

  const toneClass = source === 'shared-thread'
    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    : source === 'durable-memory'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'bg-slate-500/10 text-slate-600 dark:text-slate-300';

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${toneClass}`}
      title={title}
    >
      <InformationCircleIcon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
});

const TokenUsageBadge: React.FC<{
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}> = React.memo(({ promptTokens, completionTokens, totalTokens }) => {
  const hasUsage = Number.isFinite(promptTokens) || Number.isFinite(completionTokens) || Number.isFinite(totalTokens);
  if (!hasUsage) {
    return null;
  }

  const parts = [
    Number.isFinite(promptTokens) ? `↓ ${promptTokens}` : null,
    Number.isFinite(completionTokens) ? `↑ ${completionTokens}` : null,
    Number.isFinite(totalTokens) ? `Σ ${totalTokens}` : null,
  ].filter(Boolean);

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 text-[11px] font-medium"
      title={parts.join(' / ')}
    >
      <SignalIcon className="h-3.5 w-3.5" />
      <span>{parts.join(' · ')}</span>
    </div>
  );
});

const getAssistantStage = (message: CoworkMessage): string => (
  typeof message.metadata?.stage === 'string' ? message.metadata.stage.trim() : ''
);

const isFinalAssistantMessage = (message: CoworkMessage): boolean => {
  const stage = getAssistantStage(message);
  return !stage || stage === 'final_result';
};

const AssistantHtmlBlock: React.FC<{ html: string }> = React.memo(({ html }) => {
  const deferredHtml = useDeferredValue(html);
  const [sanitizedHtml, setSanitizedHtml] = useState<string>('');
  const [isPreparingHtml, setIsPreparingHtml] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsPreparingHtml(true);

    const cleanup = runWhenIdle(() => {
      void import('dompurify').then((module) => {
        if (cancelled) return;
        const DOMPurify = module.default;
        const nextHtml = DOMPurify.sanitize(deferredHtml, {
          USE_PROFILES: { html: true },
        });
        startTransition(() => {
          if (cancelled) return;
          setSanitizedHtml(nextHtml);
          setIsPreparingHtml(false);
        });
      }).catch((error) => {
        console.error('Failed to load DOMPurify for assistant HTML block:', error);
        startTransition(() => {
          if (cancelled) return;
          setSanitizedHtml('');
          setIsPreparingHtml(false);
        });
      });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [deferredHtml]);

  return (
    <div className="rounded-xl border border-claude-border/60 bg-white/55 px-4 py-3 shadow-sm dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/55">
      <AssistantSectionBadge
        label={'HTML 内容'}
        tone={'reply'}
        detail={isPreparingHtml ? '浏览器空闲时异步处理' : '按安全 HTML 块渲染'}
      />
      {isPreparingHtml ? (
        <div className="rounded-lg border border-dashed border-claude-border/60 px-3 py-2 text-xs dark:border-claude-darkBorder/60 dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {'HTML 块正在异步整理...'}
        </div>
      ) : (
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      )}
    </div>
  );
});

const AssistantToolTraceBlock: React.FC<{ content: string }> = React.memo(({ content }) => (
  <div className={`rounded-xl border px-4 py-3 ${ASSISTANT_SURFACE_STYLES.tool}`}>
    <AssistantSectionBadge
      label={'过程信息 · 运行轨迹'}
      tone={'tool'}
      detail={'工具调用记录，已从正式回复中拆出'}
    />
    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 dark:text-sky-200/90 text-sky-900/90">
      {content}
    </pre>
  </div>
));

const AssistantTurnBlock: React.FC<{
  turn: ConversationTurn;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
  mapDisplayText?: (value: string) => string;
  showTypingIndicator?: boolean;
  showCopyButtons?: boolean;
  roleLabel?: string;
  roleAvatar?: string;
}> = React.memo(({
  turn,
  resolveLocalFilePath,
  mapDisplayText,
  showTypingIndicator = false,
  showCopyButtons = true,
  roleLabel,
  roleAvatar,
}) => {
  const visibleAssistantItems = useMemo(() => getVisibleAssistantItems(turn.assistantItems), [turn.assistantItems]);

  const renderSystemMessage = (message: CoworkMessage) => {
    const rawContent = SessionDetailHelpers.hasText(message.content)
      ? message.content
      : (typeof message.metadata?.error === 'string' ? message.metadata.error : '');
    const content = mapDisplayText ? mapDisplayText(rawContent) : rawContent;
    if (!content.trim()) return null;
    const stage = typeof message.metadata?.stage === 'string' ? message.metadata.stage : '';

    if (stage === 'tool_trace') {
      return <AssistantToolTraceBlock content={content} />;
    }

    const badgeLabel = stage === 'pre_tool' ? '执行前说明' : '系统提示';
    const badgeDetail = stage === 'pre_tool'
      ? '过程信息，工具调用前的状态说明'
      : '过程信息，系统状态与提示';

    return (
      <div className={`rounded-2xl border px-3 py-3 ${ASSISTANT_SURFACE_STYLES.system}`}>
        <AssistantSectionBadge
          label={`过程信息 · ${badgeLabel}`}
          tone={'system'}
          detail={badgeDetail}
        />
        <div className="flex items-start gap-2">
          <InformationCircleIcon className="h-4 w-4 mt-0.5 dark:text-claude-darkTextSecondary text-claude-textSecondary flex-shrink-0" />
          <div className="text-xs whitespace-pre-wrap dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {content}
          </div>
        </div>
      </div>
    );
  };

  const renderOrphanToolResult = (message: CoworkMessage) => {
    const toolResultDisplayRaw = getToolResultDisplay(message);
    const toolResultDisplay = mapDisplayText ? mapDisplayText(toolResultDisplayRaw) : toolResultDisplayRaw;
    const isToolError = Boolean(message.metadata?.isError || message.metadata?.error);
    const resultLineCount = getToolResultLineCount(toolResultDisplay);
    return (
      <div className={`rounded-2xl border px-3 py-3 ${ASSISTANT_SURFACE_STYLES[isToolError ? 'error' : 'tool']}`}>
        <AssistantSectionBadge
          label={isToolError ? '过程信息 · 工具失败' : '过程信息 · 工具结果'}
          tone={isToolError ? 'error' : 'tool'}
          detail={isToolError ? '过程信息，不是模型最终回复' : '过程信息，不是模型最终回复'}
        />
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
            isToolError ? 'bg-red-500' : 'bg-claude-darkTextSecondary/50'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'返回结果'}
            </div>
            {resultLineCount > 0 && (
              <div className="text-xs dark:text-claude-darkTextSecondary/60 text-claude-textSecondary/60 mt-0.5">
                {resultLineCount} {resultLineCount === 1 ? 'line' : 'lines'} of output
              </div>
            )}
            <div className="mt-2 px-3 py-2 rounded-lg dark:bg-claude-darkSurface/50 bg-claude-surface/50 max-h-64 overflow-y-auto">
              <pre className={`text-xs whitespace-pre-wrap break-words font-mono ${
                isToolError ? 'text-red-500' : 'dark:text-claude-darkText text-claude-text'
              }`}>
                {toolResultDisplay || '执行中'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-2">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 px-4 py-3 space-y-4">
            {visibleAssistantItems.map((item, index) => {
              if (item.type === 'assistant') {
                if (item.message.metadata?.isThinking) {
                  return (
                    <ThinkingBlock
                      key={item.message.id}
                      message={item.message}
                      mapDisplayText={mapDisplayText}
                    />
                  );
                }
                // Check if there are any tool_group items after this assistant message
                const hasToolGroupAfter = visibleAssistantItems
                  .slice(index + 1)
                  .some(laterItem => laterItem.type === 'tool_group');

                return (
                  <AssistantMessageItem
                    key={item.message.id}
                    message={item.message}
                    resolveLocalFilePath={resolveLocalFilePath}
                    mapDisplayText={mapDisplayText}
                    showCopyButton={showCopyButtons && !hasToolGroupAfter}
                    roleLabel={roleLabel}
                    roleAvatar={roleAvatar}
                  />
                );
              }

              if (item.type === 'tool_group') {
                const nextItem = visibleAssistantItems[index + 1];
                const isLastInSequence = !nextItem || nextItem.type !== 'tool_group';
                return (
                  <ToolCallGroup
                    key={`tool-${item.group.toolUse.id}`}
                    group={item.group}
                    isLastInSequence={isLastInSequence}
                    mapDisplayText={mapDisplayText}
                  />
                );
              }

              if (item.type === 'system') {
                const systemMessage = renderSystemMessage(item.message);
                if (!systemMessage) {
                  return null;
                }
                return (
                  <div key={item.message.id}>
                    {systemMessage}
                  </div>
                );
              }

              return (
                <div key={item.message.id}>
                  {renderOrphanToolResult(item.message)}
                </div>
              );
            })}
            {showTypingIndicator && <TypingDots />}
          </div>
        </div>
      </div>
    </div>
  );
});

const CoworkSessionDetail: React.FC<CoworkSessionDetailProps> = ({
  onManageSkills,
  onContinue,
  onStop,
  onNavigateHome,
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
  onSetRightDockActions,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const isMobileViewport = useIsMobileViewport();
  const isMediumViewport = useIsMediumViewport();
  const currentSession = useSelector((state: RootState) => state.cowork.currentSession);
  const isStreaming = useSelector((state: RootState) => state.cowork.isStreaming);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const detailRootRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const turnRefs = useRef<Array<HTMLDivElement | null>>([]);
  const autoScrollRafRef = useRef<number | null>(null);
  const historyPullDistancePxRef = useRef(0);
  const lastScrollTopRef = useRef<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showAllTurns, setShowAllTurns] = useState(false);
  const [historyPullDistancePx, setHistoryPullDistancePx] = useState(0);
  const [exportTurnCount, setExportTurnCount] = useState<number | null>(null);

  // Menu and action states
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isLoadingEarlierHistory, setIsLoadingEarlierHistory] = useState(false);

  // Rename states
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ignoreNextBlurRef = useRef(false);

  // Reset rename value when session changes
  useEffect(() => {
    if (!isRenaming && currentSession) {
      setRenameValue(currentSession.title);
      ignoreNextBlurRef.current = false;
    }
  }, [isRenaming, currentSession?.title]);

  useEffect(() => {
    setShouldAutoScroll(true);
    setShowAllTurns(false);
    setExportTurnCount(null);
    historyPullDistancePxRef.current = 0;
    lastScrollTopRef.current = null;
    setHistoryPullDistancePx(0);
  }, [currentSession?.id]);

  useEffect(() => () => {
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
    }
  }, []);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (!isRenaming) return;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [isRenaming]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuPosition) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !actionButtonRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    const handleScroll = () => closeMenu();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [menuPosition]);

  // Helper: truncate path for display
  const truncatePath = (path: string, maxLength = 20): string => {
    if (!path) return '未选择文件夹';
    return getCompactFolderName(path, maxLength) || '未选择文件夹';
  };

  // Menu position calculator
  const calculateMenuPosition = (height: number) => {
    const rect = actionButtonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const menuWidth = 180;
    const padding = 8;
    const x = Math.min(
      Math.max(padding, rect.right - menuWidth),
      window.innerWidth - menuWidth - padding
    );
    const y = Math.min(rect.bottom + 8, window.innerHeight - height - padding);
    return { x, y };
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRenaming) return;
    if (menuPosition) {
      closeMenu();
      return;
    }
    const menuHeight = 160;
    const position = calculateMenuPosition(menuHeight);
    if (position) {
      setMenuPosition(position);
    }
    setShowConfirmDelete(false);
  };

  const closeMenu = () => {
    setMenuPosition(null);
    setShowConfirmDelete(false);
  };

  // Open folder in Finder/Explorer
  const handleOpenFolder = useCallback(async () => {
    if (!currentSession?.cwd) return;
    try {
      await window.electron.shell.openPath(currentSession.cwd);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [currentSession?.cwd]);

  // Rename handlers
  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSession) return;
    ignoreNextBlurRef.current = false;
    setIsRenaming(true);
    setShowConfirmDelete(false);
    setRenameValue(currentSession.title);
    setMenuPosition(null);
  };

  const handleRenameSave = async (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (!currentSession) return;
    ignoreNextBlurRef.current = true;
    const nextTitle = renameValue.trim();
    if (nextTitle && nextTitle !== currentSession.title) {
      await coworkService.renameSession(currentSession.id, nextTitle);
    }
    setIsRenaming(false);
  };

  const handleRenameCancel = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    ignoreNextBlurRef.current = true;
    if (currentSession) {
      setRenameValue(currentSession.title);
    }
    setIsRenaming(false);
  };

  const handleRenameBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (ignoreNextBlurRef.current) {
      ignoreNextBlurRef.current = false;
      return;
    }
    handleRenameSave(event);
  };

  // Pin/unpin handler
  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSession) return;
    await coworkService.setSessionPinned(currentSession.id, !currentSession.pinned);
    closeMenu();
  };

  // Delete handlers
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDelete(true);
    setMenuPosition(null);
  };

  const handleCopyCompressedSummary = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSession) return;
    closeMenu();
    try {
      const compression = await coworkService.compressContext(currentSession.id);
      if (!compression?.combinedSummary?.trim()) {
        const fallbackSummary = buildManualCompressionSummary(currentSession, turns);
        await navigator.clipboard.writeText(fallbackSummary);
        showGlobalToast('后端压缩暂不可用，已复制本地摘要草稿');
        return;
      }
      const summary = [
        '# 手工压缩上下文',
        '',
        `模型来源: ${compression.source} / ${compression.modelId}`,
        '',
        '## 对话压缩',
        compression.conversationSummary,
        '',
        '## 广播板压缩',
        compression.broadcastSummary,
        '',
        '## 二次压缩上下文',
        compression.combinedSummary,
      ].join('\n');
      await navigator.clipboard.writeText(summary);
      showGlobalToast('上下文压缩结果已复制');
    } catch (error) {
      console.error('Failed to copy compressed summary:', error);
      showGlobalToast('复制压缩摘要失败');
    }
  };

  const handleInterruptCurrentProcess = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSession) return;
    closeMenu();
    const stopped = await coworkService.stopSession(currentSession.id);
    showGlobalToast(stopped ? '已请求打断当前进程' : '打断失败');
  };

  const promptExportTurnCount = useCallback((defaultTurnCount: number): number | null => {
    const suggestedTurnCount = Math.max(1, defaultTurnCount);
    const input = window.prompt(
      `请输入要导出的最近对话轮数（从最近往更早取）。\n默认 ${suggestedTurnCount} 轮；填更大时会按需补载更早记录。`,
      String(suggestedTurnCount)
    );

    if (input == null) {
      return null;
    }

    const parsed = Number.parseInt(input.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      showGlobalToast('请输入大于等于 1 的对话轮数');
      return null;
    }

    return parsed;
  }, []);

  const ensureRecentTurnsLoaded = useCallback(async (requiredTurnCount: number): Promise<typeof currentSession> => {
    if (!currentSession) {
      return null;
    }

    let loadedSession = currentSession;
    let loadedTurnCount = countConversationTurns(loadedSession.messages);
    let previousLoadedMessageCount = loadedSession.historyMeta?.loadedMessageCount ?? loadedSession.messages.length;

    while (loadedTurnCount < requiredTurnCount && loadedSession.historyMeta?.hasEarlierMessages) {
      const totalMessageCount = loadedSession.historyMeta?.totalMessageCount ?? previousLoadedMessageCount;
      const nextMessageLimit = Math.min(
        totalMessageCount,
        Math.max(previousLoadedMessageCount + HISTORY_LOAD_STEP, previousLoadedMessageCount * 2)
      );

      const nextSession = await coworkService.loadSession(loadedSession.id, {
        messageLimit: nextMessageLimit,
      });
      if (!nextSession) {
        break;
      }

      const nextLoadedMessageCount = nextSession.historyMeta?.loadedMessageCount ?? nextSession.messages.length;
      loadedSession = nextSession;
      loadedTurnCount = countConversationTurns(nextSession.messages);
      if (nextLoadedMessageCount <= previousLoadedMessageCount) {
        break;
      }
      previousLoadedMessageCount = nextLoadedMessageCount;
    }

    return loadedSession;
  }, [currentSession]);

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSession || isExportingImage) return;
    closeMenu();
    const requestedTurnCount = promptExportTurnCount(Math.min(Math.max(turns.length, 1), COLLAPSED_VISIBLE_TURN_COUNT));
    if (!requestedTurnCount) {
      return;
    }
    setIsExportingImage(true);
    const previousShowAllTurns = showAllTurns;
    const shouldExpandHistoryForExport = !showAllTurns;

    window.requestAnimationFrame(() => {
      void (async () => {
        try {
          const sessionForExport = await ensureRecentTurnsLoaded(requestedTurnCount) ?? currentSession;
          const availableTurnCount = countConversationTurns(sessionForExport.messages);
          const boundedExportTurnCount = Math.min(requestedTurnCount, Math.max(availableTurnCount, 1));

          if (boundedExportTurnCount < requestedTurnCount) {
            showGlobalToast(`仅找到 ${boundedExportTurnCount} 轮对话，已按现有记录导出`);
          }

          setExportTurnCount(boundedExportTurnCount);
          await SessionDetailHelpers.waitForNextFrame();
          await SessionDetailHelpers.waitForNextFrame();

          if (shouldExpandHistoryForExport) {
            setShowAllTurns(true);
            await SessionDetailHelpers.waitForNextFrame();
            await SessionDetailHelpers.waitForNextFrame();
          }

          const scrollContainer = scrollContainerRef.current;
          if (!scrollContainer) {
            throw new Error('Capture target not found');
          }
          const shouldFallbackToBrowserExport = (error?: string | null): boolean => {
            const normalized = String(error || '').trim().toLowerCase();
            if (!normalized) {
              return false;
            }
            return normalized.includes('not available in web version')
              || normalized.includes('capture api not available')
              || normalized.includes('save image api not available')
              || normalized.includes('image capture not available')
              || normalized.includes('image save not available');
          };

          const captureAndLoad = async (rect: SessionDetailHelpers.CaptureRect): Promise<HTMLImageElement> => {
            if (isWebBuild()) {
              const pngBase64 = await SessionDetailHelpers.captureScrollableViewportAsPngBase64(scrollContainer);
              return SessionDetailHelpers.loadImageFromBase64(pngBase64);
            }

            const chunk = await coworkService.captureSessionImageChunk({ rect });
            if (chunk.success && chunk.pngBase64) {
              return SessionDetailHelpers.loadImageFromBase64(chunk.pngBase64);
            }

            if (shouldFallbackToBrowserExport(chunk.error)) {
              const pngBase64 = await SessionDetailHelpers.captureScrollableViewportAsPngBase64(scrollContainer);
              return SessionDetailHelpers.loadImageFromBase64(pngBase64);
            }

            throw new Error(chunk.error || 'Failed to capture image chunk');
          };

          const savePngExport = async (pngBase64: string, fileName: string): Promise<boolean> => {
            if (isWebBuild()) {
              const saveResult = await window.electron.dialog.saveInlineFile({
                dataBase64: pngBase64,
                fileName,
                mimeType: 'image/png',
                cwd: currentSession.cwd,
                purpose: 'export',
              });
              if (saveResult.success && (!('canceled' in saveResult) || !saveResult.canceled)) {
                return true;
              }
              WebFileOperations.downloadFile(pngBase64, fileName, 'image/png');
              return true;
            }

            const saveResult = await coworkService.saveSessionResultImage({
              pngBase64,
              defaultFileName: fileName,
            });
            if (saveResult.success && (!('canceled' in saveResult) || !saveResult.canceled)) {
              return true;
            }
            if (shouldFallbackToBrowserExport(saveResult.error)) {
              WebFileOperations.downloadFile(pngBase64, fileName, 'image/png');
              return true;
            }
            if (!saveResult.success) {
              throw new Error(saveResult.error || 'Failed to export image');
            }
            return false;
          };

          const initialScrollTop = scrollContainer.scrollTop;
          try {
            const scrollRect = SessionDetailHelpers.domRectToCaptureRect(scrollContainer.getBoundingClientRect());
            if (scrollRect.width <= 0 || scrollRect.height <= 0) {
              throw new Error('Invalid capture area');
            }

            const scrollContentHeight = Math.max(scrollContainer.scrollHeight, scrollContainer.clientHeight);
            if (scrollContentHeight <= 0) {
              throw new Error('Invalid content height');
            }

            const toContentY = (viewportY: number): number => {
              const y = scrollContainer.scrollTop + (viewportY - scrollRect.y);
              return Math.max(0, Math.min(scrollContentHeight, y));
            };

            const userAnchors = scrollContainer.querySelectorAll<HTMLElement>('[data-export-role="user-message"]');
            const assistantAnchors = scrollContainer.querySelectorAll<HTMLElement>('[data-export-role="assistant-block"]');

            let contentStart = 0;
            let contentEnd = scrollContentHeight;

            if (userAnchors.length > 0) {
              contentStart = toContentY(userAnchors[0].getBoundingClientRect().top);
            } else if (assistantAnchors.length > 0) {
              contentStart = toContentY(assistantAnchors[0].getBoundingClientRect().top);
            }

            if (assistantAnchors.length > 0) {
              const lastAssistant = assistantAnchors[assistantAnchors.length - 1];
              contentEnd = toContentY(lastAssistant.getBoundingClientRect().bottom);
            } else if (userAnchors.length > 0) {
              const lastUser = userAnchors[userAnchors.length - 1];
              contentEnd = toContentY(lastUser.getBoundingClientRect().bottom);
            }

            const maxStart = Math.max(0, scrollContentHeight - 1);
            contentStart = Math.max(0, Math.min(maxStart, Math.round(contentStart)));
            contentEnd = Math.max(contentStart + 1, Math.min(scrollContentHeight, Math.round(contentEnd)));

            const outputHeight = contentEnd - contentStart;

            if (outputHeight > SessionDetailHelpers.MAX_EXPORT_CANVAS_HEIGHT) {
              throw new Error(`Export image is too tall (${outputHeight}px)`);
            }

            const segmentsEstimate = Math.ceil(outputHeight / Math.max(1, scrollRect.height)) + 1;
            if (segmentsEstimate > SessionDetailHelpers.MAX_EXPORT_SEGMENTS) {
              throw new Error('Export image is too long');
            }

            const canvas = document.createElement('canvas');
            canvas.width = scrollRect.width;
            canvas.height = outputHeight;
            const context = canvas.getContext('2d');
            if (!context) {
              throw new Error('Canvas context unavailable');
            }

            scrollContainer.scrollTop = Math.min(contentStart, Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight));
            await SessionDetailHelpers.waitForNextFrame();
            await SessionDetailHelpers.waitForNextFrame();

            const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
            let contentOffset = contentStart;
            while (contentOffset < contentEnd) {
              const targetScrollTop = Math.min(contentOffset, maxScrollTop);
              scrollContainer.scrollTop = targetScrollTop;
              await SessionDetailHelpers.waitForNextFrame();
              await SessionDetailHelpers.waitForNextFrame();

              const chunkImage = await captureAndLoad(scrollRect);
              const sourceYOffset = Math.max(0, contentOffset - targetScrollTop);
              const drawableHeight = Math.min(scrollRect.height - sourceYOffset, contentEnd - contentOffset);
              if (drawableHeight <= 0) {
                throw new Error('Failed to stitch export image');
              }
              const scaleY = chunkImage.naturalHeight / scrollRect.height;
              const sourceYInImage = Math.max(0, Math.round(sourceYOffset * scaleY));
              const sourceHeightInImage = Math.max(1, Math.min(
                chunkImage.naturalHeight - sourceYInImage,
                Math.round(drawableHeight * scaleY),
              ));

              context.drawImage(
                chunkImage,
                0,
                sourceYInImage,
                chunkImage.naturalWidth,
                sourceHeightInImage,
                0,
                contentOffset - contentStart,
                scrollRect.width,
                drawableHeight,
              );

              contentOffset += drawableHeight;
            }

            const pngDataUrl = canvas.toDataURL('image/png');
            const base64Index = pngDataUrl.indexOf(',');
            if (base64Index < 0) {
              throw new Error('Failed to encode export image');
            }

            const timestamp = SessionDetailHelpers.formatExportTimestamp(new Date());
            const fileName = SessionDetailHelpers.sanitizeExportFileName(`${currentSession.title}-${timestamp}.png`);
            const pngBase64 = pngDataUrl.slice(base64Index + 1);
            const saved = await savePngExport(pngBase64, fileName);
            if (saved) {
              showGlobalToast('图片导出成功');
              return;
            }
          } finally {
            scrollContainer.scrollTop = initialScrollTop;
          }
        } catch (error) {
          console.error('Failed to export session image:', error);
          showGlobalToast('导出图片失败');
        } finally {
          setExportTurnCount(null);
          setShowAllTurns(previousShowAllTurns);
          setIsExportingImage(false);
        }
      })();
    });
  };

  const handleExportMarkdown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSession) return;
    closeMenu();
    const requestedTurnCount = promptExportTurnCount(Math.min(Math.max(turns.length, 1), COLLAPSED_VISIBLE_TURN_COUNT));
    if (!requestedTurnCount) {
      return;
    }

    try {
      const sessionForExport = await ensureRecentTurnsLoaded(requestedTurnCount) ?? currentSession;
      const availableTurnCount = countConversationTurns(sessionForExport.messages);
      const boundedExportTurnCount = Math.min(requestedTurnCount, Math.max(availableTurnCount, 1));
      if (boundedExportTurnCount < requestedTurnCount) {
        showGlobalToast(`仅找到 ${boundedExportTurnCount} 轮对话，已按现有记录导出`);
      }
      const markdown = buildMarkdownExport(sessionForExport, { turnLimit: boundedExportTurnCount });
      const timestamp = SessionDetailHelpers.formatExportTimestamp(new Date());
      const fileName = SessionDetailHelpers.sanitizeExportFileName(`${sessionForExport.title}-${timestamp}.md`);
      const dataBase64 = encodeBase64Utf8(markdown);

      if (isWebBuild()) {
        WebFileOperations.downloadFile(dataBase64, fileName, 'text/markdown;charset=utf-8');
        showGlobalToast('Markdown 已下载到浏览器默认目录');
        return;
      }

      const result = await window.electron.dialog.saveInlineFile({
        dataBase64,
        fileName,
        mimeType: 'text/markdown',
        cwd: sessionForExport.cwd,
        purpose: 'export',
      });

      if (!result.success) {
        WebFileOperations.downloadFile(dataBase64, fileName, 'text/markdown;charset=utf-8');
        showGlobalToast('Markdown 已下载到浏览器默认目录');
        return;
      }

      showGlobalToast('Markdown 导出成功');
    } catch (error) {
      console.error('Failed to export session markdown:', error);
      showGlobalToast('导出 Markdown 失败');
    }
  };

  const handleConfirmDelete = async () => {
    if (!currentSession) return;
    await coworkService.deleteSession(currentSession.id);
    setShowConfirmDelete(false);
    if (onNavigateHome) {
      onNavigateHome();
    }
  };

  const handleCancelDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowConfirmDelete(false);
  };

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, []);

  const scrollToTurnBottom = useCallback((turnIndex: number) => {
    const container = scrollContainerRef.current;
    const turnElement = turnRefs.current[turnIndex];
    if (!container || !turnElement) return;

    const containerRect = container.getBoundingClientRect();
    const turnRect = turnElement.getBoundingClientRect();
    const targetTop = container.scrollTop + (turnRect.bottom - containerRect.top) - container.clientHeight + 20;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, []);

  const expandEarlyTurnsPreservingViewport = useCallback((afterExpand?: () => void) => {
    const container = scrollContainerRef.current;
    const previousScrollTop = container?.scrollTop ?? 0;
    const previousScrollHeight = container?.scrollHeight ?? 0;

    startTransition(() => setShowAllTurns(true));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const nextContainer = scrollContainerRef.current;
        if (!nextContainer) {
          afterExpand?.();
          return;
        }
        const deltaHeight = Math.max(0, nextContainer.scrollHeight - previousScrollHeight);
        nextContainer.scrollTop = previousScrollTop + deltaHeight;
        lastScrollTopRef.current = nextContainer.scrollTop;
        afterExpand?.();
      });
    });
  }, []);

  // Get the last message content for auto-scroll on streaming updates
  const lastMessage = currentSession?.messages?.[currentSession.messages.length - 1];
  const lastMessageContent = lastMessage?.content;

  const resolveLocalFilePath = useCallback((href: string, text: string) => {
    const hrefValue = typeof href === 'string' ? href.trim() : '';
    const textValue = typeof text === 'string' ? text.trim() : '';
    if (!hrefValue && !textValue) return null;

    const hrefRootRelative = hrefValue ? SessionDetailHelpers.parseRootRelativePath(hrefValue) : null;
    if (hrefRootRelative) {
      return hrefRootRelative;
    }

    if (hrefValue) {
      if (SessionDetailHelpers.isRelativePath(hrefValue) && currentSession?.cwd) {
        return SessionDetailHelpers.toAbsolutePathFromCwd(hrefValue, currentSession.cwd);
      }
      if (SessionDetailHelpers.isAbsolutePath(hrefValue)) {
        return SessionDetailHelpers.normalizeLocalPath(hrefValue, hrefValue);
      }
    }

    const textRootRelative = textValue ? SessionDetailHelpers.parseRootRelativePath(textValue) : null;
    if (textRootRelative) {
      return textRootRelative;
    }

    if (textValue) {
      if (SessionDetailHelpers.isRelativePath(textValue) && currentSession?.cwd) {
        return SessionDetailHelpers.toAbsolutePathFromCwd(textValue, currentSession.cwd);
      }
      if (SessionDetailHelpers.isAbsolutePath(textValue)) {
        return SessionDetailHelpers.normalizeLocalPath(textValue, textValue);
      }
    }

    return null;
  }, [currentSession?.cwd]);

  // Auto scroll to bottom when new messages arrive or content updates (streaming)
  useEffect(() => {
    if (!shouldAutoScroll) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
    }
    autoScrollRafRef.current = window.requestAnimationFrame(() => {
      autoScrollRafRef.current = null;
      const nextContainer = scrollContainerRef.current;
      if (nextContainer) {
        nextContainer.scrollTop = nextContainer.scrollHeight;
      }
    });
  }, [currentSession?.messages?.length, lastMessageContent, isStreaming, shouldAutoScroll]);

  const messages = currentSession?.messages;
  const deferredMessages = useDeferredValue(messages);
  const lastUserMessageIndex = useMemo(
    () => findLastUserMessageIndex(deferredMessages),
    [deferredMessages]
  );
  const historicalMessages = useMemo(
    () => (
      deferredMessages && lastUserMessageIndex > 0
        ? deferredMessages.slice(0, lastUserMessageIndex)
        : []
    ),
    [deferredMessages, lastUserMessageIndex]
  );
  const liveTurnMessages = useMemo(
    () => (
      deferredMessages && lastUserMessageIndex >= 0
        ? deferredMessages.slice(lastUserMessageIndex)
        : (deferredMessages ?? [])
    ),
    [deferredMessages, lastUserMessageIndex]
  );
  const historicalDisplayItems = useMemo(
    () => historicalMessages.length > 0 ? buildDisplayItems(historicalMessages) : [],
    [historicalMessages]
  );
  const historicalTurns = useMemo(
    () => historicalDisplayItems.length > 0 ? buildConversationTurns(historicalDisplayItems) : [],
    [historicalDisplayItems]
  );
  const liveDisplayItems = useMemo(
    () => liveTurnMessages.length > 0 ? buildDisplayItems(liveTurnMessages) : [],
    [liveTurnMessages]
  );
  const liveTurns = useMemo(
    () => liveDisplayItems.length > 0 ? buildConversationTurns(liveDisplayItems) : [],
    [liveDisplayItems]
  );
  // {标记} P1-TURN-SPLIT-CACHE: 流式阶段将已完成历史与最后一轮拆开，避免每次重算整段对话。
  const turns = useMemo(() => [...historicalTurns, ...liveTurns], [historicalTurns, liveTurns]);
  const loadedMessageCount = currentSession?.historyMeta?.loadedMessageCount ?? messages?.length ?? 0;
  const totalMessageCount = currentSession?.historyMeta?.totalMessageCount ?? loadedMessageCount;
  const hasEarlierHistoryOnServer = Boolean(currentSession?.historyMeta?.hasEarlierMessages);
  const remainingHistoryMessageCount = Math.max(0, totalMessageCount - loadedMessageCount);
  const currentViewportHeight = scrollContainerRef.current?.clientHeight ?? 0;
  const requiredHistoryPullDistancePx = currentViewportHeight > 0
    ? currentViewportHeight * AUTO_LOAD_REQUIRED_PULL_SCREENS
    : Number.POSITIVE_INFINITY;
  const canLoadEarlierHistory = hasEarlierHistoryOnServer && historyPullDistancePx >= requiredHistoryPullDistancePx;
  const remainingPullScreens = currentViewportHeight > 0
    ? Math.max(0, (requiredHistoryPullDistancePx - historyPullDistancePx) / currentViewportHeight)
    : AUTO_LOAD_REQUIRED_PULL_SCREENS;
  // {标记} P1-EXPORT-RECENT-ONLY: 导出时只放大最近 N 轮，不再为导出默认吞整段历史。
  const exportScopedTurns = useMemo(
    () => (exportTurnCount && exportTurnCount > 0 ? turns.slice(-exportTurnCount) : turns),
    [exportTurnCount, turns]
  );
  const hiddenTurnCount = Math.max(0, exportScopedTurns.length - COLLAPSED_VISIBLE_TURN_COUNT);
  const areEarlyTurnsCollapsed = hiddenTurnCount > 0 && !showAllTurns;
  const visibleTurns = useMemo(
    () => (areEarlyTurnsCollapsed ? exportScopedTurns.slice(-COLLAPSED_VISIBLE_TURN_COUNT) : exportScopedTurns),
    [areEarlyTurnsCollapsed, exportScopedTurns]
  );
  const visibleTurnStartIndex = exportScopedTurns.length - visibleTurns.length;
  const handleExpandEarlyTurns = useCallback(() => {
    startTransition(() => setShowAllTurns(true));
    window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);
  const handleCollapseEarlyTurns = useCallback(() => {
    startTransition(() => setShowAllTurns(false));
    window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);
  const handleLoadEarlierHistory = useCallback(() => {
    if (!currentSession || !hasEarlierHistoryOnServer || isLoadingEarlierHistory) {
      return;
    }

    const containerBeforeLoad = scrollContainerRef.current;
    const previousScrollTop = containerBeforeLoad?.scrollTop ?? 0;
    const previousScrollHeight = containerBeforeLoad?.scrollHeight ?? 0;

    setIsLoadingEarlierHistory(true);
    void (async () => {
      try {
        const nextMessageLimit = Math.min(
          totalMessageCount,
          Math.max(loadedMessageCount + HISTORY_LOAD_STEP, loadedMessageCount * 2)
        );
        const loadedSession = await coworkService.loadSession(currentSession.id, {
          messageLimit: nextMessageLimit,
        });
        if (loadedSession) {
          historyPullDistancePxRef.current = 0;
          setHistoryPullDistancePx(0);
          startTransition(() => setShowAllTurns(true));
          // {标记} P1-HISTORY-ANCHOR-PRESERVE: 前插旧消息后按 scrollHeight 增量恢复视口，避免跳顶。
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const container = scrollContainerRef.current;
              if (!container) return;
              const deltaHeight = Math.max(0, container.scrollHeight - previousScrollHeight);
              container.scrollTop = previousScrollTop + deltaHeight;
              lastScrollTopRef.current = container.scrollTop;
            });
          });
        }
      } finally {
        setIsLoadingEarlierHistory(false);
      }
    })();
  }, [currentSession, hasEarlierHistoryOnServer, isLoadingEarlierHistory, loadedMessageCount, totalMessageCount]);

  const handleMessagesScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceToBottom <= SessionDetailHelpers.AUTO_SCROLL_THRESHOLD;
    setShouldAutoScroll((prev) => (prev === isNearBottom ? prev : isNearBottom));

    if (areEarlyTurnsCollapsed || !hasEarlierHistoryOnServer || isLoadingEarlierHistory) {
      lastScrollTopRef.current = container.scrollTop;
      if (historyPullDistancePxRef.current !== 0) {
        historyPullDistancePxRef.current = 0;
        setHistoryPullDistancePx(0);
      }
      return;
    }

    const previousScrollTop = lastScrollTopRef.current;
    lastScrollTopRef.current = container.scrollTop;
    if (previousScrollTop == null) {
      return;
    }

    const scrollDelta = previousScrollTop - container.scrollTop;
    let nextPullDistancePx = historyPullDistancePxRef.current;
    if (scrollDelta > 0) {
      nextPullDistancePx += scrollDelta;
    } else if (scrollDelta < 0) {
      nextPullDistancePx = Math.max(0, nextPullDistancePx + scrollDelta);
    }

    if (nextPullDistancePx !== historyPullDistancePxRef.current) {
      historyPullDistancePxRef.current = nextPullDistancePx;
      setHistoryPullDistancePx(nextPullDistancePx);
    }

    const requiredPullDistancePx = container.clientHeight * AUTO_LOAD_REQUIRED_PULL_SCREENS;
    if (container.scrollTop > AUTO_LOAD_TOP_THRESHOLD_PX || nextPullDistancePx < requiredPullDistancePx) {
      return;
    }

    historyPullDistancePxRef.current = 0;
    setHistoryPullDistancePx(0);
    handleLoadEarlierHistory();
  }, [areEarlyTurnsCollapsed, handleLoadEarlierHistory, hasEarlierHistoryOnServer, isLoadingEarlierHistory]);
  const scrollToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!showAllTurns && hiddenTurnCount > 0) {
      startTransition(() => setShowAllTurns(true));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const nextContainer = scrollContainerRef.current;
          if (!nextContainer) return;
          nextContainer.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
      return;
    }
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }, [hiddenTurnCount, showAllTurns]);
  const scrollToPreviousTurnBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || turns.length < 2) {
      scrollToTop();
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const viewportFocusY = containerRect.top + container.clientHeight * 0.5;
    let activeTurnIndex = -1;

    for (let index = 0; index < turns.length; index += 1) {
      const turnElement = turnRefs.current[index];
      if (!turnElement) {
        continue;
      }
      const turnRect = turnElement.getBoundingClientRect();
      if (turnRect.top <= viewportFocusY + 8) {
        activeTurnIndex = index;
      }
    }

    if (activeTurnIndex < 0) {
      activeTurnIndex = visibleTurnStartIndex + visibleTurns.length - 1;
    }

    const previousTurnIndex = activeTurnIndex - 1;
    if (previousTurnIndex < 0) {
      scrollToTop();
      return;
    }

    if (areEarlyTurnsCollapsed && previousTurnIndex < visibleTurnStartIndex) {
      expandEarlyTurnsPreservingViewport(() => {
        scrollToTurnBottom(previousTurnIndex);
      });
      return;
    }

    scrollToTurnBottom(previousTurnIndex);
  }, [
    areEarlyTurnsCollapsed,
    expandEarlyTurnsPreservingViewport,
    scrollToTop,
    scrollToTurnBottom,
    turns.length,
    visibleTurnStartIndex,
    visibleTurns.length,
  ]);

  if (!currentSession) {
    return null;
  }

  const resolvedRoles = resolveAgentRolesFromConfig(configService.getConfig());
  const currentRoleKey = (currentSession.agentRoleKey && ['organizer', 'writer', 'designer', 'analyst'].includes(currentSession.agentRoleKey))
    ? currentSession.agentRoleKey as AgentRoleKey
    : 'organizer';
  const assistantRoleLabel = getAgentRoleDisplayLabel(currentRoleKey, resolvedRoles);
  const assistantRoleAvatar = getAgentRoleDisplayAvatar(currentRoleKey, resolvedRoles);
  const sessionSourceLabel = inferSessionSource(currentSession) === 'external' ? '外部接入' : '桌面对话';
  const sessionSourceBadgeClassName = sessionSourceLabel === '外部接入'
    ? 'border-sky-400/35 bg-sky-400/12 text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/12 dark:text-sky-200'
    : 'border-amber-400/35 bg-amber-400/12 text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/12 dark:text-amber-200';
  const rightDockActions = useMemo<CoworkRightDockAction[]>(
    () => (
      turns.length > 0
        ? [
            {
              id: 'jump-top',
              label: '跳到最前',
              icon: 'jump-top',
              onClick: scrollToTop,
            },
            {
              id: 'jump-prev',
              label: '跳到上轮末尾',
              icon: 'jump-prev',
              onClick: scrollToPreviousTurnBottom,
            },
            {
              id: 'jump-bottom',
              label: '跳到最新',
              icon: 'jump-bottom',
              onClick: scrollToBottom,
            },
          ]
        : []
    ),
    [scrollToBottom, scrollToPreviousTurnBottom, scrollToTop, turns.length]
  );

  useEffect(() => {
    onSetRightDockActions?.(rightDockActions);
    return () => {
      onSetRightDockActions?.([]);
    };
  }, [onSetRightDockActions, rightDockActions]);

  const renderConversationTurns = () => {
    if (turns.length === 0) {
      if (!isStreaming) return null;
      return (
        <div data-export-role="assistant-block">
          <AssistantTurnBlock
            turn={{
              id: 'streaming-only',
              userMessage: null,
              assistantItems: [],
            }}
            resolveLocalFilePath={resolveLocalFilePath}
            showTypingIndicator
            showCopyButtons={!isStreaming}
          />
        </div>
      );
    }

    return visibleTurns.map((turn, index) => {
      const actualIndex = visibleTurnStartIndex + index;
      const isLastTurn = actualIndex === turns.length - 1;
      const showTypingIndicator = isStreaming && isLastTurn && !hasRenderableAssistantContent(turn);
      const showAssistantBlock = turn.assistantItems.length > 0 || showTypingIndicator;

      return (
        <div
          key={turn.id}
          ref={(node) => {
            turnRefs.current[actualIndex] = node;
          }}
          data-turn-id={turn.id}
          style={{ contentVisibility: 'auto', containIntrinsicSize: '720px' }}
        >
          {turn.userMessage && (
            <div data-export-role="user-message">
              <UserMessageItem
                message={turn.userMessage}
                skills={skills}
                userLabel="用户"
                userAvatar="🙂"
              />
            </div>
          )}
          {showAssistantBlock && (
            <div data-export-role="assistant-block">
              <AssistantTurnBlock
                turn={turn}
                resolveLocalFilePath={resolveLocalFilePath}
                mapDisplayText={IDENTITY_DISPLAY_TEXT}
                showTypingIndicator={showTypingIndicator}
                showCopyButtons={!isStreaming}
                roleLabel={assistantRoleLabel}
                roleAvatar={assistantRoleAvatar}
              />
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div
      ref={detailRootRef}
      data-view="cowork-session-detail"
      data-session-id={currentSession.id}
      className="relative flex-1 flex flex-col dark:bg-claude-darkBg bg-transparent h-full"
    >
      {/* Header */}
      <div className="draggable flex min-h-14 items-center justify-between gap-3 px-4 py-2 border-b dark:border-claude-darkBorder/50 border-claude-border/30 backdrop-blur-xl bg-gradient-pearl-header shrink-0">
        {/* Left side: Toggle buttons (when collapsed) + Title + Sandbox badge */}
        <div className="flex h-full items-center gap-2 min-w-0">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors')}
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameSave(e);
                }
                if (e.key === 'Escape') {
                  handleRenameCancel(e);
                }
              }}
              onBlur={handleRenameBlur}
              className="non-draggable min-w-0 max-w-[300px] rounded-xl border border-white/55 bg-white/88 px-2.5 py-1.5 text-sm font-medium text-claude-text shadow-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/35 dark:border-white/10 dark:bg-claude-darkBg/90 dark:text-claude-darkText"
            />
          ) : (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 leading-none">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-1 font-medium text-violet-700 dark:border-violet-300/20 dark:bg-violet-300/12 dark:text-violet-200">
                  {renderAgentRoleAvatar(assistantRoleAvatar, {
                    alt: assistantRoleLabel,
                    className: `${UI_MENU_ICON_CLASS} text-[11px]`,
                  })}
                  <span className={`truncate max-w-[120px] sm:max-w-[160px] ${UI_LABEL_TEXT_CLASS}`}>{assistantRoleLabel}</span>
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-1 font-medium max-[380px]:hidden ${sessionSourceBadgeClassName} ${UI_LABEL_TEXT_CLASS}`}>
                  {sessionSourceLabel}
                </span>
              </div>
              <h1 className={`mt-1 leading-tight font-medium dark:text-claude-darkText text-claude-text truncate ${isMobileViewport ? 'text-sm max-w-[190px]' : isMediumViewport ? 'text-sm max-w-[320px]' : 'text-sm max-w-[420px]'}`}>
                {currentSession.title || '新会话'}
              </h1>
            </div>
          )}
        </div>

        {/* Right side: Folder + Menu */}
        <div className="non-draggable flex items-center gap-1 shrink-0">
          {/* Folder button */}
          <button
            type="button"
            onClick={handleOpenFolder}
            className={`${getTouchButtonClass('inline-flex items-center justify-center rounded-lg text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:hover:text-claude-darkText hover:text-claude-text transition-colors')} ${isMobileViewport ? 'px-0' : 'gap-1.5 px-2.5'}`}
            aria-label={'打开文件夹'}
            title={truncatePath(currentSession.cwd)}
          >
            <FolderIcon className="h-4 w-4" />
            {!isMobileViewport && (
              <span className={`truncate text-xs ${isMediumViewport ? 'max-w-[84px]' : 'max-w-[120px]'}`}>
                {truncatePath(currentSession.cwd)}
              </span>
            )}
          </button>

          {/* Menu button */}
          <button
            ref={actionButtonRef}
            type="button"
            onClick={openMenu}
            className={getTouchButtonClass('inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors')}
            aria-label={'更多操作'}
          >
            <EllipsisHorizontalIcon className={UI_MENU_ICON_CLASS} />
          </button>
          {!isMobileViewport && <WindowTitleBar inline className="ml-1" />}
        </div>
      </div>

      {/* Floating Menu */}
      {menuPosition && (
        <CoworkSessionActionMenu
          ref={menuRef}
          top={menuPosition.y}
          left={menuPosition.x}
          pinned={currentSession.pinned}
          isExportingImage={isExportingImage}
          canInterrupt={currentSession.status === 'running'}
          onRename={handleRenameClick}
          onTogglePin={handleTogglePin}
          onCompress={handleCopyCompressedSummary}
          onInterrupt={handleInterruptCurrentProcess}
          onShare={handleShareClick}
          onExportMarkdown={handleExportMarkdown}
          onDelete={handleDeleteClick}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop"
          onClick={handleCancelDelete}
        >
          <div
            className="w-full max-w-sm mx-4 dark:bg-claude-darkSurface bg-claude-surface rounded-2xl shadow-modal overflow-hidden modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-500" />
              </div>
              <h2 className="text-base font-semibold dark:text-claude-darkText text-claude-text">
                {'确认删除任务'}
              </h2>
            </div>

            {/* Content */}
            <div className="px-5 pb-4">
              <p className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'此操作无法撤销，任务的所有消息记录将被永久删除。'}
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t dark:border-claude-darkBorder border-claude-border">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
              >
                {'取消'}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                {'删除任务'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto min-h-0 px-4 pt-4"
      >
        <div className="mx-auto w-full max-w-[920px]">
          {!areEarlyTurnsCollapsed && hasEarlierHistoryOnServer && (
            <div className="px-4 pb-2">
              <div className="mx-auto max-w-3xl">
                <button
                  type="button"
                  onClick={handleLoadEarlierHistory}
                  disabled={isLoadingEarlierHistory || !canLoadEarlierHistory}
                  className="w-full rounded-2xl border border-dashed border-claude-border/70 bg-claude-surface/55 px-4 py-3 text-left text-sm text-claude-textSecondary transition-colors hover:bg-claude-surfaceHover disabled:cursor-wait disabled:opacity-70 dark:border-claude-darkBorder/70 dark:bg-claude-darkSurface/45 dark:text-claude-darkTextSecondary dark:hover:bg-claude-darkSurfaceHover/60"
                >
                  {isLoadingEarlierHistory
                    ? '正在加载更早对话...'
                    : canLoadEarlierHistory
                      ? `已满足上拉两屏条件，点击继续加载更早内容${remainingHistoryMessageCount > 0 ? `（约 ${remainingHistoryMessageCount} 条消息）` : ''}`
                      : `继续上拉约 ${remainingPullScreens.toFixed(1)} 屏后，才会加载更早内容${remainingHistoryMessageCount > 0 ? `（约 ${remainingHistoryMessageCount} 条消息）` : ''}`}
                </button>
              </div>
            </div>
          )}
          {hiddenTurnCount > 0 && (
            <div className="px-4 pb-2">
              <div className="mx-auto max-w-3xl">
                {areEarlyTurnsCollapsed ? (
                  <button
                    type="button"
                    onClick={handleExpandEarlyTurns}
                    className="w-full rounded-2xl border border-dashed border-claude-border/70 bg-claude-surface/55 px-4 py-3 text-left text-sm text-claude-textSecondary transition-colors hover:bg-claude-surfaceHover dark:border-claude-darkBorder/70 dark:bg-claude-darkSurface/45 dark:text-claude-darkTextSecondary dark:hover:bg-claude-darkSurfaceHover/60"
                  >
                    显示更早的 {hiddenTurnCount} 轮对话
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCollapseEarlyTurns}
                    className="w-full rounded-2xl border border-transparent bg-transparent px-4 py-2 text-left text-xs text-claude-textSecondary transition-colors hover:text-claude-text dark:text-claude-darkTextSecondary dark:hover:text-claude-darkText"
                  >
                    收起更早对话
                  </button>
                )}
              </div>
            </div>
          )}
          {renderConversationTurns()}
          <div className="h-20" />
        </div>
      </div>

      {/* Streaming Activity Bar */}
      {isStreaming && <StreamingActivityBar messages={currentSession.messages} />}

      {/* Input Area */}
      <div className="p-4 shrink-0">
        <div className="max-w-[920px] mx-auto">
          <CoworkPromptInput
            onSubmit={onContinue}
            onStop={onStop}
            isStreaming={isStreaming}
            placeholder={'继续对话...'}
            disabled={false}
            onManageSkills={onManageSkills}
            size="large"
            showModelSelector={true}
            sessionRoleKey={currentSession.agentRoleKey}
            sessionModelId={currentSession.modelId}
            lockModelSelector={true}
          />
        </div>
      </div>
    </div>
  );
};

export default CoworkSessionDetail;
