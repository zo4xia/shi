import fs from 'fs';
import path from 'path';
import { parseGeneratedTextChunkName, type GeneratedTextChunkDescriptor } from '../../src/shared/attachmentChunkMetadata';
import { parseFile } from './fileParser';

export const ATTACHMENT_INPUT_LABEL = '输入文件';
const DEFAULT_ATTACHMENT_READ_CHARACTERS = 9000;
const MAX_ATTACHMENT_READ_CHARACTERS = 24000;

export type AttachmentReference = {
  path: string;
  resolvedPath: string;
  fileName: string;
  descriptor: GeneratedTextChunkDescriptor | null;
};

export type AttachmentGroup = {
  sourceName: string;
  totalParts: number;
  kind: GeneratedTextChunkDescriptor['kind'] | 'single_file';
  references: AttachmentReference[];
};

export type AttachmentRuntimeContext = {
  promptText: string;
  attachments: AttachmentReference[];
  groups: AttachmentGroup[];
  hasChunkedSources: boolean;
  shouldPreferToolReading: boolean;
};

type AttachmentReadArgs = {
  source_name?: string;
  file_path?: string;
  part_number?: number;
  max_characters?: number;
};

type AttachmentReadResult = {
  sourceName: string;
  fileName: string;
  filePath: string;
  fileType: string;
  partNumber: number;
  totalParts: number;
  characterCount: number;
  truncated: boolean;
  text: string;
};

