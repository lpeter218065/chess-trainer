import { describe, it, expect } from 'vitest';
import { scoreToCp, classifyMove } from '../src/chess/quality';

describe('scoreToCp', () => {
  it('cp 原样返回', () => expect(scoreToCp({ cp: 42 })).toBe(42));
  it('正 mate 接近 +10000，步数越少越大', () => {
    expect(scoreToCp({ mate: 3 })).toBe(9997);
    expect(scoreToCp({ mate: 1 })).toBeGreaterThan(scoreToCp({ mate: 5 }));
  });
  it('负 mate 接近 -10000', () => expect(scoreToCp({ mate: -2 })).toBe(-9998));
});

describe('classifyMove', () => {
  const base = { evalBefore: 30, userMoveUci: 'e2e4', bestMoveUci: 'd2d4' };
  it('走了引擎最佳着法就是 best', () => {
    expect(classifyMove({ ...base, userMoveUci: 'd2d4', evalAfter: -500 })).toBe('best');
  });
  it('掉分 < 30 为 good', () => expect(classifyMove({ ...base, evalAfter: 5 })).toBe('good'));
  it('掉分 30~90 为 inaccuracy', () => expect(classifyMove({ ...base, evalAfter: -20 })).toBe('inaccuracy'));
  it('掉分 90~200 为 mistake', () => expect(classifyMove({ ...base, evalAfter: -100 })).toBe('mistake'));
  it('掉分 > 200 为 blunder', () => expect(classifyMove({ ...base, evalAfter: -300 })).toBe('blunder'));
  it('评估上升也是 good', () => expect(classifyMove({ ...base, evalAfter: 80 })).toBe('good'));
});
