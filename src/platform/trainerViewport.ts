import { useEffect, useState } from 'react';
import { classifyViewport } from './index';

function readViewport() {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const height = typeof window === 'undefined' ? 800 : window.innerHeight;
  return { width, height, layoutHeight: height, offsetTop: 0, keyboardOpen: false, klass: classifyViewport(width) };
}

function isEditing() {
  const element = document.activeElement;
  return element instanceof HTMLElement && (
    element.isContentEditable || element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(element.type))
  );
}

/** Keep the layout orientation stable while a keyboard reduces the visible height. */
export function useTrainerViewport() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    let baseline = readViewport();
    let keyboardOpen = false;
    let frame: number | null = null;
    const visual = window.visualViewport;
    const update = () => {
      frame = null;
      const next = readViewport();
      const unzoomed = !visual || visual.scale === 1;
      const visibleHeight = unzoomed && visual ? Math.min(next.height, visual.height) : next.height;
      keyboardOpen = unzoomed && next.width === baseline.width &&
        (isEditing() || keyboardOpen) && baseline.height - visibleHeight > 120;
      if (!keyboardOpen) baseline = next;
      const value = {
        ...next,
        height: keyboardOpen ? visibleHeight : next.height,
        layoutHeight: keyboardOpen ? baseline.height : next.height,
        offsetTop: keyboardOpen ? visual?.offsetTop ?? 0 : 0,
        keyboardOpen,
      };
      setViewport((previous) => (
        previous.width === value.width && previous.height === value.height &&
        previous.layoutHeight === value.layoutHeight && previous.offsetTop === value.offsetTop &&
        previous.keyboardOpen === value.keyboardOpen ? previous : value
      ));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    visual?.addEventListener('resize', schedule);
    visual?.addEventListener('scroll', schedule);
    update();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      visual?.removeEventListener('resize', schedule);
      visual?.removeEventListener('scroll', schedule);
    };
  }, []);
  return viewport;
}
