import { describe, it, expect } from 'vitest';
import { parsePgn, parseFen, START_FEN } from '../src/chess/pgn';

describe('parsePgn', () => {
  it('解析简单 PGN', () => {
    const { startFen, moves } = parsePgn('1. e4 e5 2. Nf3');
    expect(startFen).toBe(START_FEN);
    expect(moves).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('parseFen', () => {
  it('合法 FEN 返回标准化字符串', () => {
    expect(parseFen(START_FEN)).toBe(START_FEN);
  });
  it('非法 FEN 返回 null', () => {
    expect(parseFen('not a fen')).toBeNull();
  });
});
