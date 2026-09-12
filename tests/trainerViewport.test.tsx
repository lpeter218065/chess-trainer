// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTrainerViewport } from '../src/platform/trainerViewport';

type VisualViewportMock = EventTarget & {
  height: number;
  offsetTop: number;
  scale: number;
};

type AnimationFrameHarness = {
  request: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  flush: () => void;
};

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
const originalCancelAnimationFrame = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function setProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(window, name, descriptor);
  else delete (window as unknown as Record<string, unknown>)[name];
}

function installVisualViewport(height: number, offsetTop = 0, scale = 1): VisualViewportMock {
  const visual = Object.assign(new EventTarget(), { height, offsetTop, scale }) as VisualViewportMock;
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
  return visual;
}

function installAnimationFrameHarness(): AnimationFrameHarness {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: request });
  Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: cancel });
  return {
    request,
    cancel,
    flush: () => {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) callback(0);
    },
  };
}

function resizeTo(frames: AnimationFrameHarness, width: number, height: number): void {
  act(() => {
    setWindowSize(width, height);
    window.dispatchEvent(new Event('resize'));
    frames.flush();
  });
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  setProperty('visualViewport', originalVisualViewport);
  setProperty('requestAnimationFrame', originalRequestAnimationFrame);
  setProperty('cancelAnimationFrame', originalCancelAnimationFrame);
});

describe('useTrainerViewport', () => {
  it('keeps the pre-keyboard layout height while the focused editor reduces the viewport', () => {
    setWindowSize(834, 1194);
    const frames = installAnimationFrameHarness();
    const { result } = renderHook(() => useTrainerViewport());
    const editor = document.createElement('textarea');
    document.body.append(editor);

    act(() => {
      editor.focus();
      setWindowSize(834, 794);
      window.dispatchEvent(new Event('resize'));
      frames.flush();
    });

    expect(result.current).toMatchObject({
      width: 834,
      height: 794,
      layoutHeight: 1194,
      keyboardOpen: true,
    });
  });

  it('closes the keyboard state only after the reduced viewport is restored', () => {
    setWindowSize(834, 1194);
    const frames = installAnimationFrameHarness();
    const { result } = renderHook(() => useTrainerViewport());
    const editor = document.createElement('textarea');
    document.body.append(editor);

    act(() => {
      editor.focus();
      resizeTo(frames, 834, 794);
      editor.blur();
      document.dispatchEvent(new Event('focusout'));
      frames.flush();
    });
    expect(result.current.keyboardOpen).toBe(true);
    expect(result.current.layoutHeight).toBe(1194);

    resizeTo(frames, 834, 1194);
    expect(result.current).toMatchObject({ height: 1194, layoutHeight: 1194, keyboardOpen: false });
  });

  it('resets the baseline on a width change such as rotation', () => {
    setWindowSize(834, 1194);
    const frames = installAnimationFrameHarness();
    const { result } = renderHook(() => useTrainerViewport());
    const editor = document.createElement('textarea');
    document.body.append(editor);

    act(() => {
      editor.focus();
      resizeTo(frames, 834, 794);
    });
    expect(result.current.keyboardOpen).toBe(true);

    resizeTo(frames, 1194, 834);
    expect(result.current).toMatchObject({ width: 1194, height: 834, layoutHeight: 834, keyboardOpen: false });

    resizeTo(frames, 1194, 600);
    expect(result.current).toMatchObject({ width: 1194, height: 600, layoutHeight: 834, keyboardOpen: true });
  });

  it('treats a normal height resize without a focused editor as a layout resize', () => {
    setWindowSize(834, 1194);
    const frames = installAnimationFrameHarness();
    const { result } = renderHook(() => useTrainerViewport());

    resizeTo(frames, 834, 794);
    expect(result.current).toMatchObject({ height: 794, layoutHeight: 794, keyboardOpen: false });
  });

  it('uses visualViewport height and offset when it changes without a window resize', () => {
    setWindowSize(834, 1194);
    const visual = installVisualViewport(1194);
    const frames = installAnimationFrameHarness();
    const { result } = renderHook(() => useTrainerViewport());
    const editor = document.createElement('textarea');
    document.body.append(editor);

    act(() => {
      editor.focus();
      visual.height = 794;
      visual.offsetTop = 24;
      visual.dispatchEvent(new Event('resize'));
      frames.flush();
    });

    expect(result.current).toMatchObject({
      width: 834,
      height: 794,
      layoutHeight: 1194,
      offsetTop: 24,
      keyboardOpen: true,
    });
  });

  it('ignores pinch zoom as keyboard evidence', () => {
    setWindowSize(834, 1194);
    const visual = installVisualViewport(1194);
    const frames = installAnimationFrameHarness();
    const { result } = renderHook(() => useTrainerViewport());
    const editor = document.createElement('textarea');
    document.body.append(editor);

    act(() => {
      editor.focus();
      visual.scale = 1.5;
      visual.height = 794;
      visual.offsetTop = 24;
      visual.dispatchEvent(new Event('resize'));
      frames.flush();
    });

    expect(result.current).toMatchObject({
      height: 1194,
      layoutHeight: 1194,
      offsetTop: 0,
      keyboardOpen: false,
    });
  });

  it('coalesces updates and removes window and visual viewport listeners on unmount', () => {
    setWindowSize(834, 1194);
    const visual = installVisualViewport(1194);
    const frames = installAnimationFrameHarness();
    const { unmount } = renderHook(() => useTrainerViewport());

    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('orientationchange'));
      visual.dispatchEvent(new Event('resize'));
      visual.dispatchEvent(new Event('scroll'));
    });
    expect(frames.request).toHaveBeenCalledTimes(1);

    unmount();
    expect(frames.cancel).toHaveBeenCalledWith(1);

    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('orientationchange'));
      visual.dispatchEvent(new Event('resize'));
      visual.dispatchEvent(new Event('scroll'));
    });
    expect(frames.request).toHaveBeenCalledTimes(1);
  });
});
