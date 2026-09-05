import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStreamFlusher } from '../src/utils/streamFlusher';

afterEach(() => vi.useRealTimers());

describe('createStreamFlusher', () => {
  it('首个 chunk 立即刷，间隔内的后续 chunk 合并为一次 trailing flush', () => {
    vi.useFakeTimers();
    const flushes: string[] = [];
    const f = createStreamFlusher((t) => flushes.push(t), 50);
    f.push('a');
    expect(flushes).toEqual(['a']);
    f.push('b');
    f.push('c');
    expect(flushes).toEqual(['a']);
    vi.advanceTimersByTime(50);
    expect(flushes).toEqual(['a', 'abc']);
    // 窗口过后再来的 chunk 又是立即刷
    f.push('d');
    expect(flushes).toEqual(['a', 'abc', 'abcd']);
  });

  it('finish 刷出剩余并返回全文；无剩余时不重复刷', () => {
    vi.useFakeTimers();
    const flushes: string[] = [];
    const f = createStreamFlusher((t) => flushes.push(t), 50);
    f.push('x');
    f.push('y');
    expect(f.finish()).toBe('xy');
    expect(flushes).toEqual(['x', 'xy']);
    expect(f.finish()).toBe('xy');
    expect(flushes).toEqual(['x', 'xy']);
    vi.advanceTimersByTime(100);
    expect(flushes).toEqual(['x', 'xy']);
  });

  it('cancel 丢弃未刷出的部分', () => {
    vi.useFakeTimers();
    const flushes: string[] = [];
    const f = createStreamFlusher((t) => flushes.push(t), 50);
    f.push('x');
    f.push('y');
    f.cancel();
    vi.advanceTimersByTime(100);
    expect(flushes).toEqual(['x']);
    expect(f.text).toBe('xy');
  });
});
