import { describe, it, expect } from 'vitest';
import { uciToSan, uciMoveToSan, formatEval, toPerspective, uciToSquares, fenAfterPlies, fenAfterUciPlies, navigatePly, sanToUci, isIncrementalFen } from '../src/chess/notation';

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

describe('isIncrementalFen', () => {
  const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const MIDGAME = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8';
  const AFTER_CAPTURE = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3';
  const CAPTURE_PREV = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
  const BEFORE_CASTLE = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5';
  const AFTER_CASTLE = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 b kq - 7 5';

  it('起始→e4 为单步（真）', () => {
    expect(isIncrementalFen(START, AFTER_E4)).toBe(true);
  });
  it('起始→中局跳变为假', () => {
    expect(isIncrementalFen(START, MIDGAME)).toBe(false);
  });
  it('空 prev 为假', () => {
    expect(isIncrementalFen('', AFTER_E4)).toBe(false);
  });
  it('相同局面（无变化）为假', () => {
    expect(isIncrementalFen(START, START)).toBe(false);
  });
  it('吃子（棋子数变化）仍为单步（真）', () => {
    expect(isIncrementalFen(CAPTURE_PREV, AFTER_CAPTURE)).toBe(true);
  });
  it('王车易位（动 4 格）为单步（真）', () => {
    expect(isIncrementalFen(BEFORE_CASTLE, AFTER_CASTLE)).toBe(true);
  });
});