export function extractReferencedFilePaths(content: string): { promptText: string; filePaths: string[] } {
  const lines = String(content || '').split(/\r?\n/);
  const filePaths: string[] = [];
  const promptLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${ATTACHMENT_INPUT_LABEL}:`)) {
      const filePath = trimmed.slice(ATTACHMENT_INPUT_LABEL.length + 1).trim();
      if (filePath) {
        filePaths.push(filePath);
      }
      continue;
    }
    promptLines.push(line);
  }

  return {
    promptText: promptLines.join('\n').trim(),
    filePaths,
  };
}

export function buildAttachmentRuntimeContext(content: string): AttachmentRuntimeContext {
  const { promptText, filePaths } = extractReferencedFilePaths(content);
  const attachments = Array.from(new Set(filePaths))
    .map((filePath) => {
      const resolvedPath = path.resolve(filePath);
      const fileName = path.basename(resolvedPath) || resolvedPath;
      return {
        path: filePath,
        resolvedPath,
        fileName,
        descriptor: parseGeneratedTextChunkName(fileName),
      } satisfies AttachmentReference;
    });

  const groupsByKey = new Map<string, AttachmentGroup>();
  for (const attachment of attachments) {
    const descriptor = attachment.descriptor;
    const sourceName = descriptor?.sourceName || attachment.fileName;
    const key = descriptor
      ? `${descriptor.kind}:${sourceName}:${descriptor.totalParts}`
      : `single:${attachment.resolvedPath}`;
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.references.push(attachment);
      continue;
    }
    groupsByKey.set(key, {
      sourceName,
      totalParts: descriptor?.totalParts || 1,
      kind: descriptor?.kind || 'single_file',
      references: [attachment],
    });
  }

  const groups = Array.from(groupsByKey.values())
    .map((group) => ({
      ...group,
      references: [...group.references].sort((left, right) => {
        const leftPart = left.descriptor?.partNumber || 1;
        const rightPart = right.descriptor?.partNumber || 1;
        return leftPart - rightPart;
      }),
    }));

  const hasChunkedSources = groups.some((group) => group.totalParts > 1);

  return {
    promptText,
    attachments,
    groups,
    hasChunkedSources,
    shouldPreferToolReading: hasChunkedSources || attachments.length > 2,
  };
}

export function buildAttachmentManifestText(
  context: AttachmentRuntimeContext,
  sourceName?: string,
): string {
  const groups = context.groups.filter((group) => !sourceName || group.sourceName === sourceName);
  if (groups.length === 0) {
    return sourceName
      ? `未找到附件源: ${sourceName}`
      : '当前消息没有可读取的附件。';
  }

  return [
    `attachment_sources=${groups.length}`,
    ...groups.map((group) => {
      const kindLabel = group.kind === 'single_file'
        ? 'single'
        : group.kind === 'parsed_extract'
          ? 'parsed_extract'
          : 'text_split';
      const partPreview = group.references
        .map((reference) => String(reference.descriptor?.partNumber || 1).padStart(2, '0'))
        .join(',');
      return [
        `source_name=${group.sourceName}`,
        `kind=${kindLabel}`,
        `total_parts=${group.totalParts}`,
        `available_parts=${partPreview}`,
        `paths=${group.references.map((reference) => reference.resolvedPath).join(' | ')}`,
      ].join('\n');
    }),
  ].join('\n\n');
}

export function decorateAttachmentManifestInput(
  context: AttachmentRuntimeContext,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sourceName = typeof args.source_name === 'string' ? args.source_name.trim() : '';
  return {
    ...args,
    ...(sourceName ? { source_name: sourceName } : {}),
    attachment_source_count: context.groups.length,
  };
}

export function decorateAttachmentReadInput(
  context: AttachmentRuntimeContext,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sourceName = typeof args.source_name === 'string' ? args.source_name.trim() : '';
  const group = sourceName
    ? context.groups.find((item) => item.sourceName === sourceName)
    : null;
  const partNumber = normalizePositiveInteger(args.part_number) ?? 1;

  return {
    ...args,
    ...(group ? {
      source_name: group.sourceName,
      total_parts: group.totalParts,
      part_number: clampPartNumber(partNumber, group.totalParts),
    } : {}),
  };
}

export async function readAttachmentText(
  context: AttachmentRuntimeContext,
  args: AttachmentReadArgs,
): Promise<AttachmentReadResult> {
  const maxCharacters = clampMaxCharacters(args.max_characters);
  const explicitPath = typeof args.file_path === 'string' ? args.file_path.trim() : '';
  const sourceName = typeof args.source_name === 'string' ? args.source_name.trim() : '';

  let targetGroup: AttachmentGroup | null = null;
  let targetReference: AttachmentReference | null = null;

  if (explicitPath) {
    const resolvedPath = path.resolve(explicitPath);
    targetReference = context.attachments.find((item) => item.resolvedPath === resolvedPath) ?? null;
    if (!targetReference) {
      throw new Error(`未找到附件路径: ${resolvedPath}`);
    }
    targetGroup = context.groups.find((group) => group.references.some((item) => item.resolvedPath === resolvedPath)) ?? null;
  } else if (sourceName) {
    targetGroup = context.groups.find((group) => group.sourceName === sourceName) ?? null;
    if (!targetGroup) {
      throw new Error(`未找到附件源: ${sourceName}`);
    }
    const requestedPart = clampPartNumber(normalizePositiveInteger(args.part_number) ?? 1, targetGroup.totalParts);
    targetReference = targetGroup.references.find((item) => (item.descriptor?.partNumber || 1) === requestedPart) ?? null;
    if (!targetReference) {
      throw new Error(`未找到 ${sourceName} 的第 ${requestedPart} 片`);
    }
  } else {
    throw new Error('attachment_read 需要 source_name 或 file_path。');
  }

  const fileBuffer = await fs.promises.readFile(targetReference.resolvedPath);
  const parsed = await parseFile(targetReference.fileName, fileBuffer, {
    maxTextLength: maxCharacters,
  });
  if (!parsed.success || !parsed.text.trim()) {
    throw new Error(parsed.error || '附件读取失败');
  }

  const partNumber = targetReference.descriptor?.partNumber || 1;
  const totalParts = targetGroup?.totalParts || targetReference.descriptor?.totalParts || 1;
  const text = parsed.text.trim();

  return {
    sourceName: targetGroup?.sourceName || targetReference.fileName,
    fileName: targetReference.fileName,
    filePath: targetReference.resolvedPath,
    fileType: parsed.fileType,
    partNumber,
    totalParts,
    characterCount: text.length,
    truncated: Boolean(parsed.truncated),
    text,
  };
}

export function formatAttachmentReadResult(result: AttachmentReadResult): string {
  return [
    'attachment_read=completed',
    `source_name=${result.sourceName}`,
    `part=${String(result.partNumber).padStart(2, '0')}/${String(result.totalParts).padStart(2, '0')}`,
    `file_name=${result.fileName}`,
    `file_type=${result.fileType}`,
    `characters=${result.characterCount}`,
    `truncated=${result.truncated ? 'true' : 'false'}`,
    `path=${result.filePath}`,
    'content:',
    result.text,
  ].join('\n');
}

export function buildAttachmentToolPrompt(context: AttachmentRuntimeContext): string | null {
  if (!context.shouldPreferToolReading || context.groups.length === 0) {
    return null;
  }

  return [
    '## Attachment Reading',
    '- This turn includes chunked or multi-file attachments.',
    '- Use `attachment_manifest` to inspect the available sources and parts when needed.',
    '- Use `attachment_read` to read the exact part(s) you need. You may read multiple parts autonomously in the same turn.',
    '- Be truthful about progress: only claim a part is read after `attachment_read` returned successfully for that part.',
    '- Keep formal replies separate from reading progress. Tool progress is visible to the user as process information.',
    '',
    buildAttachmentManifestText(context),
  ].join('\n');
}

export function buildAttachmentInlineManifestPrompt(context: AttachmentRuntimeContext): string {
  return [
    context.promptText,
    '以下是当前消息附带文件的索引。当前包含分片或多份文件，请优先使用 attachment_manifest / attachment_read 按需阅读，不要假装已经读完全部原文。',
    '<attached_file_manifest>',
    buildAttachmentManifestText(context),
    '</attached_file_manifest>',
  ].filter(Boolean).join('\n\n');
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function clampPartNumber(value: number, totalParts: number): number {
  return Math.min(Math.max(1, value), Math.max(1, totalParts));
}

function clampMaxCharacters(value: unknown): number {
  const parsed = normalizePositiveInteger(value);
  if (!parsed) {
    return DEFAULT_ATTACHMENT_READ_CHARACTERS;
  }
  return Math.min(parsed, MAX_ATTACHMENT_READ_CHARACTERS);
}
