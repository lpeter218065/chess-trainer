import { describe, expect, it } from 'vitest';
import { START_FEN } from '../src/chess/pgn';
import {
  ensureMoveBlocks,
  formatMoveHeading,
  lastCoveredPly,
  mergeExpandedBlocks,
  mergeReviewDocuments,
  parseReviewOutput,
  titleFromHeaders,
} from '../src/review/document';
import { nagFromQuality, markKeyMoves } from '../src/review/moments';
import { skeletonMoves } from '../src/review/annotate';
import type { AnnotatedMove } from '../src/review/types';

function move(partial: Partial<AnnotatedMove> & Pick<AnnotatedMove, 'ply' | 'san' | 'quality'>): AnnotatedMove {
  return {
    uci: 'e2e4',
    from: 'e2',
    to: 'e4',
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    side: 'w',
    evalBefore: 20,
    evalAfter: 20,
    bestSan: 'e4',
    bestUci: 'e2e4',
    pvSans: [['e4']],
    key: false,
    nag: nagFromQuality(partial.quality),
    ...partial,
  };
}

describe('parseReviewOutput', () => {
  it('parses NDJSON title plus move blocks', () => {
    const raw = `{"title":"王翼进攻","overview":"西班牙开局。"}
{"type":"move","ply":1,"san":"e4","nag":"","text":"中心一兵。"}
{"type":"diagram","ply":1,"caption":"图1"}
{"type":"variation","ply":1,"intro":"如果 1...c5","lines":[{"label":"1","moves":"c5 Nf3","text":"西西里。"}]}
`;
    const doc = parseReviewOutput(raw);
    expect(doc.title).toBe('王翼进攻');
    expect(doc.overview).toBe('西班牙开局。');
    expect(doc.blocks).toHaveLength(3);
    expect(doc.blocks[0]).toMatchObject({ type: 'move', ply: 1, san: 'e4' });
    expect(doc.blocks[1]).toMatchObject({ type: 'diagram', ply: 1, caption: '图1' });
    expect(doc.blocks[2].type).toBe('variation');
  });

  it('parses a single JSON object', () => {
    const doc = parseReviewOutput(JSON.stringify({
      title: 'T',
      overview: 'O',
      blocks: [{ type: 'move', ply: 2, san: 'e5', text: '对称。' }],
    }));
    expect(doc.title).toBe('T');
    expect(doc.blocks[0]).toMatchObject({ type: 'move', ply: 2, san: 'e5' });
  });

  it('ignores incomplete JSON while streaming', () => {
    const doc = parseReviewOutput('{"title":"半');
    expect(doc.title).toBe('');
    expect(doc.blocks).toEqual([]);
  });

  it('strips fences', () => {
    const doc = parseReviewOutput('```json\n{"title":"A","overview":"B"}\n```');
    expect(doc.title).toBe('A');
    expect(doc.overview).toBe('B');
  });
});

describe('ensureMoveBlocks', () => {
  it('fills missing plies with short stubs', () => {
    const moves = skeletonMoves(START_FEN, ['e4', 'e5', 'Nf3']);
    const doc = parseReviewOutput('{"title":"t","overview":"o"}\n{"type":"move","ply":1,"san":"e4","text":"中心。"}');
    const filled = ensureMoveBlocks(doc, moves, 'zh');
    expect(filled.blocks.filter((b) => b.type === 'move')).toHaveLength(3);
    expect(lastCoveredPly(filled)).toBe(3);
  });
});

describe('mergeExpandedBlocks', () => {
  it('inserts a variation after the matching move and keeps a longer comment', () => {
    const base = parseReviewOutput(
      '{"type":"move","ply":1,"san":"e4","text":"短。"}\n{"type":"diagram","ply":1,"caption":"图1"}',
    );
    const extra = parseReviewOutput(
      '{"type":"move","ply":1,"san":"e4","text":"更长的解说，说明计划。"}\n{"type":"variation","ply":1,"intro":"如果1.d4","lines":[{"label":"1","moves":"d4 d5","text":"后兵。"}]}',
    );
    const merged = mergeExpandedBlocks(base, extra);
    expect(merged.blocks.map((b) => b.type)).toEqual(['move', 'diagram', 'variation']);
    expect(merged.blocks[0]).toMatchObject({ type: 'move', text: '更长的解说，说明计划。' });
    expect(merged.blocks[2]).toMatchObject({ type: 'variation', ply: 1 });
  });
});

describe('mergeReviewDocuments', () => {
  it('appends later plies without duplicating earlier moves', () => {
    const a = parseReviewOutput('{"type":"move","ply":1,"san":"e4","text":"a"}');
    const b = parseReviewOutput('{"type":"move","ply":1,"san":"e4","text":"dup"}\n{"type":"move","ply":2,"san":"e5","text":"b"}');
    const merged = mergeReviewDocuments(a, b);
    const moves = merged.blocks.filter((bl) => bl.type === 'move');
    expect(moves).toHaveLength(2);
    expect(moves[1]).toMatchObject({ ply: 2, text: 'b' });
  });
});

describe('formatMoveHeading', () => {
  it('uses 1. and 1... from the start', () => {
    expect(formatMoveHeading(START_FEN, 1, 'e4', '')).toBe('1.e4');
    expect(formatMoveHeading(START_FEN, 2, 'e5', '')).toBe('1...e5');
    expect(formatMoveHeading(START_FEN, 3, 'Nf3', '!')).toBe('2.Nf3!');
  });
});

describe('titleFromHeaders', () => {
  it('prefers player names', () => {
    expect(titleFromHeaders({ White: 'A', Black: 'B' }, 'x')).toBe('A vs B');
  });
});

describe('markKeyMoves', () => {
  it('marks blunders and large swings, not quiet opening moves', () => {
    const moves = [
      move({ ply: 1, san: 'e4', quality: 'best', evalBefore: 20, evalAfter: 25 }),
      move({ ply: 2, san: 'e5', quality: 'good', evalBefore: 25, evalAfter: 20, side: 'b' }),
      move({ ply: 16, san: 'Qxf7', quality: 'blunder', evalBefore: 40, evalAfter: -400, bestSan: 'Nf3' }),
    ];
    const marked = markKeyMoves(moves, 4);
    expect(marked[0].key).toBe(false);
    expect(marked[2].key).toBe(true);
  });
});
