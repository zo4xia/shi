import React from 'react';
import { MusicalNoteIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import { showGlobalToast } from '../../services/toast';
import { WebFileOperations } from '../../utils/fileOperations';
import { isWebBuild } from '../../utils/platform';
import type { CoworkRenderableMedia } from '../../types/cowork';
import {
  ensureRenderableMediaExtension,
  getRenderableMediaKind,
  readRenderableMediaPayload,
} from './coworkMediaHelpers';

interface CoworkMediaPreviewModalProps {
  media: CoworkRenderableMedia;
  src: string;
  onClose: () => void;
}

const CoworkMediaPreviewModal: React.FC<CoworkMediaPreviewModalProps> = ({
  media,
  src,
  onClose,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const mediaKind = React.useMemo(() => getRenderableMediaKind(media), [media]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = React.useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const payload = await readRenderableMediaPayload(media, src);
      const normalizedName = ensureRenderableMediaExtension(media, payload.mimeType);

      if (!isWebBuild() && window.electron?.dialog?.saveInlineFile) {
        const result = await window.electron.dialog.saveInlineFile({
          dataBase64: payload.base64Data,
          fileName: normalizedName,
          mimeType: payload.mimeType,
          purpose: 'export',
        });

        if (result.success) {
          showGlobalToast('媒体已保存');
          return;
        }
      }

      WebFileOperations.downloadBlob(payload.blob, normalizedName);
      showGlobalToast('媒体已下载');
    } catch (error) {
      console.error('Failed to save media preview:', error);
      showGlobalToast('保存媒体失败');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, media, src]);

  const renderBody = () => {
    if (mediaKind === 'video') {
      return (
        <video
          src={src}
          controls
          preload="metadata"
          className="max-h-[78vh] max-w-full rounded-[14px] shadow-[0_18px_42px_rgba(0,0,0,0.38)]"
        />
      );
    }

    if (mediaKind === 'audio') {
      return (
        <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-[18px] border border-white/8 bg-white/[0.04] px-6 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white">
            <MusicalNoteIcon className="h-7 w-7" />
          </div>
          <div>
            <div className="text-sm font-medium text-white">{media.name}</div>
            <div className="mt-1 text-xs text-white/60">{'支持直接播放，也可以保存到本地。'}</div>
          </div>
          <audio
            src={src}
            controls
            preload="metadata"
            className="w-full max-w-lg"
          />
        </div>
      );
    }

    return (
      <img
        src={src}
        alt={media.name}
        className="max-h-[78vh] max-w-full rounded-[14px] object-contain shadow-[0_18px_42px_rgba(0,0,0,0.38)]"
      />
    );
  };

  const icon = mediaKind === 'video'
    ? <VideoCameraIcon className="h-3.5 w-3.5" />
    : mediaKind === 'audio'
      ? <MusicalNoteIcon className="h-3.5 w-3.5" />
      : <PhotoIcon className="h-3.5 w-3.5" />;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/78 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="媒体预览"
    >
      <div
        className="relative w-full max-w-[min(96vw,1280px)] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,20,18,0.88),rgba(12,12,14,0.82))] p-3 shadow-2xl backdrop-blur-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              {icon}
              <span className="truncate">{media.name}</span>
            </div>
            <div className="mt-0.5 text-xs text-white/60">
              {mediaKind === 'video'
                ? '支持预览播放与保存'
                : mediaKind === 'audio'
                  ? '支持播放收听与保存'
                  : 'Esc 可关闭，支持直接保存'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleDownload(); }}
              disabled={isSaving}
              className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/16"
            >
              {isSaving ? '保存中...' : '保存本地'}
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
          {renderBody()}
        </div>
      </div>
    </div>
  );
};

export default CoworkMediaPreviewModal;
