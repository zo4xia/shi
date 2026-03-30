import {
  parseGeneratedTextChunkName,
  type GeneratedTextChunkDescriptor,
} from '../../shared/attachmentChunkMetadata';

const DEFAULT_TEXT_SPLIT_TRIGGER_BYTES = 900 * 1024;
const DEFAULT_TEXT_CHUNK_SIZE = 120_000;
const DEFAULT_TEXT_CHUNK_OVERLAP = 2_000;
const MAX_GENERATED_CHUNKS = 24;

const SPLITTABLE_TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.mdx',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.log',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.sql',
  '.sh',
  '.ps1',
  '.bat',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.css',
  '.scss',
  '.less',
]);

function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function splitBaseName(fileName: string): { name: string; extension: string } {
  const index = fileName.lastIndexOf('.');
  if (index <= 0) {
    return { name: fileName, extension: '' };
  }
  return {
    name: fileName.slice(0, index),
    extension: fileName.slice(index),
  };
}

export type { GeneratedTextChunkDescriptor } from '../../shared/attachmentChunkMetadata';
export { parseGeneratedTextChunkName } from '../../shared/attachmentChunkMetadata';

function isTextMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith('text/')
    || normalized.includes('json')
    || normalized.includes('xml')
    || normalized.includes('yaml')
    || normalized.includes('javascript');
}

export function isSplittableTextFile(file: File): boolean {
  return isTextMimeType(file.type) || SPLITTABLE_TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

export function shouldSplitTextFile(file: File, triggerBytes = DEFAULT_TEXT_SPLIT_TRIGGER_BYTES): boolean {
  return file.size > triggerBytes && isSplittableTextFile(file);
}

export function chunkTextForAttachment(
  text: string,
  chunkSize: number = DEFAULT_TEXT_CHUNK_SIZE,
  chunkOverlap: number = DEFAULT_TEXT_CHUNK_OVERLAP
): string[] {
  const normalizedText = text.replace(/\r\n/g, '\n');
  if (normalizedText.length <= chunkSize) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  const paragraphs = normalizedText.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > chunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        const overlapLength = Math.min(chunkOverlap, currentChunk.length);
        currentChunk = overlapLength > 0 ? currentChunk.slice(-overlapLength) : '';
      }

      if (paragraph.length > chunkSize) {
        const sentences = paragraph.split(/(?<=[。！？!?\.])\s+|\n/u);
        for (const sentence of sentences) {
          if (!sentence) continue;
          if (currentChunk.length + sentence.length + 1 > chunkSize) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
            }
            const overlapLength = Math.min(chunkOverlap, currentChunk.length);
            currentChunk = overlapLength > 0 ? currentChunk.slice(-overlapLength) : '';
          }
          currentChunk += `${sentence}${sentence.endsWith('\n') ? '' : ' '}`;
        }
      } else {
        currentChunk += `${paragraph}\n\n`;
      }
    } else {
      currentChunk += `${paragraph}\n\n`;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.trim().length > 0).slice(0, MAX_GENERATED_CHUNKS);
}

export async function splitLargeTextFile(file: File): Promise<File[]> {
  if (!shouldSplitTextFile(file)) {
    return [file];
  }

  const text = await file.text();
  const chunks = chunkTextForAttachment(text);
  if (chunks.length <= 1) {
    return [file];
  }

  const { name, extension } = splitBaseName(file.name);
  const total = chunks.length;
  return chunks.map((chunk, index) => {
    const partLabel = String(index + 1).padStart(2, '0');
    const totalLabel = String(total).padStart(2, '0');
    return new File(
      [chunk],
      `${name}.part-${partLabel}-of-${totalLabel}${extension}`,
      {
        type: file.type || 'text/plain',
        lastModified: file.lastModified,
      }
    );
  });
}
