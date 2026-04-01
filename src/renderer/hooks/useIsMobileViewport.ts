import { useEffect, useState } from 'react';

function detectMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const narrowViewport = window.matchMedia('(max-width: 768px)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const ua = String(window.navigator.userAgent || '').toLowerCase();
  const uaMobile = /iphone|ipad|ipod|android|mobile|harmonyos/.test(ua);

  return narrowViewport || (coarsePointer && uaMobile);
}

export function useIsMobileViewport(): boolean {
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => detectMobileViewport());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobileViewport(detectMobileViewport());
    onChange();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isMobileViewport;
}
