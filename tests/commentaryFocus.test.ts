import { describe, it, expect } from 'vitest';
import { toggleFocus } from '../src/chess/commentaryFocus';

describe('toggleFocus', () => {
  it('从空切到 X', () => {
    expect(toggleFocus(null, 'X')).toBe('X');
  });

  it('再点同一项取消', () => {
    expect(toggleFocus('X', 'X')).toBeNull();
  });

  it('从 X 切到 Y', () => {
    expect(toggleFocus('X', 'Y')).toBe('Y');
  });
});
