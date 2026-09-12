import { Chess, type Color, type Square } from 'chess.js';

const FILES = 'abcdefgh';
const MAX_SQUARES = 3;

export interface SquareThemes {
  strongWhite: string[];
  strongBlack: string[];
  weakWhite: string[];
  weakBlack: string[];
}

interface Pawn {
  file: number;
  rank: number;
}

function squareName(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}`;
}

function collectPawns(chess: Chess): Record<Color, Pawn[]> {
  const pawns: Record<Color, Pawn[]> = { w: [], b: [] };
  for (let rank = 1; rank <= 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const name = squareName(file, rank) as Square;
      const piece = chess.get(name);
      if (piece?.type === 'p') pawns[piece.color].push({ file, rank });
    }
  }
  return pawns;
}

/** 该色兵能否走到斜吃这个格子（当前或推进后），即能否用兵保护/驱赶 */
function canPawnDefend(pawns: Pawn[], color: Color, file: number, rank: number): boolean {
  return pawns.some((pawn) => (
    Math.abs(pawn.file - file) === 1
    && (color === 'w' ? pawn.rank < rank : pawn.rank > rank)
  ));
}

function currentPawnAttacks(pawns: Pawn[], color: Color): Set<string> {
  const attacks = new Set<string>();
  for (const pawn of pawns) {
    const nextRank = color === 'w' ? pawn.rank + 1 : pawn.rank - 1;
    const left = squareName(pawn.file - 1, nextRank);
    const right = squareName(pawn.file + 1, nextRank);
    if (left) attacks.add(left);
    if (right) attacks.add(right);
  }
  return attacks;
}

function centrality(square: string): number {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return -Math.abs(file - 3.5) * 10 - Math.abs(rank - 4.5);
}

function pick(squares: string[]): string[] {
  return [...new Set(squares)].sort((a, b) => centrality(b) - centrality(a)).slice(0, MAX_SQUARES);
}

function occupiedByPawn(chess: Chess, square: string): boolean {
  return chess.get(square as Square)?.type === 'p';
}

export function extractSquareThemes(fen: string): SquareThemes {
  const chess = new Chess(fen);
  const pawns = collectPawns(chess);
  const whiteAttacks = currentPawnAttacks(pawns.w, 'w');
  const blackAttacks = currentPawnAttacks(pawns.b, 'b');
  const strongWhite: string[] = [];
  const strongBlack: string[] = [];
  const weakWhite: string[] = [];
  const weakBlack: string[] = [];

  for (let rank = 1; rank <= 8; rank++) {
    for (let file = 1; file <= 6; file++) {
      const name = squareName(file, rank);
      if (!name || occupiedByPawn(chess, name)) continue;

      if (rank >= 4 && rank <= 7 && whiteAttacks.has(name) && !blackAttacks.has(name)) {
        strongWhite.push(name);
      }
      if (rank >= 2 && rank <= 5 && blackAttacks.has(name) && !whiteAttacks.has(name)) {
        strongBlack.push(name);
      }
      if (rank >= 3 && rank <= 5 && !canPawnDefend(pawns.w, 'w', file, rank)) {
        weakWhite.push(name);
      }
      if (rank >= 4 && rank <= 6 && !canPawnDefend(pawns.b, 'b', file, rank)) {
        weakBlack.push(name);
      }
    }
  }

  return {
    strongWhite: pick(strongWhite),
    strongBlack: pick(strongBlack),
    weakWhite: pick(weakWhite),
    weakBlack: pick(weakBlack),
  };
}

function listSquares(squares: string[]): string {
  return squares.length ? squares.join('、') : '无';
}

export function squareThemesPromptBlock(fen: string, sideToMove: Color): string {
  const themes = extractSquareThemes(fen);
  const ownStrong = sideToMove === 'w' ? themes.strongWhite : themes.strongBlack;
  const oppStrong = sideToMove === 'w' ? themes.strongBlack : themes.strongWhite;
  const ownWeak = sideToMove === 'w' ? themes.weakWhite : themes.weakBlack;
  const oppWeak = sideToMove === 'w' ? themes.weakBlack : themes.weakWhite;
  return `局面格子（强格/弱格只能点名这里列出的格子，没有则写「暂无明显」，不要自编格子）：
- 行棋方强格（前哨）：${listSquares(ownStrong)}
- 对方强格：${listSquares(oppStrong)}
- 行棋方弱格（空洞）：${listSquares(ownWeak)}
- 对方弱格：${listSquares(oppWeak)}`;
}
