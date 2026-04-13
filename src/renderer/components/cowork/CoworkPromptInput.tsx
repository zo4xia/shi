import { ComputerDesktopIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/solid';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    BROWSER_EYES_CURRENT_PAGE_STORE_KEY,
    type BrowserEyesCurrentPageState,
} from '../../../shared/browserEyesState';
import { AGENT_ROLE_ORDER } from '../../../shared/agentRoleConfig';
import { UPLOAD_STORAGE_BOUNDARY_NOTICE } from '../../../shared/storageBoundaryCopy';
import { useTimedConversationActionStatus } from '../../hooks/useTimedConversationActionStatus';
import { coworkService } from '../../services/cowork';
import { requestEmbeddedBrowserOpen } from '../../services/embeddedBrowser';
import { skillService } from '../../services/skill';
import { localStore } from '../../services/store';
import { showGlobalToast } from '../../services/toast';
import { RootState } from '../../store';
import { setDraftPrompt } from '../../store/slices/coworkSlice';
import { setSkills, toggleActiveSkill } from '../../store/slices/skillSlice';
import { CoworkImageAttachment } from '../../types/cowork';
import { Skill } from '../../types/skill';
import { getCompactFolderName } from '../../utils/path';
import {
    chunkTextForAttachment,
    parseGeneratedTextChunkName,
    shouldSplitTextFile,
    splitLargeTextFile,
    type GeneratedTextChunkDescriptor,
} from '../../utils/textFileChunking';
import PaperClipIcon from '../icons/PaperClipIcon';
import XMarkIcon from '../icons/XMarkIcon';
import ConversationActionBar from './ConversationActionBar';
import type { ConversationActionStatus } from './conversationActionStatus';
import PromptToolRow from './PromptToolRow';

type CoworkAttachment = {
  path: string;
  name: string;
  isImage?: boolean;
  dataUrl?: string;
  chunkDescriptor?: GeneratedTextChunkDescriptor | null;
};

const INPUT_FILE_LABEL = '输入文件';
const MAX_PROMPT_CHARS = 120000;
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const SERVER_PARSED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx']);
const SERVER_PARSED_DOCUMENT_MIME_HINTS = [
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const PARSED_DOCUMENT_MAX_CHARACTERS = 400_000;

const isImagePath = (filePath: string): boolean => {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};

const isImageMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith('image/');
};

const extractBase64FromDataUrl = (dataUrl: string): { mimeType: string; base64Data: string } | null => {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64Data: match[2] };
};

const getFileNameFromPath = (path: string): string => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
};

const getFileExtension = (fileName: string): string => {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
};

const splitBaseName = (fileName: string): { name: string; extension: string } => {
  const index = fileName.lastIndexOf('.');
  if (index <= 0) {
    return { name: fileName, extension: '' };
  }
  return {
    name: fileName.slice(0, index),
    extension: fileName.slice(index),
  };
};

const extractFirstUrl = (input: string): string | null => {
  const matched = input.match(URL_PATTERN)?.[0]?.trim();
  return matched || null;
};

const clampPromptValue = (input: string): { value: string; wasTruncated: boolean } => {
  if (input.length <= MAX_PROMPT_CHARS) {
    return { value: input, wasTruncated: false };
  }
  return {
    value: input.slice(0, MAX_PROMPT_CHARS),
    wasTruncated: true,
  };
};

const getSkillDirectoryFromPath = (skillPath: string): string => {
  const normalized = skillPath.trim().replace(/\\/g, '/');
  return normalized.replace(/\/SKILL\.md$/i, '') || normalized;
};

const isServerParsedDocumentFile = (file: File): boolean => {
  const fileType = file.type.trim().toLowerCase();
  if (fileType && SERVER_PARSED_DOCUMENT_MIME_HINTS.some((item) => fileType.includes(item))) {
    return true;
  }
  return SERVER_PARSED_DOCUMENT_EXTENSIONS.has(getFileExtension(file.name));
};

const buildExtractedTextChunkFiles = (sourceName: string, fileType: string, extractedText: string): File[] => {
  const chunks = chunkTextForAttachment(extractedText);
  const { name } = splitBaseName(sourceName);
  if (chunks.length <= 1) {
    const content = [
      `来源文件: ${sourceName}`,
      `提取类型: ${fileType}`,
      '',
      chunks[0] || extractedText,
    ].join('\n');
    return [new File([content], `${name}.extracted.txt`, { type: 'text/plain' })];
  }

  const totalLabel = String(chunks.length).padStart(2, '0');
  return chunks.map((chunk, index) => {
    const partLabel = String(index + 1).padStart(2, '0');
    const content = [
      `来源文件: ${sourceName}`,
      `提取类型: ${fileType}`,
      `分块: ${index + 1}/${chunks.length}`,
      '',
      chunk,
    ].join('\n');
    return new File([content], `${name}.extracted.part-${partLabel}-of-${totalLabel}.txt`, {
      type: 'text/plain',
    });
  });
};

