import { Chess, type Piece, type Square } from 'chess.js';
import type { Color } from '../lessons/schema';
import type { FeatureId } from '../lessons/principles';

const FILES = 'abcdefgh';
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

interface Side {
  pawnsByFile: number[]; // 每列兵数
  pawnSquares: { file: number; rank: number }[]; // rank 1..8
  bishops: number; knights: number; rooks: number; queens: number;
  kingFile: number;
  material: number;
}

function scan(chess: Chess): Record<Color, Side> {
  const mk = (): Side => ({ pawnsByFile: Array(8).fill(0), pawnSquares: [], bishops: 0, knights: 0, rooks: 0, queens: 0, kingFile: 4, material: 0 });
  const sides: Record<Color, Side> = { w: mk(), b: mk() };
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p: Piece | null = board[r][f] as Piece | null;
      if (!p) continue;
      const s = sides[p.color];
      s.material += VALUE[p.type];
      const rank = 8 - r;
      switch (p.type) {
        case 'p': s.pawnsByFile[f]++; s.pawnSquares.push({ file: f, rank }); break;
        case 'b': s.bishops++; break;
        case 'n': s.knights++; break;
        case 'r': s.rooks++; break;
        case 'q': s.queens++; break;
        case 'k': s.kingFile = f; break;
      }
    }
  }
  return sides;
}

function hasIsolated(s: Side): boolean {
  return s.pawnsByFile.some((n, f) => n > 0 && (f === 0 || s.pawnsByFile[f - 1] === 0) && (f === 7 || s.pawnsByFile[f + 1] === 0));
}
function hasDoubled(s: Side): boolean {
  return s.pawnsByFile.some((n) => n > 1);
}
function hasPassed(own: Side, opp: Side, color: Color): boolean {
  return own.pawnSquares.some(({ file, rank }) =>
    !opp.pawnSquares.some((o) => Math.abs(o.file - file) <= 1 && (color === 'w' ? o.rank > rank : o.rank < rank)),
  );
}
/** 王是否“已易位或躲到角落”：王在 a-c 或 f-h 列 */
function kingTucked(s: Side): boolean {
  return s.kingFile <= 2 || s.kingFile >= 5;
}

export function extractFeatures(fen: string, perspective: Color): FeatureId[] {
  const chess = new Chess(fen);
  const sides = scan(chess);
  const own = sides[perspective];
  const opp = sides[perspective === 'w' ? 'b' : 'w'];
  const out: FeatureId[] = [];

  const minors = own.bishops + own.knights + opp.bishops + opp.knights;
  const majors = own.rooks + own.queens + opp.rooks + opp.queens;
  const totalPieces = minors + majors;
  const queensOn = own.queens + opp.queens;
  const fullMove = Number(fen.split(' ')[5] ?? '1');

  const rights = fen.split(' ')[2] ?? '-';
  if (totalPieces <= 6 || (queensOn === 0 && totalPieces <= 8)) out.push('endgame-phase');
  else if (fullMove <= 12 && totalPieces >= 12 && rights !== '-') out.push('opening-phase');
  else out.push('middlegame-phase');

  // castling rights 仍在 或 王在 d/e 列 → 视为未易位
  const ownRights = perspective === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights);
  const oppRights = perspective === 'w' ? /[kq]/.test(rights) : /[KQ]/.test(rights);
  if (!out.includes('endgame-phase')) {
    if (ownRights || !kingTucked(own)) out.push('own-king-uncastled');
    if (oppRights || !kingTucked(opp)) out.push('opp-king-uncastled');
    if (kingTucked(own) && kingTucked(opp) && (own.kingFile <= 2) !== (opp.kingFile <= 2)) out.push('opposite-castling');
  }

  if (queensOn === 0) out.push('queens-off');
  if (own.pawnsByFile.some((n, f) => n === 0 && opp.pawnsByFile[f] === 0)) out.push('open-file');
  if (hasIsolated(own)) out.push('own-isolated-pawn');
  if (hasIsolated(opp)) out.push('opp-isolated-pawn');
  if (hasDoubled(own)) out.push('own-doubled-pawn');
  if (hasDoubled(opp)) out.push('opp-doubled-pawn');
  if (hasPassed(own, opp, perspective)) out.push('own-passed-pawn');
  if (hasPassed(opp, own, perspective === 'w' ? 'b' : 'w')) out.push('opp-passed-pawn');
  if (own.bishops >= 2 && opp.bishops < 2) out.push('own-bishop-pair');
  if (opp.bishops >= 2 && own.bishops < 2) out.push('opp-bishop-pair');
  if ((own.bishops > 0 && own.knights === 0 && opp.knights > 0 && opp.bishops === 0) ||
      (opp.bishops > 0 && opp.knights === 0 && own.knights > 0 && own.bishops === 0)) out.push('bishop-vs-knight');
  if (out.includes('endgame-phase') && minors === 0 && own.queens + opp.queens === 0) {
    if (majors === 0) out.push('pawn-endgame');
    else out.push('rook-endgame');
  }
  // 中心锁死：d4/e5 或 e4/d5 兵链互顶
  const at = (sq: string) => chess.get(sq as Square);
  const locked = (a: string, b: string, c: string, d: string) =>
    at(a)?.type === 'p' && at(b)?.type === 'p' && at(a)?.color !== at(b)?.color && at(c)?.type === 'p' && at(d)?.type === 'p';
  if (locked('d4', 'd5', 'e5', 'e6') || locked('e4', 'e5', 'd5', 'd6')) out.push('locked-center');
  const diff = own.material - opp.material;
  if (diff >= 2) out.push('material-up');
  if (diff <= -2) out.push('material-down');
  return out;
}

export { FILES };
