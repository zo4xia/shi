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
  ShareIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { FolderIcon } from '@heroicons/react/24/solid';
import { coworkService } from '../../services/cowork';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import ComposeIcon from '../icons/ComposeIcon';
import PuzzleIcon from '../icons/PuzzleIcon';
import EllipsisHorizontalIcon from '../icons/EllipsisHorizontalIcon';
import PencilSquareIcon from '../icons/PencilSquareIcon';
import TrashIcon from '../icons/TrashIcon';
import WindowTitleBar from '../window/WindowTitleBar';
import Tooltip from '../ui/Tooltip';
import { getCompactFolderName } from '../../utils/path';
import { WebFileOperations } from '../../utils/fileOperations';
import { isWebBuild } from '../../utils/platform';
import * as SessionDetailHelpers from './sessionDetailHelpers';


interface CoworkSessionDetailProps {
  onManageSkills?: () => void;
  onContinue: (prompt: string, skillPrompt?: string, imageAttachments?: CoworkImageAttachment[]) => void;
  onStop: () => void;
  onNavigateHome?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

// PushPinIcon component for pin/unpin functionality
const PushPinIcon: React.FC<React.SVGProps<SVGSVGElement> & { slashed?: boolean }> = ({
  slashed,
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <g transform="rotate(45 12 12)">
      <path d="M9 3h6l-1 5 2 2v2H8v-2l2-2-1-5z" />
      <path d="M12 12v9" />
    </g>
    {slashed && <path d="M5 5L19 19" />}
  </svg>
);

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
}> = React.memo(({ images, compact = false }) => {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
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
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-2'}`}>
        {renderableImages.map(({ image, src }, idx) => (
          <div key={`${image.name}-${idx}`} className="relative group">
            <img
              src={src}
              alt={image.name}
              className="max-h-48 max-w-[16rem] rounded-lg object-contain cursor-pointer border dark:border-claude-darkBorder/50 border-claude-border/50 hover:border-claude-accent/50 transition-colors"
              title={image.name}
              onClick={() => setExpandedImage(src)}
            />
            <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity truncate pointer-events-none">
              <PhotoIcon className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{image.name}</span>
            </div>
          </div>
        ))}
      </div>
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
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

const UserMessageItem: React.FC<{ message: CoworkMessage; skills: Skill[] }> = React.memo(({ message, skills }) => {
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
            <div className="w-full min-w-0 flex flex-col items-end">
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
}> = React.memo(({
  message,
  resolveLocalFilePath,
  mapDisplayText,
  showCopyButton = false,
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
      <AssistantSectionBadge
        label={badgeLabel}
        tone={tone}
        detail={badgeDetail}
        pulse={Boolean(message.metadata?.isStreaming) && isFormalReply}
      />
      <div className="dark:text-claude-darkText text-claude-text">
        {cacheHit && (
          <div className="mb-2">
            <CacheHitBadge source={cacheSource} />
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
          <MessageImageGallery images={generatedImages} compact={!displayContent?.trim()} />
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
}> = React.memo(({
  turn,
  resolveLocalFilePath,
  mapDisplayText,
  showTypingIndicator = false,
  showCopyButtons = true,
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
}) => {
  const isMac = window.electron.platform === 'darwin';
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

            const captureAndLoad = async (rect: SessionDetailHelpers.CaptureRect): Promise<HTMLImageElement> => {
              if (isWebBuild()) {
                const pngBase64 = await SessionDetailHelpers.captureScrollableViewportAsPngBase64(scrollContainer);
                return SessionDetailHelpers.loadImageFromBase64(pngBase64);
              }
              const chunk = await coworkService.captureSessionImageChunk({ rect });
              if (!chunk.success || !chunk.pngBase64) {
                throw new Error(chunk.error || 'Failed to capture image chunk');
              }
              return SessionDetailHelpers.loadImageFromBase64(chunk.pngBase64);
            };

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
            const saveResult = isWebBuild()
              ? await window.electron.dialog.saveInlineFile({
                dataBase64: pngBase64,
                fileName,
                mimeType: 'image/png',
                cwd: currentSession.cwd,
                purpose: 'export',
              })
              : await coworkService.saveSessionResultImage({
                pngBase64,
                defaultFileName: fileName,
              });
            if (saveResult.success && (!('canceled' in saveResult) || !saveResult.canceled)) {
              showGlobalToast('图片导出成功');
              return;
            }
            if (!saveResult.success) {
              throw new Error(saveResult.error || 'Failed to export image');
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
        const saveResult = await window.electron.dialog.saveInlineFile({
          dataBase64,
          fileName,
          mimeType: 'text/markdown',
          cwd: sessionForExport.cwd,
          purpose: 'export',
        });
        if (saveResult.success) {
          showGlobalToast('Markdown 导出成功');
          return;
        }
        // {标记} P1-MD-EXPORT-WEB: Web 端优先写缓存目录，失败时回退浏览器下载，避免无响应。
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
        throw new Error(result.error || 'Failed to export markdown');
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
              <UserMessageItem message={turn.userMessage} skills={skills} />
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
              />
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div ref={detailRootRef} className="relative flex-1 flex flex-col dark:bg-claude-darkBg bg-transparent h-full">
      {/* Header */}
      <div className="draggable flex h-12 items-center justify-between px-4 border-b dark:border-claude-darkBorder/50 border-claude-border/30 backdrop-blur-xl bg-gradient-pearl-header shrink-0">
        {/* Left side: Toggle buttons (when collapsed) + Title + Sandbox badge */}
        <div className="flex h-full items-center gap-2 min-w-0">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
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
            <h1 className="text-sm leading-none font-medium dark:text-claude-darkText text-claude-text truncate max-w-[360px]">
              {currentSession.title || '新会话'}
            </h1>
          )}
        </div>

        {/* Right side: Folder + Menu */}
        <div className="non-draggable flex items-center gap-1">
          {/* Folder button */}
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:hover:text-claude-darkText hover:text-claude-text transition-colors"
            aria-label={'打开文件夹'}
          >
            <FolderIcon className="h-4 w-4" />
            <span className="max-w-[120px] truncate text-xs">
              {truncatePath(currentSession.cwd)}
            </span>
          </button>

          {/* Menu button */}
          <button
            ref={actionButtonRef}
            type="button"
            onClick={openMenu}
            className="p-1.5 rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
            aria-label={'更多操作'}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </button>
          <WindowTitleBar inline className="ml-1" />
        </div>
      </div>

      {/* Floating Menu */}
      {menuPosition && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-popover popover-enter overflow-hidden"
          style={{ top: menuPosition.y, left: menuPosition.x }}
          role="menu"
        >
          <button
            type="button"
            onClick={handleRenameClick}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
          >
            <PencilSquareIcon className="h-4 w-4" />
            {'重命名'}
          </button>
          <button
            type="button"
            onClick={handleTogglePin}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
          >
            <PushPinIcon
              slashed={currentSession.pinned}
              className={`h-4 w-4 ${currentSession.pinned ? 'opacity-60' : ''}`}
            />
            {currentSession.pinned ? '取消置顶' : '置顶任务'}
          </button>
          <button
            type="button"
            onClick={handleShareClick}
            disabled={isExportingImage}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShareIcon className="h-4 w-4" />
            {'分享'}
          </button>
          <button
            type="button"
            onClick={handleExportMarkdown}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
          >
            <ShareIcon className="h-4 w-4" />
            {'导出 Markdown'}
          </button>
          <button
            type="button"
            onClick={handleDeleteClick}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <TrashIcon className="h-4 w-4" />
            {'删除任务'}
          </button>
        </div>
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

      {turns.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-24 z-20">
          <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-white/55 bg-white/72 p-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-claude-darkSurface/72">
          <Tooltip content={'跳到最前'} position="left" delay={120}>
            <button
              type="button"
              onClick={scrollToTop}
              aria-label={'跳到最前'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-claude-textSecondary transition-colors hover:bg-white/80 hover:text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/30 dark:text-claude-darkTextSecondary dark:hover:bg-white/8 dark:hover:text-claude-darkText"
            >
              <ChevronDoubleUpIcon className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content={'跳到上轮末尾'} position="left" delay={120}>
            <button
              type="button"
              onClick={scrollToPreviousTurnBottom}
              aria-label={'跳到上轮末尾'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-claude-textSecondary transition-colors hover:bg-white/80 hover:text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/30 dark:text-claude-darkTextSecondary dark:hover:bg-white/8 dark:hover:text-claude-darkText"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content={'跳到最新'} position="left" delay={120}>
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label={'跳到最新'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-claude-textSecondary transition-colors hover:bg-white/80 hover:text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/30 dark:text-claude-darkTextSecondary dark:hover:bg-white/8 dark:hover:text-claude-darkText"
            >
              <ChevronDoubleDownIcon className="h-4 w-4" />
            </button>
          </Tooltip>
          </div>
        </div>
      )}

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
