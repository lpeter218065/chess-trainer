// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { classifyViewport } from '../src/platform';
import { useViewportSize } from '../src/platform';

type AnimationFrameHarness = {
  request: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  flush: () => void;
};

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
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

  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: request,
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: cancel,
  });

  return {
    request,
    cancel,
    flush: () => {
      const next = callbacks.keys().next();
      if (next.done) return;
      const id = next.value;
      const callback = callbacks.get(id);
      callbacks.delete(id);
      callback?.(0);
    },
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { requestAnimationFrame?: typeof window.requestAnimationFrame })
    .requestAnimationFrame;
  delete (window as unknown as { cancelAnimationFrame?: typeof window.cancelAnimationFrame })
    .cancelAnimationFrame;
});

describe('classifyViewport', () => {
  it('699 为 compact', () => {
    expect(classifyViewport(699)).toBe('compact');
  });

  it('700 与 1023 为 medium', () => {
    expect(classifyViewport(700)).toBe('medium');
    expect(classifyViewport(1023)).toBe('medium');
  });

  it('1024 为 wide', () => {
    expect(classifyViewport(1024)).toBe('wide');
  });
});

describe('useViewportSize', () => {
  it('coalesces resize and orientation changes into one frame', () => {
    setWindowSize(390, 844);
    const frames = installAnimationFrameHarness();
    const { result, unmount } = renderHook(() => useViewportSize());

    act(() => {
      setWindowSize(800, 390);
      window.dispatchEvent(new Event('resize'));
      setWindowSize(1024, 768);
      window.dispatchEvent(new Event('orientationchange'));
    });

    expect(frames.request).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ width: 390, height: 844, klass: 'compact' });

    act(() => frames.flush());
    expect(result.current).toEqual({ width: 1024, height: 768, klass: 'wide' });
    unmount();
  });

  it('keeps the previous state object when the viewport is unchanged', () => {
    setWindowSize(800, 600);
    const frames = installAnimationFrameHarness();
    const renders: Array<ReturnType<typeof useViewportSize>> = [];
    const { result } = renderHook(() => {
      const viewport = useViewportSize();
      renders.push(viewport);
      return viewport;
    });
    const initial = result.current;

    act(() => window.dispatchEvent(new Event('resize')));
    expect(frames.request).toHaveBeenCalledTimes(1);
    act(() => frames.flush());

    expect(result.current).toBe(initial);
    expect(renders).toHaveLength(1);
  });

  it('cancels a pending frame and removes listeners on unmount', () => {
    setWindowSize(800, 600);
    const frames = installAnimationFrameHarness();
    const { unmount } = renderHook(() => useViewportSize());

    act(() => window.dispatchEvent(new Event('resize')));
    expect(frames.request).toHaveBeenCalledTimes(1);

    unmount();
    expect(frames.cancel).toHaveBeenCalledWith(1);

    act(() => window.dispatchEvent(new Event('orientationchange')));
    expect(frames.request).toHaveBeenCalledTimes(1);
  });

  it('updates dimensions and class for orientation changes', () => {
    setWindowSize(390, 844);
    const frames = installAnimationFrameHarness();
    const { result, unmount } = renderHook(() => useViewportSize());

    act(() => {
      setWindowSize(844, 390);
      window.dispatchEvent(new Event('orientationchange'));
      frames.flush();
    });

    expect(result.current).toEqual({ width: 844, height: 390, klass: 'medium' });
    unmount();
  });
});
