import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { annotateGame, skeletonMoves } from '../src/review/annotate';
import { START_FEN } from '../src/chess/pgn';
import type { EnginePort } from '../src/engine/engineService';

function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    if (!m) return 'e2e4';
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 8, multipv: 1, score: { cp: 25 }, pv: [bm] }] };
    },
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

describe('skeletonMoves', () => {
  it('replays SAN without engine scores', () => {
    const moves = skeletonMoves(START_FEN, ['e4', 'e5', 'Nf3']);
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(moves[0].fenBefore).toBe(START_FEN);
    expect(moves[2].ply).toBe(3);
    expect(moves[2].uci).toBe('g1f3');
  });
});

describe('annotateGame', () => {
  it('scores every ply up front', async () => {
    const game = await annotateGame(fakeEngine(), '1. e4 e5 2. Nf3');
    expect(game.moves).toHaveLength(3);
    expect(game.moves.every((m) => m.quality)).toBe(true);
    expect(game.moves[0].fenAfter).toContain('4P3');
    expect(game.headers.Result).toBe('*');
  });

  it('keeps player names from the PGN', async () => {
    const game = await annotateGame(fakeEngine(), `[White "A"]\n[Black "B"]\n\n1. e4 e5`);
    expect(game.headers.White).toBe('A');
    expect(game.moves).toHaveLength(2);
  });
});
