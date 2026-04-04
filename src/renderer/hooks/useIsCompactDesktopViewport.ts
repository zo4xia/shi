import { useEffect, useState } from 'react';

function detectCompactDesktopViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const mediumWidth = window.matchMedia('(max-width: 1180px)').matches;
  const mobileWidth = window.matchMedia('(max-width: 768px)').matches;
  return mediumWidth && !mobileWidth;
}

export function useIsCompactDesktopViewport(): boolean {
  const [isCompactDesktopViewport, setIsCompactDesktopViewport] = useState<boolean>(() => detectCompactDesktopViewport());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 1180px)');
    const onChange = () => setIsCompactDesktopViewport(detectCompactDesktopViewport());
    onChange();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isCompactDesktopViewport;
}
