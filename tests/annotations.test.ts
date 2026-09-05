import { describe, it, expect } from 'vitest';
import { annotationsAfterMove, annotationsFromAnalysis, annotationsFromFocus, mergeAnnotations, roundIndexForPly } from '../src/chess/annotations';
import type { Analysis } from '../src/engine/engineService';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    fen: START,
    bestMove: 'e2e4',
    lines: [
      { depth: 16, multipv: 1, score: { cp: 30 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
      { depth: 16, multipv: 2, score: { cp: 20 }, pv: ['d2d4', 'd7d5'] },
      { depth: 16, multipv: 3, score: { cp: 10 }, pv: ['g1f3'] },
    ],
    ...overrides,
  };
}

describe('annotationsFromAnalysis', () => {
  it('生成候选着法箭头与目标格', () => {
    const a = annotationsFromAnalysis(analysis());
    expect(a.arrows.some((x) => x.from === 'e2' && x.to === 'e4')).toBe(true);
    expect(a.arrows.some((x) => x.from === 'e7' && x.to === 'e5')).toBe(true);
    expect(a.squares.some((x) => x.square === 'e4')).toBe(true);
    expect(a.squares.some((x) => x.square === 'e5')).toBe(true);
  });
});

describe('annotationsAfterMove', () => {
  it('劣着时标注用户着法与最佳着法', () => {
    const a = annotationsAfterMove(analysis(), 'd2d3', 'inaccuracy');
    expect(a.arrows.some((x) => x.from === 'd2' && x.to === 'd3')).toBe(true);
    expect(a.arrows.some((x) => x.from === 'e2' && x.to === 'e4')).toBe(true);
  });

  it('最佳着时不重复标注用户着法', () => {
    const a = annotationsAfterMove(analysis(), 'e2e4', 'best');
    expect(a.arrows.filter((x) => x.from === 'e2' && x.to === 'e4')).toHaveLength(0);
  });
});

describe('annotationsFromFocus', () => {
  it('把局面判断标记画到棋盘', () => {
    const a = annotationsFromFocus({
      squares: ['d5', 'f7'],
      arrows: [{ from: 'd1', to: 'h5' }],
    });
    expect(a.squares.map((s) => s.square)).toEqual(['d5', 'f7']);
    expect(a.arrows).toEqual([expect.objectContaining({ from: 'd1', to: 'h5' })]);
  });

  it('mergeAnnotations 合并引擎与判断标记', () => {
    const m = mergeAnnotations(
      annotationsFromAnalysis(analysis()),
      annotationsFromFocus({ squares: ['c7'], arrows: [{ from: 'c1', to: 'f4' }] }),
    );
    expect(m.arrows.some((x) => x.from === 'e2' && x.to === 'e4')).toBe(true);
    expect(m.arrows.some((x) => x.from === 'c1' && x.to === 'f4')).toBe(true);
    expect(m.squares.some((x) => x.square === 'c7')).toBe(true);
  });
});

describe('roundIndexForPly', () => {
  it('奇数 ply 对应回合序号', () => {
    expect(roundIndexForPly(1)).toBe(0);
    expect(roundIndexForPly(3)).toBe(1);
    expect(roundIndexForPly(0)).toBe(-1);
  });
});