const buildInlinedSkillPrompt = (skill: Skill): string => {
  const skillDirectory = getSkillDirectoryFromPath(skill.skillPath);
  return [
    `## Skill: ${skill.name}`,
    '<skill_context>',
    `  <location>${skill.skillPath}</location>`,
    `  <directory>${skillDirectory}</directory>`,
    '  <path_rules>',
    '    Resolve relative file references from this skill against <directory>.',
    '    Do not assume skills are under the current workspace directory.',
    '  </path_rules>',
    '</skill_context>',
    '',
    skill.prompt,
  ].join('\n');
};

const describeAttachmentDisplay = (attachment: CoworkAttachment): { primary: string; secondary?: string } => {
  if (!attachment.chunkDescriptor) {
    return { primary: attachment.name };
  }

  const sequence = `${String(attachment.chunkDescriptor.partNumber).padStart(2, '0')}/${String(attachment.chunkDescriptor.totalParts).padStart(2, '0')}`;
  return {
    primary: attachment.chunkDescriptor.sourceName,
    secondary: attachment.chunkDescriptor.kind === 'parsed_extract'
      ? `解析分块 ${sequence}`
      : `文本分片 ${sequence}`,
  };
};

const buildAttachmentPromptLines = (attachments: CoworkAttachment[]): string[] => {
  const lines: string[] = [];
  const chunkGroups = new Map<string, GeneratedTextChunkDescriptor & { paths: string[] }>();

  for (const attachment of attachments) {
    if (attachment.path.startsWith('inline:')) {
      continue;
    }

    if (!attachment.chunkDescriptor) {
      lines.push(`${INPUT_FILE_LABEL}: ${attachment.path}`);
      continue;
    }

    const groupKey = `${attachment.chunkDescriptor.kind}:${attachment.chunkDescriptor.sourceName}:${attachment.chunkDescriptor.totalParts}`;
    const existing = chunkGroups.get(groupKey);
    if (existing) {
      existing.paths.push(attachment.path);
      continue;
    }

    chunkGroups.set(groupKey, {
      ...attachment.chunkDescriptor,
      paths: [attachment.path],
    });
  }

  for (const group of chunkGroups.values()) {
    lines.push(
      `${INPUT_FILE_LABEL}说明: ${group.sourceName} 已按顺序拆成 ${group.totalParts} 份，请把这些 part 视为同一份文件连续处理。`
    );
    lines.push(
      `${INPUT_FILE_LABEL}清单: source_name=${group.sourceName}; total_parts=${group.totalParts}; file_names=${group.paths.map((item) => getFileNameFromPath(item)).join(', ')}`
    );
    for (const path of group.paths) {
      lines.push(`${INPUT_FILE_LABEL}: ${path}`);
    }
  }

  return lines;
};

const areSkillsEquivalent = (left: Skill[], right: Skill[]): boolean => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((skill, index) => {
    const other = right[index];
    return Boolean(other)
      && skill.id === other.id
      && skill.name === other.name
      && skill.skillPath === other.skillPath
      && skill.prompt === other.prompt
      && skill.enabled === other.enabled;
  });
};

export interface CoworkPromptInputRef {
  /** 设置输入框值 */
  setValue: (value: string) => void;
  /** 聚焦输入框 */
  focus: () => void;
}

export interface CoworkSubmitOptions {
  zenMode?: boolean;
}

interface CoworkPromptInputProps {
  onSubmit: (prompt: string, skillPrompt?: string, imageAttachments?: CoworkImageAttachment[], submitOptions?: CoworkSubmitOptions) => void;
  onStop?: () => void;
  onManualCompress?: () => void | Promise<void>;
  isManualCompressing?: boolean;
  manualCompressStatus?: ConversationActionStatus | null;
  onInterruptProcess?: () => void | Promise<void>;
  isInterruptingProcess?: boolean;
  interruptProcessStatus?: ConversationActionStatus | null;
  canInterruptProcess?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  disabled?: boolean;
  size?: 'normal' | 'large';
  workingDirectory?: string;
  onWorkingDirectoryChange?: (dir: string) => void;
  showFolderSelector?: boolean;
  showModelSelector?: boolean;
  onManageSkills?: () => void;
  sessionRoleKey?: string;
  sessionModelId?: string;
  lockModelSelector?: boolean;
}

