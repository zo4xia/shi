import { useEffect, useState } from 'react';

function detectMediumViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const mediumWidth = window.matchMedia('(min-width: 769px) and (max-width: 1180px)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  return mediumWidth && !coarsePointer;
}

export function useIsMediumViewport(): boolean {
  const [isMediumViewport, setIsMediumViewport] = useState<boolean>(() => detectMediumViewport());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(min-width: 769px) and (max-width: 1180px)');
    const onChange = () => setIsMediumViewport(detectMediumViewport());
    onChange();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isMediumViewport;
}
