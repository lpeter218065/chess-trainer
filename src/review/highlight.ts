import { ARROW_COLORS, SQUARE_COLORS, annotationsFromFocus, mergeAnnotations, type BoardAnnotations } from '../chess/annotations';
import { focusFromText } from '../chess/commentaryMarkers';
import { uciToSquares } from '../chess/notation';
import { playLine } from './pgnExport';
import type { AnnotatedMove, ReviewBlock, VariationLine } from './types';

const MAX_VARIATION_ARROWS = 3;

function firstMoveArrow(fen: string, moves: string, color: string): BoardAnnotations | null {
  const played = playLine(fen, moves);
  if (!played.lastMove && played.sans.length === 0) return null;
  const step = playLine(fen, played.sans[0] ?? moves);
  if (!step.lastMove) return null;
  const { from, to } = step.lastMove;
  return {
    arrows: [{ from, to, color }],
    squares: [
      { square: from, color: SQUARE_COLORS.candidateTo },
      { square: to, color: SQUARE_COLORS.candidateTo },
    ],
  };
}

function collectVariationMoves(lines: VariationLine[], out: string[]) {
  for (const line of lines) {
    if (line.moves) out.push(line.moves);
    if (line.children) collectVariationMoves(line.children, out);
  }
}

/** 当前步的主着、更佳着、变化首着，以及讲解里的 {{e2-e4}} 标记。 */
export function annotationsFromReviewPly(move: AnnotatedMove | null, blocks: ReviewBlock[]): BoardAnnotations {
  if (!move) return { arrows: [], squares: [] };
  const parts: BoardAnnotations[] = [{
    arrows: [{ from: move.from, to: move.to, color: ARROW_COLORS.user }],
    squares: [
      { square: move.from, color: SQUARE_COLORS.userFrom },
      { square: move.to, color: SQUARE_COLORS.userTo },
    ],
  }];

  if (move.bestUci && move.bestUci !== move.uci) {
    const { from, to } = uciToSquares(move.bestUci);
    parts.push({
      arrows: [{ from, to, color: ARROW_COLORS.best }],
      squares: [
        { square: from, color: SQUARE_COLORS.bestFrom },
        { square: to, color: SQUARE_COLORS.bestTo },
      ],
    });
  }

  const varMoves: string[] = [];
  for (const block of blocks) {
    if (block.type === 'move' || block.type === 'paragraph') {
      parts.push(annotationsFromFocus(focusFromText(block.text)));
    }
    if (block.type === 'variation') {
      if (block.intro) parts.push(annotationsFromFocus(focusFromText(block.intro)));
      collectVariationMoves(block.lines, varMoves);
    }
  }

  let added = 0;
  for (const raw of varMoves) {
    if (added >= MAX_VARIATION_ARROWS) break;
    const ann = firstMoveArrow(move.fenBefore, raw, added === 0 ? ARROW_COLORS.candidate : ARROW_COLORS.candidate2);
    if (!ann) continue;
    if (ann.arrows[0]?.from === move.from && ann.arrows[0]?.to === move.to) continue;
    parts.push(ann);
    added += 1;
  }

  return mergeAnnotations(...parts);
}

export function focusFromVariationLine(fen: string, moves: string) {
  const played = playLine(fen, moves.split(/\s+/)[0] ?? moves);
  if (!played.lastMove) return null;
  const { from, to } = played.lastMove;
  return { squares: [from, to], arrows: [{ from, to }] };
}
