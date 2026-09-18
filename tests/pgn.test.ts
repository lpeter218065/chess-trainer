import { describe, it, expect } from 'vitest';
import { parsePgn, parseFen, START_FEN } from '../src/chess/pgn';

describe('parsePgn', () => {
  it('解析简单 PGN', () => {
    const { startFen, moves } = parsePgn('1. e4 e5 2. Nf3');
    expect(startFen).toBe(START_FEN);
    expect(moves).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('读取对局头', () => {
    const pgn = `[Event "Casual"]
[White "Morphy"]
[Black "Duke"]
[Result "1-0"]

1. e4 e5`;
    const { headers, moves } = parsePgn(pgn);
    expect(headers.White).toBe('Morphy');
    expect(headers.Black).toBe('Duke');
    expect(headers.Result).toBe('1-0');
    expect(moves).toEqual(['e4', 'e5']);
  });

  it('使用 FEN 头作为起始局面', () => {
    const pgn = `[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]

1. e4`;
    const { startFen, moves } = parsePgn(pgn);
    expect(startFen.startsWith('4k3/8/8/8/8/8/4P3/4K3 w')).toBe(true);
    expect(moves).toEqual(['e4']);
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
