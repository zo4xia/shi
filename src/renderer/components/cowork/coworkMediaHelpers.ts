import type { CoworkRenderableMedia } from '../../types/cowork';

export type CoworkRenderableMediaKind = 'image' | 'video' | 'audio' | 'file';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogg'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

export function getRenderableMediaSrc(media: CoworkRenderableMedia): string | null {
  if (media.base64Data && media.mimeType) {
    return `data:${media.mimeType};base64,${media.base64Data}`;
  }
  if (typeof media.url === 'string' && media.url.trim()) {
    return media.url.trim();
  }
  return null;
}

export function getRenderableMediaKind(media: CoworkRenderableMedia): CoworkRenderableMediaKind {
  const mimeType = String(media.mimeType || '').toLowerCase();
  const source = String(media.url || media.name || '').toLowerCase();

  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.some((ext) => source.includes(ext))) {
    return 'image';
  }
  if (mimeType.startsWith('video/') || VIDEO_EXTENSIONS.some((ext) => source.includes(ext))) {
    return 'video';
  }
  if (mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.some((ext) => source.includes(ext))) {
    return 'audio';
  }
  return 'file';
}

export function resolveRenderableMediaMimeType(media: CoworkRenderableMedia, src?: string | null): string {
  const explicitMimeType = String(media.mimeType || '').trim();
  if (explicitMimeType) {
    return explicitMimeType;
  }

  const normalized = String(src || media.url || media.name || '').toLowerCase();
  if (normalized.includes('.webp')) return 'image/webp';
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return 'image/jpeg';
  if (normalized.includes('.gif')) return 'image/gif';
  if (normalized.includes('.svg')) return 'image/svg+xml';
  if (normalized.includes('.mp4')) return 'video/mp4';
  if (normalized.includes('.webm')) return 'video/webm';
  if (normalized.includes('.mov')) return 'video/quicktime';
  if (normalized.includes('.mp3')) return 'audio/mpeg';
  if (normalized.includes('.wav')) return 'audio/wav';
  if (normalized.includes('.m4a')) return 'audio/mp4';
  if (normalized.includes('.aac')) return 'audio/aac';
  return 'application/octet-stream';
}

export function ensureRenderableMediaExtension(media: CoworkRenderableMedia, mimeType: string): string {
  const trimmed = String(media.name || '').trim() || 'uclaw-media';
  if (/\.[a-z0-9]{2,5}$/i.test(trimmed)) {
    return trimmed;
  }

  const extension = mimeType === 'image/jpeg'
    ? '.jpg'
    : mimeType === 'image/webp'
      ? '.webp'
      : mimeType === 'image/gif'
        ? '.gif'
        : mimeType === 'image/svg+xml'
          ? '.svg'
          : mimeType === 'video/mp4'
            ? '.mp4'
            : mimeType === 'video/webm'
              ? '.webm'
              : mimeType === 'video/quicktime'
                ? '.mov'
                : mimeType === 'audio/mpeg'
                  ? '.mp3'
                  : mimeType === 'audio/wav'
                    ? '.wav'
                    : mimeType === 'audio/mp4'
                      ? '.m4a'
                      : mimeType === 'audio/aac'
                        ? '.aac'
                        : '.bin';

  return `${trimmed}${extension}`;
}

export async function readRenderableMediaPayload(
  media: CoworkRenderableMedia,
  src: string,
): Promise<{ mimeType: string; blob: Blob; base64Data: string }> {
  const mimeType = resolveRenderableMediaMimeType(media, src);

  if (src.startsWith('data:')) {
    const [, base64Data = ''] = src.split(',', 2);
    const byteCharacters = atob(base64Data);
    const bytes = new Uint8Array(byteCharacters.length);
    for (let index = 0; index < byteCharacters.length; index += 1) {
      bytes[index] = byteCharacters.charCodeAt(index);
    }
    return {
      mimeType,
      blob: new Blob([bytes], { type: mimeType }),
      base64Data,
    };
  }

  const response = await fetch(src);
  const blob = await response.blob();
  const resolvedMimeType = blob.type || mimeType;
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return {
    mimeType: resolvedMimeType,
    blob,
    base64Data: btoa(binary),
  };
}
