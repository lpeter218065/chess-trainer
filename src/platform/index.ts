import { useEffect, useState } from 'react';

export { isNative } from './native';
export { createPlatformStorage, debounceStorage } from './storage';
export { getApiKey, setApiKey, clearApiKey } from './secureStore';

export type ViewportClass = 'compact' | 'medium' | 'wide';

export function classifyViewport(width: number): ViewportClass {
  if (width < 700) return 'compact';
  if (width < 1024) return 'medium';
  return 'wide';
}

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

export function hasHover(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(HOVER_QUERY).matches;
}

export function useHasHover(): boolean {
  const [hover, setHover] = useState(hasHover);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(HOVER_QUERY);
    const onChange = () => setHover(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return hover;
}

function readViewport(): { width: number; height: number; klass: ViewportClass } {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const height = typeof window === 'undefined' ? 800 : window.innerHeight;
  return { width, height, klass: classifyViewport(width) };
}

export function useViewportSize(): { width: number; height: number; klass: ViewportClass } {
  const [vp, setVp] = useState(readViewport);
  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const next = readViewport();
      setVp((previous) => (
        previous.width === next.width &&
        previous.height === next.height &&
        previous.klass === next.klass
          ? previous
          : next
      ));
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);
    update();
    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);
  return vp;
}

export function useViewportClass(): ViewportClass {
  return useViewportSize().klass;
}
