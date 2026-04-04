import React from 'react';
import type { CoworkRenderableMedia } from '../../types/cowork';
import CoworkMediaPreviewModal from './CoworkMediaPreviewModal';

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
  const media: CoworkRenderableMedia = React.useMemo(() => ({
    name: fileName,
    mimeType: src.startsWith('data:') ? (/^data:(.+?);base64,/.exec(src)?.[1] || 'image/png') : undefined,
    url: src.startsWith('data:') ? undefined : src,
    base64Data: src.startsWith('data:') ? (src.split(',', 2)[1] || undefined) : undefined,
  }), [fileName, src]);

  return (
    <CoworkMediaPreviewModal media={{ ...media, name: alt || fileName }} src={src} onClose={onClose} />
  );
};

export default CoworkImagePreviewModal;
