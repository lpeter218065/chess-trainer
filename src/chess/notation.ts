import { Chess } from 'chess.js';
import type { Color } from '../lessons/schema';

export const MATE_CP = 10000;

export function uciToSquares(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export function uciMoveToSan(fen: string, uci: string): string | null {
  const c = new Chess(fen);
  try {
    return c.move(uciToSquares(uci)).san;
  } catch {
    return null;
  }
}

/** 逐步转换一条 UCI 线路为 SAN，遇到非法着法即停止 */
export function uciToSan(fen: string, uciMoves: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves) {
    try {
      out.push(c.move(uciToSquares(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

/** cp（用户视角）→ 显示文本。|cp| 接近 MATE_CP 视为杀棋分 */
export function formatEval(cp: number): string {
  if (cp >= MATE_CP - 1000) return `M${MATE_CP - cp}`;
  if (cp <= -MATE_CP + 1000) return `-M${cp + MATE_CP}`;
  const v = (cp / 100).toFixed(2);
  return cp > 0 ? `+${v}` : v;
}

/** 把“行棋方视角”的分数转换成 perspective 视角 */
export function toPerspective(cpSideToMove: number, sideToMove: Color, perspective: Color): number {
  return sideToMove === perspective ? cpSideToMove : -cpSideToMove;
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}
