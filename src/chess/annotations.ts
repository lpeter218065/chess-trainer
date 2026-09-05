import type { Analysis } from '../engine/engineService';
import type { Quality } from './quality';
import { uciToSquares } from './notation';
import type { CommentaryFocus } from './commentaryMarkers';

export const ARROW_COLORS = {
  best: '#16a34a',
  candidate: '#3b82f6',
  candidate2: '#8b5cf6',
  user: '#f97316',
  attack: '#ef4444',
  hint: '#2563eb',
} as const;

export const SQUARE_COLORS = {
  bestFrom: 'rgba(34, 197, 94, 0.35)',
  bestTo: 'rgba(34, 197, 94, 0.55)',
  candidateTo: 'rgba(59, 130, 246, 0.4)',
  userFrom: 'rgba(249, 115, 22, 0.45)',
  userTo: 'rgba(249, 115, 22, 0.6)',
  focus: 'rgba(139, 92, 246, 0.38)',
} as const;

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

export interface BoardSquareHighlight {
  square: string;
  color: string;
}

export interface BoardAnnotations {
  arrows: BoardArrow[];
  squares: BoardSquareHighlight[];
}

const ARROW_PALETTE = [ARROW_COLORS.best, ARROW_COLORS.candidate, ARROW_COLORS.candidate2];

function pushArrow(arrows: BoardArrow[], from: string, to: string, color: string) {
  if (arrows.some((a) => a.from === from && a.to === to)) return;
  arrows.push({ from, to, color });
}

function pushSquare(squares: BoardSquareHighlight[], square: string, color: string) {
  const i = squares.findIndex((s) => s.square === square);
  if (i >= 0) squares[i] = { square, color };
  else squares.push({ square, color });
}

/** 用户行棋前：引擎候选着法 + 进攻方向 */
export function annotationsFromAnalysis(analysis: Analysis, maxLines = 3): BoardAnnotations {
  const arrows: BoardArrow[] = [];
  const squares: BoardSquareHighlight[] = [];

  analysis.lines.slice(0, maxLines).forEach((line, i) => {
    const uci = line.pv[0];
    if (!uci) return;
    const { from, to } = uciToSquares(uci);
    pushArrow(arrows, from, to, ARROW_PALETTE[i] ?? ARROW_COLORS.candidate);
    pushSquare(squares, to, i === 0 ? SQUARE_COLORS.bestTo : SQUARE_COLORS.candidateTo);
    if (i === 0) pushSquare(squares, from, SQUARE_COLORS.bestFrom);
  });

  addAttackLine(analysis, arrows, squares);
  return { arrows, squares };
}

/** 用户走子后：对比用户着法、最佳着法、其他候选 */
export function annotationsAfterMove(analysisBefore: Analysis, userUci: string, quality: Quality): BoardAnnotations {
  const arrows: BoardArrow[] = [];
  const squares: BoardSquareHighlight[] = [];
  const user = uciToSquares(userUci);
  const bestUci = analysisBefore.bestMove;
  const best = uciToSquares(bestUci);
  const suboptimal = quality !== 'best' && quality !== 'good';

  if (suboptimal && userUci !== bestUci) {
    pushArrow(arrows, user.from, user.to, ARROW_COLORS.user);
    pushSquare(squares, user.from, SQUARE_COLORS.userFrom);
    pushSquare(squares, user.to, SQUARE_COLORS.userTo);
  }

  if (userUci !== bestUci) {
    pushArrow(arrows, best.from, best.to, ARROW_COLORS.best);
    pushSquare(squares, best.from, SQUARE_COLORS.bestFrom);
    pushSquare(squares, best.to, SQUARE_COLORS.bestTo);
  }

  analysisBefore.lines.slice(1, 3).forEach((line, i) => {
    const uci = line.pv[0];
    if (!uci || uci === bestUci || uci === userUci) return;
    const { from, to } = uciToSquares(uci);
    pushArrow(arrows, from, to, i === 0 ? ARROW_COLORS.candidate : ARROW_COLORS.candidate2);
    pushSquare(squares, to, SQUARE_COLORS.candidateTo);
  });

  addAttackLine(analysisBefore, arrows, squares);
  return { arrows, squares };
}

/** 把讲解里的格子/箭头落到棋盘上（局面判断的计划与战术） */
export function annotationsFromFocus(focus: CommentaryFocus): BoardAnnotations {
  return {
    arrows: focus.arrows.map((a) => ({ from: a.from, to: a.to, color: ARROW_COLORS.hint })),
    squares: focus.squares.map((square) => ({ square, color: SQUARE_COLORS.focus })),
  };
}

export function mergeAnnotations(...parts: Array<BoardAnnotations | null | undefined>): BoardAnnotations {
  const arrows: BoardArrow[] = [];
  const squares: BoardSquareHighlight[] = [];
  for (const p of parts) {
    if (!p) continue;
    for (const a of p.arrows) pushArrow(arrows, a.from, a.to, a.color);
    for (const s of p.squares) pushSquare(squares, s.square, s.color);
  }
  return { arrows, squares };
}

function addAttackLine(analysis: Analysis, arrows: BoardArrow[], squares: BoardSquareHighlight[]) {
  const followUp = analysis.lines[0]?.pv[1];
  if (!followUp) return;
  const { from, to } = uciToSquares(followUp);
  pushArrow(arrows, from, to, ARROW_COLORS.attack);
  pushSquare(squares, to, SQUARE_COLORS.focus);
}

export function roundIndexForPly(ply: number): number {
  return ply >= 1 ? Math.floor((ply - 1) / 2) : -1;
}
