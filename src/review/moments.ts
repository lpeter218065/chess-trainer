import type { AnnotatedMove, Nag } from './types';
import type { Quality } from '../chess/quality';

export function nagFromQuality(quality: Quality): Nag {
  if (quality === 'inaccuracy') return '?!';
  if (quality === 'mistake') return '?';
  if (quality === 'blunder') return '??';
  return '';
}

function moverDrop(move: AnnotatedMove): number {
  const delta = move.evalAfter - move.evalBefore;
  return move.side === 'w' ? -delta : delta;
}

function keyScore(move: AnnotatedMove): number {
  const swing = Math.abs(move.evalAfter - move.evalBefore);
  let score = swing;
  if (move.quality === 'blunder') score += 250;
  else if (move.quality === 'mistake') score += 150;
  else if (move.quality === 'inaccuracy') score += 60;
  if (move.bestUci && move.bestUci !== move.uci) score += 15;
  if (moverDrop(move) >= 80) score += 40;
  return score;
}

const OPENING_PLY = 6;
const MIN_SCORE = 55;

/** 给关键着法打标：优先大起大落与失误，开局安静着法默认不标。 */
export function markKeyMoves(moves: AnnotatedMove[], maxKeys = 12): AnnotatedMove[] {
  const scored = moves.map((move, index) => ({ index, move, score: keyScore(move) }));
  const eligible = scored.filter(({ move, score }) => {
    if (move.quality === 'blunder' || move.quality === 'mistake') return true;
    if (move.ply <= OPENING_PLY && move.quality !== 'inaccuracy') return score >= 180;
    return score >= MIN_SCORE;
  });
  eligible.sort((a, b) => b.score - a.score);
  const picked = new Set(eligible.slice(0, maxKeys).map((item) => item.index));
  return moves.map((move, index) => ({ ...move, key: picked.has(index) }));
}
