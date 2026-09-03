import { describe, it, expect } from 'vitest';
import { uciToSan, uciMoveToSan, formatEval, toPerspective, uciToSquares } from '../src/chess/notation';

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
