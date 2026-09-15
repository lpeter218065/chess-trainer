import { describe, expect, it } from 'vitest';
import { PIECE_SET_IDS, parsePieceSet, piecesForSet } from '../src/chess/pieceSet';

describe('parsePieceSet', () => {
  it('accepts known ids and falls back to classic', () => {
    expect(parsePieceSet('classic')).toBe('classic');
    expect(parsePieceSet('walnut')).toBe('walnut');
    expect(parsePieceSet('letter')).toBe('letter');
    expect(parsePieceSet('spatial')).toBe('spatial');
    expect(parsePieceSet('fantasy')).toBe('fantasy');
    expect(parsePieceSet('shapes')).toBe('shapes');
    expect(parsePieceSet('unknown')).toBe('classic');
    expect(parsePieceSet(undefined)).toBe('classic');
  });
});

describe('piecesForSet', () => {
  it('classic uses the library default (no override)', () => {
    expect(piecesForSet('classic')).toBeUndefined();
  });

  it('walnut and letter provide all twelve piece renderers', () => {
    const keys = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
    for (const id of PIECE_SET_IDS.filter((set) => set !== 'classic')) {
      const pieces = piecesForSet(id);
      expect(pieces).toBeTruthy();
      for (const key of keys) {
        expect(typeof pieces?.[key]).toBe('function');
      }
    }
  });
});
