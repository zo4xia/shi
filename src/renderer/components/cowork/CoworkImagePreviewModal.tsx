import React from 'react';

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
    const normalizedName = fileName.trim() || 'uclaw-image';
    const fallbackDownload = () => {
      const link = document.createElement('a');
      link.href = src;
      link.download = normalizedName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    if (src.startsWith('data:')) {
      fallbackDownload();
      return;
    }

    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = normalizedName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      fallbackDownload();
    }
  }, [fileName, src]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/78 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <div
        className="relative w-full max-w-[min(96vw,1200px)] rounded-[24px] border border-white/10 bg-black/30 p-3 shadow-2xl backdrop-blur-sm"
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
              className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/16"
            >
              保存图片
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
        <div className="flex max-h-[82vh] items-center justify-center overflow-auto rounded-[18px] bg-black/35 p-2">
          <img
            src={src}
            alt={alt}
            className="max-h-[78vh] max-w-full object-contain rounded-lg shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
};

export default CoworkImagePreviewModal;
