/**
 * {标记} 功能: 对话文件缓存配置
 * {标记} 来源: 二开需求总表#1.2
 * {标记} 用途: 明确指定缓存目录，与记忆管理系统配套
 * {标记} 集成: Settings.tsx / memoryManagementPreset.ts
 * {标记} 状态: 源代码完整✅
 */

export interface ConversationFileCacheSettingsValue {
  directory: string;
  autoBackupDaily: boolean;
}

export interface ConversationFileCacheConfigLike {
  conversationFileCache?: {
    directory?: string;
    autoBackupDaily?: boolean;
  };
}

const ROLE_ATTACHMENT_KEYS = new Set(['organizer', 'writer', 'designer', 'analyst']);

const DEFAULT_CONVERSATION_FILE_CACHE: ConversationFileCacheSettingsValue = {
  directory: '',
  autoBackupDaily: true,
};

function splitConversationDirectorySegments(directory: string): string[] {
  return directory
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

export function normalizeConversationFileCacheDirectory(directory: string | null | undefined): string {
  const raw = typeof directory === 'string' ? directory.trim() : '';
  if (!raw) {
    return '';
  }

  const separator = raw.includes('\\') ? '\\' : '/';
  let segments = splitConversationDirectorySegments(raw);
  const lower = (value: string | undefined): string => String(value || '').toLowerCase();

  let changed = true;
  while (changed && segments.length > 0) {
    changed = false;

    if (
      segments.length >= 3
      && ROLE_ATTACHMENT_KEYS.has(lower(segments[segments.length - 3]))
      && lower(segments[segments.length - 2]) === 'attachments'
      && (lower(segments[segments.length - 1]) === 'manual' || lower(segments[segments.length - 1]) === 'exports')
    ) {
      segments = segments.slice(0, -3);
      changed = true;
      continue;
    }

    if (
      segments.length >= 2
      && ROLE_ATTACHMENT_KEYS.has(lower(segments[segments.length - 2]))
      && (lower(segments[segments.length - 1]) === 'manual' || lower(segments[segments.length - 1]) === 'exports')
    ) {
      segments = segments.slice(0, -2);
      changed = true;
      continue;
    }

    if (ROLE_ATTACHMENT_KEYS.has(lower(segments[segments.length - 1]))) {
      segments = segments.slice(0, -1);
      changed = true;
    }
  }

  return segments.join(separator);
}

export function resolveConversationFileCacheConfig(
  config?: ConversationFileCacheConfigLike | null
): ConversationFileCacheSettingsValue {
  return {
    directory: normalizeConversationFileCacheDirectory(
      config?.conversationFileCache?.directory?.trim() ?? DEFAULT_CONVERSATION_FILE_CACHE.directory
    ),
    autoBackupDaily: config?.conversationFileCache?.autoBackupDaily ?? DEFAULT_CONVERSATION_FILE_CACHE.autoBackupDaily,
  };
}

export function buildConversationFileCacheUpdate(
  directory: string,
  autoBackupDaily: boolean
): { conversationFileCache: ConversationFileCacheSettingsValue } {
  return {
    conversationFileCache: {
      directory: normalizeConversationFileCacheDirectory(directory),
      autoBackupDaily,
    },
  };
}
