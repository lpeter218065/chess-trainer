// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { printReview } from '../src/review/print';
import { formatCompactScore } from '../src/review/document';
import { START_FEN } from '../src/chess/pgn';

describe('printReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.title = '国际象棋训练';
  });

  it('sets the document title then opens the print dialog', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    document.title = '国际象棋训练';
    printReview('王翼进攻');
    expect(document.title).toBe('王翼进攻');
    expect(print).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('国际象棋训练');
  });
});

describe('formatCompactScore', () => {
  it('numbers both sides for a print score', () => {
    expect(
      formatCompactScore(START_FEN, [
        { ply: 1, san: 'e4' },
        { ply: 2, san: 'e5' },
        { ply: 3, san: 'Nf3', nag: '!' },
      ]),
    ).toBe('1. e4  1... e5  2. Nf3!');
  });
});
