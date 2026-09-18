import { describe, expect, it } from 'vitest';
import { START_FEN } from '../src/chess/pgn';
import { annotationsFromReviewPly } from '../src/review/highlight';
import type { AnnotatedMove, ReviewBlock } from '../src/review/types';

const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const e4: AnnotatedMove = {
  ply: 1,
  san: 'e4',
  uci: 'e2e4',
  from: 'e2',
  to: 'e4',
  fenBefore: START_FEN,
  fenAfter: afterE4,
  side: 'w',
  evalBefore: 20,
  evalAfter: 20,
  quality: 'good',
  bestSan: 'd4',
  bestUci: 'd2d4',
  pvSans: [['d4', 'd5']],
  key: true,
  nag: '',
};

describe('annotationsFromReviewPly', () => {
  it('highlights the played move, a better engine move, and a variation', () => {
    const blocks: ReviewBlock[] = [
      { type: 'move', ply: 1, san: 'e4', text: '中心 {{e2-e4}}。' },
      { type: 'variation', ply: 1, intro: '如果 1.d4', lines: [{ moves: 'd4 d5', text: '后兵。' }] },
    ];
    const ann = annotationsFromReviewPly(e4, blocks);
    expect(ann.arrows.some((a) => a.from === 'e2' && a.to === 'e4')).toBe(true);
    expect(ann.arrows.some((a) => a.from === 'd2' && a.to === 'd4')).toBe(true);
    expect(ann.squares.some((s) => s.square === 'e4')).toBe(true);
  });

  it('returns empty when there is no current move', () => {
    expect(annotationsFromReviewPly(null, [])).toEqual({ arrows: [], squares: [] });
  });
});
