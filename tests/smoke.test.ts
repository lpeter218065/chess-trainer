import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';

describe('toolchain', () => {
  it('chess.js 可用', () => {
    const c = new Chess();
    c.move('e4');
    expect(c.fen()).toContain('4P3');
  });
});
