import { describe, it, expect } from 'vitest';
import { parseInfoLine, parseBestMove } from '../src/engine/uciParser';

describe('parseInfoLine', () => {
  it('解析 cp 分数与 pv', () => {
    const l = parseInfoLine('info depth 18 seldepth 25 multipv 1 score cp 35 nodes 1000 nps 1 pv e2e4 e7e5 g1f3');
    expect(l).toEqual({ depth: 18, multipv: 1, score: { cp: 35 }, pv: ['e2e4', 'e7e5', 'g1f3'] });
  });
  it('解析 mate 分数', () => {
    expect(parseInfoLine('info depth 10 multipv 2 score mate -3 pv a1a2')?.score).toEqual({ mate: -3 });
  });
  it('无 multipv 时默认 1', () => {
    expect(parseInfoLine('info depth 5 score cp 0 pv e2e4')?.multipv).toBe(1);
  });
  it('忽略没有 pv 或非 info 行', () => {
    expect(parseInfoLine('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('取 bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 1')).toBeNull();
  });
});
