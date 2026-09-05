import { describe, it, expect, vi } from 'vitest';
import { createDebouncer, LLM_DEBOUNCE_MS, ANALYZE_DEBOUNCE_MS } from '../src/utils/debounce';

describe('createDebouncer', () => {
  it('只执行最后一次调度', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebouncer(300);
    d.schedule(fn);
    d.schedule(fn);
    d.schedule(fn);
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancel 阻止执行', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = createDebouncer(100);
    d.schedule(fn);
    d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('被挤掉的调度会调用 onSuperseded', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const dropped = vi.fn();
    const d = createDebouncer(50);
    d.schedule(fn, dropped);
    d.schedule(fn);
    expect(dropped).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('防抖常量', () => {
  it('讲解防抖不超过 150 ms，切步防抖保持 350 ms', () => {
    expect(LLM_DEBOUNCE_MS).toBeLessThanOrEqual(150);
    expect(ANALYZE_DEBOUNCE_MS).toBe(350);
  });
});
