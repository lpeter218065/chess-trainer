import { describe, it, expect } from 'vitest';
import { uciToSan, uciMoveToSan, formatEval, toPerspective, uciToSquares, fenAfterPlies, fenAfterUciPlies, navigatePly, sanToUci } from '../src/chess/notation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('uciToSan', () => {
  it('转换合法线路', () => {
    expect(uciToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('遇到非法着法停止', () => {
    expect(uciToSan(START, ['e2e4', 'e2e3'])).toEqual(['e4']);
  });
  it('处理升变', () => {
    expect(uciMoveToSan('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q')).toBe('a8=Q+');
  });
  it('非法着法返回 null', () => {
    expect(uciMoveToSan(START, 'e2e5')).toBeNull();
  });
});

describe('formatEval', () => {
  it('厘兵转带符号小数', () => {
    expect(formatEval(35)).toBe('+0.35');
    expect(formatEval(-120)).toBe('-1.20');
    expect(formatEval(0)).toBe('0.00');
  });
  it('杀棋分数显示 M', () => {
    expect(formatEval(10000 - 3)).toBe('M3');
    expect(formatEval(-10000 + 2)).toBe('-M2');
  });
});

describe('toPerspective', () => {
  it('同色不变，异色取反', () => {
    expect(toPerspective(50, 'w', 'w')).toBe(50);
    expect(toPerspective(50, 'b', 'w')).toBe(-50);
  });
});

describe('uciToSquares', () => {
  it('拆分 from/to/promotion', () => {
    expect(uciToSquares('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(uciToSquares('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
  });
});

describe('fenAfterUciPlies', () => {
  it('按 UCI 前进 n 步', () => {
    const r = fenAfterUciPlies(START, ['e2e4', 'e7e5'], 1);
    expect(r.fen).toContain('4P3');
    expect(r.lastMove).toEqual({ from: 'e2', to: 'e4' });
  });
});

describe('sanToUci', () => {
  it('SAN 转 UCI，可再走回同一局面', () => {
    const uci = sanToUci(START, ['e4', 'e5', 'Nf3']);
    expect(uci).toEqual(['e2e4', 'e7e5', 'g1f3']);
    const r = fenAfterUciPlies(START, uci, 3);
    expect(fenAfterPlies(START, ['e4', 'e5', 'Nf3'], 3).fen).toBe(r.fen);
  });
});

describe('fenAfterPlies', () => {
  const line = ['e4', 'e5', 'Nf3'];
  it('0 步是起始局面', () => {
    const r = fenAfterPlies(START, line, 0);
    expect(r.fen).toBe(START);
    expect(r.lastMove).toBeNull();
  });
  it('走 n 步后的局面与最后一步 from/to', () => {
    const r = fenAfterPlies(START, line, 1);
    expect(r.fen).toContain('4P3');
    expect(r.lastMove).toEqual({ from: 'e2', to: 'e4' });
  });
  it('ply 超出历史则停在最后', () => {
    const last = fenAfterPlies(START, line, 3);
    const over = fenAfterPlies(START, line, 99);
    expect(over).toEqual(last);
    expect(over.lastMove).toEqual({ from: 'g1', to: 'f3' });
  });
});

describe('navigatePly', () => {
  it('左退右进，夹在 0 与最新之间', () => {
    expect(navigatePly(2, 4, 'back')).toBe(1);
    expect(navigatePly(0, 4, 'back')).toBe(0);
    expect(navigatePly(2, 4, 'forward')).toBe(3);
    expect(navigatePly(4, 4, 'forward')).toBe(4);
    expect(navigatePly(2, 4, 'start')).toBe(0);
    expect(navigatePly(2, 4, 'end')).toBe(4);
  });
});
