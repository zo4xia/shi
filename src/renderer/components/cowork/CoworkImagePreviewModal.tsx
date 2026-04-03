import React from 'react';
import { showGlobalToast } from '../../services/toast';
import { WebFileOperations } from '../../utils/fileOperations';
import { isWebBuild } from '../../utils/platform';

interface CoworkImagePreviewModalProps {
  src: string;
  alt?: string;
  fileName?: string;
  onClose: () => void;
}

const CoworkImagePreviewModal: React.FC<CoworkImagePreviewModalProps> = ({
  src,
  alt = 'Preview',
  fileName = 'uclaw-image',
  onClose,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const resolveImageMimeType = React.useCallback((): string => {
    if (src.startsWith('data:')) {
      const match = /^data:(.+?);base64,/.exec(src);
      return match?.[1] || 'image/png';
    }
    const normalized = src.toLowerCase();
    if (normalized.includes('.webp')) return 'image/webp';
    if (normalized.includes('.jpg') || normalized.includes('.jpeg')) return 'image/jpeg';
    if (normalized.includes('.gif')) return 'image/gif';
    return 'image/png';
  }, [src]);

  const ensureImageExtension = React.useCallback((name: string, mimeType: string): string => {
    const trimmed = name.trim() || 'uclaw-image';
    if (/\.[a-z0-9]{2,5}$/i.test(trimmed)) {
      return trimmed;
    }
    const extension = mimeType === 'image/jpeg'
      ? '.jpg'
      : mimeType === 'image/webp'
        ? '.webp'
        : mimeType === 'image/gif'
          ? '.gif'
          : '.png';
    return `${trimmed}${extension}`;
  }, []);

  const readImagePayload = React.useCallback(async (): Promise<{ mimeType: string; blob: Blob; base64Data: string }> => {
    const mimeType = resolveImageMimeType();

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
  }, [resolveImageMimeType, src]);

  const handleDownload = React.useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const payload = await readImagePayload();
      const normalizedName = ensureImageExtension(fileName, payload.mimeType);

      if (!isWebBuild() && window.electron?.dialog?.saveInlineFile) {
        const result = await window.electron.dialog.saveInlineFile({
          dataBase64: payload.base64Data,
          fileName: normalizedName,
          mimeType: payload.mimeType,
          purpose: 'export',
        });

        if (result.success) {
          showGlobalToast('图片已保存');
          return;
        }
      }

      WebFileOperations.downloadBlob(payload.blob, normalizedName);
      showGlobalToast('图片已下载');
    } catch (error) {
      console.error('Failed to save preview image:', error);
      showGlobalToast('保存图片失败');
    } finally {
      setIsSaving(false);
    }
  }, [ensureImageExtension, fileName, isSaving, readImagePayload]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/78 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <div
        className="relative w-full max-w-[min(96vw,1280px)] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,20,18,0.88),rgba(12,12,14,0.82))] p-3 shadow-2xl backdrop-blur-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">
              {alt}
            </div>
            <div className="mt-0.5 text-xs text-white/60">
              {'Esc 可关闭，支持直接保存'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleDownload(); }}
              disabled={isSaving}
              className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/16"
            >
              {isSaving ? '保存中...' : '保存图片'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/16"
            >
              关闭
            </button>
          </div>
        </div>
        <div className="flex max-h-[82vh] items-center justify-center overflow-auto rounded-[18px] border border-white/6 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3">
          <img
            src={src}
            alt={alt}
            className="max-h-[78vh] max-w-full rounded-[14px] object-contain shadow-[0_18px_42px_rgba(0,0,0,0.38)]"
          />
        </div>
      </div>
    </div>
  );
};

export default CoworkImagePreviewModal;
