import { describe, it, expect } from 'vitest';
import { Chess, type Square } from 'chess.js';
import { tapMoveReducer, type TapState } from '../src/chess/tapMove';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROMO = '8/P7/8/8/8/8/8/k6K w - - 0 1';
const EMPTY: TapState = { selected: null, targets: [] };

function legalAndOwn(fen: string) {
  const chess = new Chess(fen);
  const turn = chess.turn();
  const legalMoves = chess.moves({ verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
  }));
  const ownPieceSquares = new Set<string>();
  for (const file of 'abcdefgh') {
    for (const rank of '12345678') {
      const sq = `${file}${rank}` as Square;
      const p = chess.get(sq);
      if (p && p.color === turn) ownPieceSquares.add(sq);
    }
  }
  return { legalMoves, ownPieceSquares };
}

describe('tapMoveReducer', () => {
  it('未选中点己方子则选中并标出合法落点', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(START);
    const r = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares);
    expect(r.kind).toBe('select');
    expect(r.state.selected).toBe('e2');
    expect([...r.state.targets].sort()).toEqual(['e3', 'e4']);
  });

  it('未选中点其他格则无操作', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(START);
    const r = tapMoveReducer(EMPTY, 'e4', legalMoves, ownPieceSquares);
    expect(r.kind).toBe('clear');
    expect(r.state.selected).toBeNull();
    expect(r.state.targets).toEqual([]);
  });

  it('已选中点合法落点则走子', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(START);
    const selected = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares);
    const r = tapMoveReducer(selected.state, 'e4', legalMoves, ownPieceSquares);
    expect(r).toMatchObject({ kind: 'move', from: 'e2', to: 'e4' });
    expect(r.state.selected).toBeNull();
  });

  it('已选中点另一己方子则换选', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(START);
    const selected = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares);
    const r = tapMoveReducer(selected.state, 'g1', legalMoves, ownPieceSquares);
    expect(r.kind).toBe('select');
    expect(r.state.selected).toBe('g1');
    expect([...r.state.targets].sort()).toEqual(['f3', 'h3']);
  });

  it('已选中点同一格或非落点非己方格则取消选中', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(START);
    const selected = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares);
    const same = tapMoveReducer(selected.state, 'e2', legalMoves, ownPieceSquares);
    expect(same.kind).toBe('clear');
    expect(same.state.selected).toBeNull();

    const selected2 = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares);
    const other = tapMoveReducer(selected2.state, 'a3', legalMoves, ownPieceSquares);
    expect(other.kind).toBe('clear');
    expect(other.state.selected).toBeNull();
  });

  it('升变走子报告 q', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(PROMO);
    const selected = tapMoveReducer(EMPTY, 'a7', legalMoves, ownPieceSquares);
    expect(selected.kind).toBe('select');
    const r = tapMoveReducer(selected.state, 'a8', legalMoves, ownPieceSquares);
    expect(r).toMatchObject({ kind: 'move', from: 'a7', to: 'a8', promotion: 'q' });
  });

  it('非交互不选中也不走子', () => {
    const { legalMoves, ownPieceSquares } = legalAndOwn(START);
    const r = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares, false);
    expect(r.kind).not.toBe('select');
    expect(r.kind).not.toBe('move');
    expect(r.state.selected).toBeNull();

    const selected = tapMoveReducer(EMPTY, 'e2', legalMoves, ownPieceSquares);
    const blocked = tapMoveReducer(selected.state, 'e4', legalMoves, ownPieceSquares, false);
    expect(blocked.kind).not.toBe('move');
    expect(blocked.state.selected).toBeNull();
  });
});
