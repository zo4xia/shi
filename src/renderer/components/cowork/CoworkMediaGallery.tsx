import React, { useMemo, useState } from 'react';
import { MusicalNoteIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import type { CoworkRenderableMedia } from '../../types/cowork';
import CoworkMediaPreviewModal from './CoworkMediaPreviewModal';
import { getRenderableMediaKind, getRenderableMediaSrc, type CoworkRenderableMediaKind } from './coworkMediaHelpers';

interface CoworkMediaGalleryProps {
  mediaItems: CoworkRenderableMedia[];
  compact?: boolean;
  generated?: boolean;
}

const mediaBadgeCopy: Record<CoworkRenderableMediaKind, string> = {
  image: '点击查看',
  video: '点击播放',
  audio: '点击展开',
  file: '点击查看',
};

const mediaIconMap: Record<CoworkRenderableMediaKind, React.ReactNode> = {
  image: <PhotoIcon className="h-3.5 w-3.5 flex-shrink-0" />,
  video: <VideoCameraIcon className="h-3.5 w-3.5 flex-shrink-0" />,
  audio: <MusicalNoteIcon className="h-3.5 w-3.5 flex-shrink-0" />,
  file: <PhotoIcon className="h-3.5 w-3.5 flex-shrink-0" />,
};

const CoworkMediaGallery: React.FC<CoworkMediaGalleryProps> = ({
  mediaItems,
  compact = false,
  generated = false,
}) => {
  const [expandedMedia, setExpandedMedia] = useState<{ media: CoworkRenderableMedia; src: string } | null>(null);
  const renderableMedia = useMemo(
    () => mediaItems
      .map((media) => {
        const src = getRenderableMediaSrc(media);
        return src
          ? {
              media,
              src,
              kind: getRenderableMediaKind(media),
            }
          : null;
      })
      .filter((entry): entry is { media: CoworkRenderableMedia; src: string; kind: CoworkRenderableMediaKind } => Boolean(entry)),
    [mediaItems]
  );

  if (renderableMedia.length === 0) {
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
          {renderableMedia.map(({ media, src, kind }, idx) => (
            <button
              key={`${media.name}-${idx}`}
              type="button"
              className="relative group overflow-hidden rounded-[20px] border border-claude-border/60 bg-white/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-claude-accent/40 hover:shadow-md dark:border-claude-darkBorder/60 dark:bg-white/[0.04]"
              onClick={() => setExpandedMedia({ media, src })}
              title={media.name}
            >
              <div className="flex h-[220px] w-[220px] items-center justify-center bg-gradient-to-br from-[#f7f4ef] to-[#f2ede7] p-3 dark:from-white/[0.04] dark:to-white/[0.02] sm:h-[240px] sm:w-[240px]">
                {kind === 'image' && (
                  <img
                    src={src}
                    alt={media.name}
                    className="max-h-full max-w-full rounded-xl object-contain"
                  />
                )}
                {kind === 'video' && (
                  <video
                    src={src}
                    muted
                    playsInline
                    preload="metadata"
                    className="max-h-full max-w-full rounded-xl object-contain"
                  />
                )}
                {kind === 'audio' && (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-white/40 bg-white/65 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-white/[0.05]">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f0a762]/18 text-[#c86a2f] dark:bg-amber-300/12 dark:text-amber-200">
                      <MusicalNoteIcon className="h-6 w-6" />
                    </div>
                    <div className="text-xs font-medium text-claude-text dark:text-claude-darkText">
                      音频片段
                    </div>
                    <div className="text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                      支持播放与保存
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-xl bg-black/58 px-2.5 py-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
                {mediaIconMap[kind]}
                <span className="truncate">{media.name}</span>
                <span className="ml-auto shrink-0 text-white/80">{mediaBadgeCopy[kind]}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {expandedMedia && (
        <CoworkMediaPreviewModal
          media={expandedMedia.media}
          src={expandedMedia.src}
          onClose={() => setExpandedMedia(null)}
        />
      )}
    </>
  );
};

export default CoworkMediaGallery;