const CoworkPromptInput = React.forwardRef<CoworkPromptInputRef, CoworkPromptInputProps>(
  (props, ref) => {
    const {
      onSubmit,
      onStop,
      onManualCompress,
      isManualCompressing = false,
      manualCompressStatus = null,
      onInterruptProcess,
      isInterruptingProcess = false,
      interruptProcessStatus = null,
      canInterruptProcess = false,
      isStreaming = false,
      placeholder = '输入你的任务...',
      disabled = false,
      size = 'normal',
      workingDirectory = '',
      onWorkingDirectoryChange,
      showFolderSelector = false,
      showModelSelector = false,
      onManageSkills,
      sessionRoleKey,
      sessionModelId,
      lockModelSelector = false,
    } = props;
    const dispatch = useDispatch();
    const draftPrompt = useSelector((state: RootState) => state.cowork.draftPrompt);
    const initialPrompt = clampPromptValue(draftPrompt);
    const [value, setValue] = useState(initialPrompt.value);
    const [attachments, setAttachments] = useState<CoworkAttachment[]>([]);
    const [showFolderMenu, setShowFolderMenu] = useState(false);
    const [showFolderRequiredWarning, setShowFolderRequiredWarning] = useState(false);
    const [inputWasTruncated, setInputWasTruncated] = useState(initialPrompt.wasTruncated);
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const [zenModeEnabled, setZenModeEnabled] = useState(false);
    const [isClearingBroadcastBoard, setIsClearingBroadcastBoard] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const folderButtonRef = useRef<HTMLButtonElement>(null);
    const dragDepthRef = useRef(0);
    const skillsLoadAttemptedRef = useRef(false);
    const skillsLoadPromiseRef = useRef<Promise<Skill[]> | null>(null);
    const draftPromptRef = useRef(draftPrompt);

  useEffect(() => {
    draftPromptRef.current = draftPrompt;
  }, [draftPrompt]);

  const updateValue = useCallback((nextValue: string) => {
    const normalized = clampPromptValue(nextValue);
    setValue(normalized.value);
    setInputWasTruncated(normalized.wasTruncated);
    return normalized.value;
  }, []);

  // 暴露方法给父组件
  React.useImperativeHandle(ref, () => ({
    setValue: (newValue: string) => {
      updateValue(newValue);
      // 触发自动调整高度
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
        }
      });
    },
    focus: () => {
      textareaRef.current?.focus();
    },
  }));

  const activeSkillIds = useSelector((state: RootState) => state.skill.activeSkillIds);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const [hasSkillCatalogLoaded, setHasSkillCatalogLoaded] = useState(() => skills.length > 0);

  const syncLoadedSkills = useCallback((loadedSkills: Skill[]) => {
    skillsLoadAttemptedRef.current = true;
    if (!hasSkillCatalogLoaded) {
      setHasSkillCatalogLoaded(true);
    }
    if (!areSkillsEquivalent(skills, loadedSkills)) {
      dispatch(setSkills(loadedSkills));
    }
    return loadedSkills;
  }, [dispatch, hasSkillCatalogLoaded, skills]);

  const isLarge = size === 'large';
  const minHeight = isLarge ? 60 : 24;
  const maxHeight = isLarge ? 160 : 120;

  const ensureSkillsLoaded = useCallback(async (): Promise<Skill[]> => {
    if (skillsLoadAttemptedRef.current) {
      return skills;
    }

    if (skillsLoadPromiseRef.current) {
      return skillsLoadPromiseRef.current;
    }

    // {标记} P1-LAZY-SKILL-CATALOG: 聊天输入区只有在用户打开/使用 skills 时才拉技能目录。
    skillsLoadPromiseRef.current = skillService.loadSkills()
      .then(syncLoadedSkills)
      .finally(() => {
        skillsLoadPromiseRef.current = null;
      });

    return skillsLoadPromiseRef.current;
  }, [skills, syncLoadedSkills]);

  useEffect(() => {
    if (!hasSkillCatalogLoaded && skills.length > 0) {
      skillsLoadAttemptedRef.current = true;
      setHasSkillCatalogLoaded(true);
    }
  }, [hasSkillCatalogLoaded, skills.length]);

  useEffect(() => {
    if (!hasSkillCatalogLoaded) {
      return () => {};
    }

    // {标记} P1-LAZY-SKILL-CATALOG: 目录未启用前不常驻监听，避免聊天首屏白吃 skills 变更事件。
    const unsubscribe = skillService.onSkillsChanged(async () => {
      const loadedSkills = await skillService.loadSkills();
      syncLoadedSkills(loadedSkills);
    });
    return () => {
      unsubscribe();
    };
  }, [hasSkillCatalogLoaded, syncLoadedSkills]);

  useEffect(() => {
    if (activeSkillIds.length === 0 || hasSkillCatalogLoaded) {
      return;
    }
    void ensureSkillsLoaded();
  }, [activeSkillIds.length, ensureSkillsLoaded, hasSkillCatalogLoaded]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
    }
  }, [value, minHeight, maxHeight]);

  useEffect(() => {
    const handleFocusInput = (event: Event) => {
      const detail = (event as CustomEvent<{ clear?: boolean }>).detail;
      const shouldClear = detail?.clear ?? true;
      if (shouldClear) {
        updateValue('');
        setAttachments([]);
      }
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    };
    window.addEventListener('cowork:focus-input', handleFocusInput);
    return () => {
      window.removeEventListener('cowork:focus-input', handleFocusInput);
    };
  }, [updateValue]);

  useEffect(() => {
    if (workingDirectory?.trim()) {
      setShowFolderRequiredWarning(false);
    }
  }, [workingDirectory]);

  useEffect(() => {
    if (value === draftPromptRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      dispatch(setDraftPrompt(value));
    }, 300);

    return () => clearTimeout(timer);
  }, [value, dispatch]);

  const handleSubmit = useCallback(async () => {
    if (showFolderSelector && !workingDirectory?.trim()) {
      setShowFolderRequiredWarning(true);
      return;
    }

    const trimmedValue = value.trim();
    if ((!trimmedValue && attachments.length === 0) || isStreaming || disabled) return;
    setShowFolderRequiredWarning(false);

    // Get active skills prompts and combine them
    const skillCatalog = activeSkillIds.length > 0 && activeSkillIds.some((id) => !skills.find((skill) => skill.id === id))
      ? await ensureSkillsLoaded()
      : skills;

    const activeSkills = activeSkillIds
      .map(id => skillCatalog.find(s => s.id === id))
      .filter((s): s is Skill => s !== undefined);
    const skillPrompt = activeSkills.length > 0
      ? activeSkills.map(buildInlinedSkillPrompt).join('\n\n')
      : undefined;

    // Extract image attachments (with base64 data) for vision-capable models
    const imageAtts: CoworkImageAttachment[] = [];
    for (const attachment of attachments) {
      if (attachment.isImage && attachment.dataUrl) {
        const extracted = extractBase64FromDataUrl(attachment.dataUrl);
        if (extracted) {
          imageAtts.push({
            name: attachment.name,
            mimeType: extracted.mimeType,
            base64Data: extracted.base64Data,
          });
        }
      }
    }

    // Build prompt with ALL attachments that have real file paths (both regular files and images).
    // Image attachments also need their file paths in the prompt so the model knows
    // where the original files are located (e.g., for skills like seedream that need --image <path>).
    // Note: inline/clipboard images have pseudo-paths starting with 'inline:' and are excluded.
    const attachmentLines = buildAttachmentPromptLines(attachments).join('\n');
    const finalPrompt = trimmedValue
      ? (attachmentLines ? `${trimmedValue}\n\n${attachmentLines}` : trimmedValue)
      : attachmentLines;

    if (imageAtts.length > 0) {
      console.log('[CoworkPromptInput] handleSubmit: passing imageAtts to onSubmit', {
        count: imageAtts.length,
        names: imageAtts.map(a => a.name),
        base64Lengths: imageAtts.map(a => a.base64Data.length),
      });
    }
    onSubmit(
      finalPrompt,
      skillPrompt,
      imageAtts.length > 0 ? imageAtts : undefined,
      zenModeEnabled ? { zenMode: true } : undefined,
    );
    updateValue('');
    dispatch(setDraftPrompt(''));
    setAttachments([]);
  }, [value, isStreaming, disabled, onSubmit, activeSkillIds, skills, attachments, showFolderSelector, workingDirectory, dispatch, updateValue, ensureSkillsLoaded]);

  const handleSelectSkill = useCallback((skill: Skill) => {
    dispatch(toggleActiveSkill(skill.id));
  }, [dispatch]);

  const handleManageSkills = useCallback(() => {
    if (onManageSkills) {
      onManageSkills();
    }
  }, [onManageSkills]);

  const handleOpenBrowserEyes = useCallback(async () => {
    const currentPage = await localStore.getItem<BrowserEyesCurrentPageState>(
      BROWSER_EYES_CURRENT_PAGE_STORE_KEY
    );
    const currentUrl = typeof currentPage?.url === 'string' ? currentPage.url.trim() : '';
    const promptUrl = extractFirstUrl(value);
    const targetUrl = currentUrl || promptUrl || '';

    if (!targetUrl) {
      showGlobalToast('小眼睛暂时没有可看的页面。先打开一个网页，或者在输入框里放一个链接。');
      return;
    }

    const opened = requestEmbeddedBrowserOpen({
      title: currentPage?.title?.trim() || 'BLINGBLING 小眼睛',
      url: targetUrl,
    });

    if (!opened) {
      showGlobalToast('小眼睛这次没能打开页面。');
    }
  }, [value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to submit, Shift+Enter for new line
    const isComposing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
    if (event.key === 'Enter' && !event.shiftKey && !isComposing && !isStreaming && !disabled) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleStopClick = () => {
    if (onStop) {
      onStop();
    }
  };

  const containerClass = isLarge
    ? 'relative rounded-[24px] border border-white/35 dark:border-white/[0.12] bg-white/78 dark:bg-white/[0.08] backdrop-blur-md shadow-[0_2px_10px_rgba(90,82,72,0.08),0_8px_28px_rgba(90,82,72,0.08)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.28)] focus-within:border-violet-300/55 dark:focus-within:border-violet-400/30 focus-within:shadow-[0_0_0_3px_rgba(167,139,250,0.10),0_8px_24px_rgba(167,139,250,0.08)] dark:focus-within:shadow-[0_0_0_3px_rgba(167,139,250,0.15),0_4px_16px_rgba(0,0,0,0.4)] transition-all duration-200'
    : 'relative flex items-end gap-2 p-3.5 rounded-xl border border-white/30 dark:border-white/[0.12] bg-white/75 dark:bg-white/[0.08] backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)] focus-within:border-violet-300/60 dark:focus-within:border-violet-400/30 focus-within:shadow-[0_0_0_3px_rgba(167,139,250,0.12),0_4px_16px_rgba(167,139,250,0.1)] dark:focus-within:shadow-[0_0_0_3px_rgba(167,139,250,0.15),0_4px_16px_rgba(0,0,0,0.4)] transition-all duration-200';

  const textareaClass = isLarge
    ? `w-full resize-none bg-transparent px-5 pt-3 pb-2.5 dark:text-white/90 text-[#5A5248] placeholder:dark:text-white/40 placeholder:text-[#9A9085]/55 focus:outline-none text-[12px] leading-5 tracking-[0.01em] overflow-y-auto transition-[height] duration-150`
    : 'flex-1 resize-none bg-transparent dark:text-white/90 text-[#5A5248] placeholder:dark:text-white/40 placeholder:text-[#9A9085]/50 focus:outline-none text-sm leading-relaxed overflow-y-auto transition-[height] duration-150';

  const truncatePath = (path: string, maxLength = 30): string => {
    if (!path) return '未选择文件夹';
    return getCompactFolderName(path, maxLength) || '未选择文件夹';
  };

  const handleFolderSelect = (path: string) => {
    if (onWorkingDirectoryChange) {
      onWorkingDirectoryChange(path);
    }
  };

  const selectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);
  const effectiveModel = React.useMemo(() => {
    if (sessionRoleKey) {
      return availableModels.find((model) => (
        model.providerKey === sessionRoleKey
        && (!sessionModelId || model.id === sessionModelId)
      )) ?? availableModels.find((model) => model.providerKey === sessionRoleKey) ?? selectedModel;
    }
    return selectedModel;
  }, [availableModels, selectedModel, sessionModelId, sessionRoleKey]);
  const modelSupportsImage = !!effectiveModel?.supportsImage;
  const attachmentRoleKey = React.useMemo(() => {
    const candidates = [sessionRoleKey, effectiveModel?.providerKey];
    const resolved = candidates
      .map((value) => String(value || '').trim())
      .find((value) => AGENT_ROLE_ORDER.includes(value as typeof AGENT_ROLE_ORDER[number]));
    return resolved || undefined;
  }, [effectiveModel?.providerKey, sessionRoleKey]);

  const addAttachment = useCallback((filePath: string, imageInfo?: { isImage: boolean; dataUrl?: string }) => {
    if (!filePath) return;
    setAttachments((prev) => {
      if (prev.some((attachment) => attachment.path === filePath)) {
        return prev;
      }
      const fileName = getFileNameFromPath(filePath);
      return [...prev, {
        path: filePath,
        name: fileName,
        isImage: imageInfo?.isImage,
        dataUrl: imageInfo?.dataUrl,
        chunkDescriptor: parseGeneratedTextChunkName(fileName),
      }];
    });
  }, []);

  const addImageAttachmentFromDataUrl = useCallback((name: string, dataUrl: string) => {
    // Use the dataUrl as the unique key (no file path for inline images)
    const pseudoPath = `inline:${name}:${Date.now()}`;
    setAttachments((prev) => {
      return [...prev, {
        path: pseudoPath,
        name,
        isImage: true,
        dataUrl,
      }];
    });
  }, []);

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read file'));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read file'));
          return;
        }
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  const getNativeFilePath = useCallback((file: File): string | null => {
    const maybePath = (file as File & { path?: string }).path;
    if (typeof maybePath === 'string' && maybePath.trim()) {
      return maybePath;
    }
    return null;
  }, []);

  const saveInlineFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      const dataBase64 = await fileToBase64(file);
      if (!dataBase64) {
        return null;
      }
      // ##混淆点注意：
      // 浏览器侧上传默认拿不到稳定本地绝对路径，所以这里必须把 agentRoleKey 一起带给后端，
      // 让服务端按“角色附件家目录”落盘；否则又会退回旧 cwd/.cowork-temp 口径。
      const result = await window.electron.dialog.saveInlineFile({
        dataBase64,
        fileName: file.name,
          mimeType: file.type,
          cwd: workingDirectory,
          agentRoleKey: attachmentRoleKey,
        });
      if (result.success && result.path) {
        return result.path;
      }
      return null;
    } catch (error) {
      console.error('Failed to save inline file:', error);
      return null;
    }
  }, [attachmentRoleKey, fileToBase64, workingDirectory]);

  const parseInlineFile = useCallback(async (filePath: string): Promise<{
    success: boolean;
    fileName?: string;
    fileType?: string;
    text?: string;
    truncated?: boolean;
    error?: string;
  }> => {
    try {
      return await window.electron.dialog.parseInlineFile({
        path: filePath,
        maxCharacters: PARSED_DOCUMENT_MAX_CHARACTERS,
      });
    } catch (error) {
      console.error('Failed to parse inline file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse inline file',
      };
    }
  }, []);

  const stageExtractedDocumentChunks = useCallback(async (
    sourceName: string,
    fileType: string,
    extractedText: string,
  ): Promise<number> => {
    const chunkFiles = buildExtractedTextChunkFiles(sourceName, fileType, extractedText);
    let successCount = 0;
    for (const chunkFile of chunkFiles) {
      const stagedPath = await saveInlineFile(chunkFile);
      if (stagedPath) {
        addAttachment(stagedPath);
        successCount += 1;
      }
    }
    return successCount;
  }, [addAttachment, saveInlineFile]);

  const handleIncomingFiles = useCallback(async (fileList: FileList | File[]) => {
    if (disabled || isStreaming) return;
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    for (const file of files) {
      const nativePath = getNativeFilePath(file);

      // Check if this is an image file and model supports images
      const fileIsImage = nativePath
        ? isImagePath(nativePath)
        : isImageMimeType(file.type);
      const fileNeedsStructuredParse = !fileIsImage && isServerParsedDocumentFile(file);

      if (fileNeedsStructuredParse) {
        let sourcePath = nativePath;
        if (!sourcePath) {
          sourcePath = await saveInlineFile(file);
        }

        if (sourcePath) {
          const parsedResult = await parseInlineFile(sourcePath);
          if (parsedResult.success && parsedResult.text?.trim()) {
            const sourceName = parsedResult.fileName || file.name || getFileNameFromPath(sourcePath);
            const successCount = await stageExtractedDocumentChunks(
              sourceName,
              parsedResult.fileType || getFileExtension(sourceName).replace(/^\./, '') || 'text',
              parsedResult.text,
            );
            if (successCount > 0) {
              showGlobalToast(
                `${sourceName} 已解析并拆成 ${successCount} 份文本${parsedResult.truncated ? '（解析内容达到上限）' : ''}`,
              );
              continue;
            }
          } else if (parsedResult.error) {
            console.warn(`Failed to parse ${file.name}:`, parsedResult.error);
          }

          addAttachment(sourcePath);
          continue;
        }
      }

      if (!fileIsImage && shouldSplitTextFile(file)) {
        try {
          const splitFiles = await splitLargeTextFile(file);
          if (splitFiles.length > 1) {
            let successCount = 0;
            for (const splitFile of splitFiles) {
              const stagedPath = await saveInlineFile(splitFile);
              if (stagedPath) {
                addAttachment(stagedPath);
                successCount += 1;
              }
            }
            if (successCount > 0) {
              showGlobalToast(`${file.name} 过大，已在浏览器侧切成 ${successCount} 份`);
              continue;
            }
          }
        } catch (error) {
          console.error('Failed to split large text file:', error);
        }
      }

      if (fileIsImage && modelSupportsImage) {
        // For images on vision-capable models, read as data URL
        if (nativePath) {
          try {
            const result = await window.electron.dialog.readFileAsDataUrl(nativePath);
            if (result.success && result.dataUrl) {
              addAttachment(nativePath, { isImage: true, dataUrl: result.dataUrl });
              continue;
            }
          } catch (error) {
            console.error('Failed to read image as data URL:', error);
          }
          // Fallback: add as regular file attachment
          addAttachment(nativePath);
        } else {
          // No native path (clipboard/drag from browser) - read via FileReader
          try {
            const dataUrl = await fileToDataUrl(file);
            const stagedPath = await saveInlineFile(file);
            if (stagedPath) {
              addAttachment(stagedPath, { isImage: true, dataUrl });
            } else {
              // {标记} P1-INLINE-IMAGE-STAGE: 能落真实文件就优先落盘，失败才退回纯 dataUrl，兼容 skills 读路径。
              addImageAttachmentFromDataUrl(file.name, dataUrl);
            }
          } catch (error) {
            console.error('Failed to read image from clipboard:', error);
            const stagedPath = await saveInlineFile(file);
            if (stagedPath) {
              addAttachment(stagedPath);
            }
          }
        }
        continue;
      }

      // Non-image file or model doesn't support images: use original flow
      if (nativePath) {
        addAttachment(nativePath);
        continue;
      }

      const stagedPath = await saveInlineFile(file);
      if (stagedPath) {
        addAttachment(stagedPath);
      }
    }
  }, [
    addAttachment,
    addImageAttachmentFromDataUrl,
    disabled,
    fileToDataUrl,
    getNativeFilePath,
    isStreaming,
    modelSupportsImage,
    parseInlineFile,
    saveInlineFile,
    stageExtractedDocumentChunks,
  ]);

  const handleAddFile = useCallback(() => {
    if (disabled || isStreaming) return;
    fileInputRef.current?.click();
  }, [disabled, isStreaming]);

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      await handleIncomingFiles(selectedFiles);
    }
    event.target.value = '';
  }, [handleIncomingFiles]);

  const handleRemoveAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.path !== path));
  }, []);

  const hasFileTransfer = (dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) return false;
    if (dataTransfer.files.length > 0) return true;
    return Array.from(dataTransfer.types).includes('Files');
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    if (!disabled && !isStreaming) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = disabled || isStreaming ? 'none' : 'copy';
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (disabled || isStreaming) return;
    void handleIncomingFiles(event.dataTransfer.files);
  };

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || isStreaming) return;
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      void handleIncomingFiles(files);
      return;
    }

    const pastedText = event.clipboardData?.getData('text') ?? '';
    if (!pastedText) return;

    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, selectionStart)}${pastedText}${value.slice(selectionEnd)}`;
    if (nextValue.length <= MAX_PROMPT_CHARS) return;

    event.preventDefault();
    const preservedLength = value.length - (selectionEnd - selectionStart);
    const availableChars = Math.max(MAX_PROMPT_CHARS - preservedLength, 0);
    const safeInsertedText = pastedText.slice(0, availableChars);
    const normalizedValue = `${value.slice(0, selectionStart)}${safeInsertedText}${value.slice(selectionEnd)}`;
    updateValue(normalizedValue);

    requestAnimationFrame(() => {
      const cursor = selectionStart + safeInsertedText.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }, [disabled, handleIncomingFiles, isStreaming, updateValue, value]);

  const canSubmit = !disabled && (!!value.trim() || attachments.length > 0);
  const showPromptLimitHint = inputWasTruncated || value.length >= MAX_PROMPT_CHARS * 0.8;
  const enhancedContainerClass = isDraggingFiles
    ? `${containerClass} ring-2 ring-claude-accent/50 border-claude-accent/60`
    : containerClass;
  const shouldShowActionBar = isLarge && Boolean(sessionRoleKey || onManualCompress || onInterruptProcess);
  const clearBroadcastBoardStatus = useTimedConversationActionStatus({
    accent: 'rose',
    pending: isClearingBroadcastBoard,
    initialStage: {
      label: '已发出清空请求',
      description: '正在请求清理当前角色的 24h 接力摘要，马上回来。',
    },
    waitingStage: {
      label: '正在等待清空返回',
      description: '广播板正在整理成空白状态，请稍等，不是没有反应。',
    },
    slowStage: {
      label: '广播板还在处理',
      description: '这次返回有点慢，但系统还在继续，请再等一下。',
    },
  });
  const activeActionStatus = isManualCompressing
    ? manualCompressStatus
    : isClearingBroadcastBoard
      ? clearBroadcastBoardStatus.status
      : isInterruptingProcess
        ? interruptProcessStatus
        : manualCompressStatus ?? clearBroadcastBoardStatus.status ?? interruptProcessStatus ?? null;

  const handleClearBroadcastBoard = useCallback(async () => {
    const roleKey = String(sessionRoleKey || '').trim();
    if (!roleKey || isManualCompressing || isClearingBroadcastBoard || isInterruptingProcess) return;
    const confirmed = window.confirm('清空当前角色的广播板？这会移除 24h 接力摘要。');
    if (!confirmed) return;
    setIsClearingBroadcastBoard(true);
    try {
      showGlobalToast('正在清空广播板，请稍等…');
      const success = await coworkService.clearBroadcastBoard({ agentRoleKey: roleKey });
      if (success) {
        clearBroadcastBoardStatus.showSuccess({
          label: '广播板已清空',
          description: '当前角色的接力摘要已经清空，后续会从新的痕迹继续写起。',
        });
      } else {
        clearBroadcastBoardStatus.showError({
          label: '广播板清空失败',
          description: '这次没有成功清空，原来的接力摘要还在，可以稍后再试。',
        });
      }
      showGlobalToast(success ? '广播板已清空' : '清空广播板失败');
    } finally {
      setIsClearingBroadcastBoard(false);
    }
  }, [clearBroadcastBoardStatus, isClearingBroadcastBoard, isInterruptingProcess, isManualCompressing, sessionRoleKey]);

  const handleToggleZenMode = useCallback(() => {
    setZenModeEnabled((current) => {
      const next = !current;
      showGlobalToast(next ? '已开启禅模式' : '已关闭禅模式');
      return next;
    });
  }, []);

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        title="Upload files"
        aria-label="Upload files"
        onChange={handleFileInputChange}
      />
      {shouldShowActionBar && (
        <ConversationActionBar
          zenModeEnabled={zenModeEnabled}
          onToggleZenMode={handleToggleZenMode}
          onManualCompress={onManualCompress}
          isManualCompressing={isManualCompressing}
          isClearingBroadcastBoard={isClearingBroadcastBoard}
          onClearBroadcastBoard={sessionRoleKey ? handleClearBroadcastBoard : undefined}
          onInterruptProcess={onInterruptProcess}
          isInterruptingProcess={isInterruptingProcess}
          canInterruptProcess={canInterruptProcess}
          activeStatus={activeActionStatus}
        />
      )}
      {attachments.length > 0 && (
        <div className="mb-2">
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => {
              const display = describeAttachmentDisplay(attachment);
              return (
                <div
                  key={attachment.path}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-1.5 text-sm dark:text-white/90 text-[#5A5248] backdrop-blur-sm max-w-full shadow-sm transition-colors hover:bg-white/70 dark:hover:bg-white/8"
                  title={attachment.name}
                >
                  {attachment.isImage ? (
                    <PhotoIcon className="h-4 w-4 flex-shrink-0 text-[#9A9085]/80" />
                  ) : (
                    <PaperClipIcon className="h-4 w-4 flex-shrink-0 text-[#9A9085]/80" />
                  )}
                  <span className="flex min-w-0 max-w-[240px] flex-col leading-tight">
                    <span className="truncate max-w-[240px] text-[12px]">{display.primary}</span>
                    {display.secondary && (
                      <span className="truncate max-w-[240px] text-[10px] text-[#9A9085]/85 dark:text-white/55">
                        {display.secondary}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(attachment.path)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-[#9A9085]/10 transition-colors"
                    aria-label={'移除'}
                    title={'移除'}
                  >
                    <XMarkIcon className="h-3.5 w-3.5 text-[#9A9085]/70" />
                  </button>
                </div>
            );
            })}
          </div>
          <div className="mb-2 px-1 text-[11px] leading-5 text-[#8B7F73] dark:text-white/55">
            {UPLOAD_STORAGE_BOUNDARY_NOTICE}
          </div>
        </div>
      )}
      <div
        className={enhancedContainerClass}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFiles && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-claude-accent/10 text-xs font-medium text-claude-accent">
            {'拖拽文件到此处，或直接粘贴文件'}
          </div>
        )}
        {isLarge ? (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => updateValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={disabled}
              rows={2}
              className={`${textareaClass} cowork-prompt-input__textarea--large`}
            />
            <PromptToolRow
              showFolderSelector={showFolderSelector}
              workingDirectory={workingDirectory}
              truncatePath={truncatePath}
              folderButtonRef={folderButtonRef as React.RefObject<HTMLButtonElement>}
              showFolderMenu={showFolderMenu}
              setShowFolderMenu={setShowFolderMenu}
              handleFolderSelect={handleFolderSelect}
              showModelSelector={showModelSelector}
              sessionRoleKey={sessionRoleKey}
              sessionModelId={sessionModelId}
              lockModelSelector={lockModelSelector}
              disabled={disabled}
              isStreaming={isStreaming}
              handleAddFile={handleAddFile}
              handleOpenBrowserEyes={handleOpenBrowserEyes}
              handleSelectSkill={handleSelectSkill}
              handleManageSkills={handleManageSkills}
              ensureSkillsLoaded={ensureSkillsLoaded}
              canSubmit={canSubmit}
              handleStopClick={handleStopClick}
              handleSubmit={handleSubmit}
            />
          </>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => updateValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={textareaClass}
            />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleAddFile}
                className="flex-shrink-0 p-1.5 rounded-lg dark:text-white/50 text-[#9A9085] dark:hover:bg-white/10 hover:bg-[#9A9085]/10 dark:hover:text-white/70 hover:text-[#7A7065] transition-colors"
                title={'添加文件'}
                aria-label={'添加文件'}
                disabled={disabled || isStreaming}
              >
                <PaperClipIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { void handleOpenBrowserEyes(); }}
                className="flex-shrink-0 p-1.5 rounded-lg dark:text-white/50 text-[#9A9085] dark:hover:bg-white/10 hover:bg-[#9A9085]/10 dark:hover:text-white/70 hover:text-[#7A7065] transition-colors"
                title={'打开小眼睛小电视'}
                aria-label={'打开小眼睛小电视'}
                disabled={disabled}
              >
                <ComputerDesktopIcon className="h-4 w-4" />
              </button>
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStopClick}
                className="flex-shrink-0 p-2 rounded-lg bg-red-500/90 hover:bg-red-600 text-white transition-colors shadow-sm hover:shadow"
                aria-label="停止"
              >
                <StopIcon className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { void handleSubmit(); }}
                disabled={!canSubmit}
                className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 hover:from-violet-500 hover:to-purple-600 text-white transition-all duration-200 shadow-[0_2px_6px_rgba(139,92,246,0.3)] hover:shadow-[0_3px_10px_rgba(139,92,246,0.4)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100"
                aria-label="发送"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
      {(showFolderRequiredWarning || showPromptLimitHint || Boolean(sessionRoleKey)) && (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            {showFolderRequiredWarning && (
              <div className="text-red-500 dark:text-red-400">
                {'请选择任务目录后再提交'}
              </div>
            )}
            {sessionRoleKey && (
              <div className="text-[#9A9085] dark:text-white/45">
                {'昨天的记忆回忆，可以叫小家伙去找找记忆数据库。'}
              </div>
            )}
          </div>
          {showPromptLimitHint && (
            <div className={inputWasTruncated ? 'text-amber-600 dark:text-amber-300' : 'text-[#9A9085] dark:text-white/45'}>
              {inputWasTruncated
                ? `输入过长，已截断到 ${MAX_PROMPT_CHARS} 字`
                : `${value.length}/${MAX_PROMPT_CHARS}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
  }
);

CoworkPromptInput.displayName = 'CoworkPromptInput';

export default CoworkPromptInput;
