import { describe, expect, it } from 'vitest';
import { BOARD_THEME_IDS, parseBoardTheme, squaresForTheme } from '../src/chess/boardTheme';
import { PIECE_COLOR_IDS, parsePieceColor, tintForColor } from '../src/chess/pieceColor';
import { piecesForSet } from '../src/chess/pieceSet';

describe('parseBoardTheme', () => {
  it('accepts known ids and falls back to walnut', () => {
    expect(parseBoardTheme('walnut')).toBe('walnut');
    expect(parseBoardTheme('baize')).toBe('baize');
    expect(parseBoardTheme('ocean')).toBe('ocean');
    expect(parseBoardTheme('sand')).toBe('sand');
    expect(parseBoardTheme('ink')).toBe('ink');
    expect(parseBoardTheme('nope')).toBe('walnut');
    expect(parseBoardTheme(undefined)).toBe('walnut');
  });

  it('every theme has distinct light and dark squares', () => {
    for (const id of BOARD_THEME_IDS) {
      const { light, dark } = squaresForTheme(id);
      expect(light).not.toBe(dark);
      expect(light.startsWith('#')).toBe(true);
      expect(dark.startsWith('#')).toBe(true);
    }
  });
});

describe('parsePieceColor', () => {
  it('accepts known ids and falls back to standard', () => {
    expect(parsePieceColor('standard')).toBe('standard');
    expect(parsePieceColor('walnut')).toBe('walnut');
    expect(parsePieceColor('brass')).toBe('brass');
    expect(parsePieceColor('contrast')).toBe('contrast');
    expect(parsePieceColor('nope')).toBe('standard');
  });

  it('classic + standard keeps library pieces', () => {
    expect(piecesForSet('classic', 'standard')).toBeUndefined();
  });

  it('classic + walnut tints all twelve pieces', () => {
    const pieces = piecesForSet('classic', 'walnut');
    expect(pieces).toBeTruthy();
    for (const key of ['wP', 'wK', 'bP', 'bK']) {
      expect(typeof pieces?.[key]).toBe('function');
    }
    const tint = tintForColor('walnut');
    expect(tint.whiteFill).not.toBe(tint.blackFill);
  });
});

describe('PIECE_COLOR_IDS', () => {
  it('lists the four palettes', () => {
    expect(PIECE_COLOR_IDS).toEqual(['standard', 'walnut', 'brass', 'contrast']);
  });
});
