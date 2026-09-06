import { describe, it, expect } from 'vitest';
import { evalAfterFromLines } from '../src/chess/evalFromLines';
import type { Analysis } from '../src/engine/engineService';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const analysis: Analysis = {
  fen,
  bestMove: 'e2e4',
  lines: [
    { depth: 16, multipv: 1, score: { cp: 35 }, pv: ['e2e4', 'e7e5'] },
    { depth: 16, multipv: 2, score: { cp: 20 }, pv: ['d2d4', 'd7d5'] },
    { depth: 16, multipv: 3, score: { mate: 3 }, pv: ['g1f3'] },
  ],
};

describe('evalAfterFromLines', () => {
  it('命中第一条：返回对手视角的分数（取反）', () => {
    expect(evalAfterFromLines(analysis, 'e2e4')).toBe(-35);
  });
  it('命中第二条', () => {
    expect(evalAfterFromLines(analysis, 'd2d4')).toBe(-20);
  });
  it('mate 分数按 scoreToCp 换算后取反', () => {
    const v = evalAfterFromLines(analysis, 'g1f3');
    expect(v).not.toBeNull();
    expect(v!).toBeLessThan(-9000);
  });
  it('未命中返回 null', () => {
    expect(evalAfterFromLines(analysis, 'c2c4')).toBeNull();
  });
  it('空 pv 不崩', () => {
    expect(evalAfterFromLines({ ...analysis, lines: [{ depth: 1, multipv: 1, score: { cp: 0 }, pv: [] }] }, 'e2e4')).toBeNull();
  });
});
