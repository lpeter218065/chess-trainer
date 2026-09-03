import { describe, it, expect } from 'vitest';
import { useProgress } from '../src/store/progress';

describe('progress store', () => {
  it('累计尝试并记录完成/干净完成', () => {
    const s = useProgress.getState();
    s.recordAttempt('a/b', 'fail', false);
    s.recordAttempt('a/b', 'success', false);
    let r = useProgress.getState().records['a/b'];
    expect(r.attempts).toBe(2);
    expect(r.completed).toBe(true);
    expect(r.clean).toBe(false);
    s.recordAttempt('a/b', 'success', true);
    r = useProgress.getState().records['a/b'];
    expect(r.clean).toBe(true);
  });
});
