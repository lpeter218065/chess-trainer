import { describe, expect, it } from 'vitest';
import { START_FEN, parsePgn } from '../src/chess/pgn';
import { buildAnnotatedPgn, playSans, sidelinesForMove } from '../src/review/pgnExport';
import { nagFromQuality } from '../src/review/moments';
import type { AnnotatedMove, ReviewDocument } from '../src/review/types';

function move(partial: Partial<AnnotatedMove> & Pick<AnnotatedMove, 'ply' | 'san'>): AnnotatedMove {
  return {
    uci: 'e2e4',
    from: 'e2',
    to: 'e4',
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    side: 'w',
    evalBefore: 20,
    evalAfter: 20,
    quality: 'good',
    bestSan: partial.san,
    bestUci: 'e2e4',
    pvSans: [],
    key: false,
    nag: nagFromQuality(partial.quality ?? 'good'),
    ...partial,
  };
}

describe('playSans', () => {
  it('stops at the first illegal token and strips move numbers', () => {
    expect(playSans(START_FEN, ['e4', 'e5', 'Qh5h8'])).toEqual(['e4', 'e5']);
    expect(playSans(START_FEN, ['1.e4', '1...e5', '2.Nf3'])).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('buildAnnotatedPgn', () => {
  it('writes engine sidelines as PGN parentheses', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const game = {
      pgn: '1. e4 e5 2. Nf3',
      headers: { White: 'A', Black: 'B', Result: '1-0' },
      startFen: START_FEN,
      moves: [
        move({ ply: 1, san: 'e4', fenBefore: START_FEN, fenAfter: afterE4, side: 'w' }),
        move({ ply: 2, san: 'e5', fenBefore: afterE4, fenAfter: afterE5, side: 'b', uci: 'e7e5', from: 'e7', to: 'e5' }),
        move({
          ply: 3,
          san: 'Nf3',
          fenBefore: afterE5,
          fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
          side: 'w',
          uci: 'g1f3',
          from: 'g1',
          to: 'f3',
          key: true,
          quality: 'best',
          bestSan: 'Nf3',
          pvSans: [
            ['Nc3', 'Nf6'],
            ['Bc4', 'Nf6'],
          ],
        }),
      ],
    };
    const pgn = buildAnnotatedPgn(game, null);
    expect(pgn).toContain('[White "A"]');
    expect(pgn).toContain('1. e4');
    expect(pgn).toContain('2. Nf3');
    expect(pgn).toContain('(2. Nc3');
    expect(pgn).toContain('(2. Bc4');
    expect(pgn).toContain('1-0');
    const main = parsePgn(pgn);
    expect(main.moves.slice(0, 3)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('nests review variations and attaches comments', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const game = {
      pgn: '1. e4 e5',
      headers: { Result: '*' },
      startFen: START_FEN,
      moves: [
        move({ ply: 1, san: 'e4', fenBefore: START_FEN, fenAfter: afterE4, key: true }),
        move({ ply: 2, san: 'e5', fenBefore: afterE4, side: 'b', uci: 'e7e5', from: 'e7', to: 'e5' }),
      ],
    };
    const doc: ReviewDocument = {
      title: 't',
      overview: '开放中心。',
      blocks: [
        { type: 'move', ply: 1, san: 'e4', text: '中心一兵。' },
        {
          type: 'variation',
          ply: 1,
          intro: '如果 1.d4',
          lines: [
            { label: '1', moves: 'd4 d5', text: '后兵。' },
            {
              label: '2',
              moves: 'c4',
              text: '英吉利。',
              children: [{ label: '2a', moves: 'e5', text: '转西西里结构。' }],
            },
          ],
        },
      ],
    };
    const pgn = buildAnnotatedPgn(game, doc);
    expect(pgn).toContain('{开放中心。}');
    expect(pgn).toContain('{中心一兵。}');
    expect(pgn).toContain('(1. d4');
    expect(pgn).toContain('(1. c4');
    const sides = sidelinesForMove(game.moves[0], doc);
    expect(sides.some((s) => s.sans[0] === 'd4')).toBe(true);
    expect(sides.some((s) => s.sans[0] === 'c4')).toBe(true);
  });
});
