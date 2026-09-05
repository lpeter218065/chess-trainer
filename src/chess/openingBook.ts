import { Chess } from 'chess.js';
import { START_FEN } from './pgn';

/** 去掉半回合/回合计数，便于开局书按局面查找（含换位） */
export function fenKey(fen: string): string {
  const [board, turn, castle, ep] = fen.split(' ');
  return `${board} ${turn} ${castle} ${ep}`;
}

/** 把 SAN 线路编成 局面 → 候选着法（先出现的是主变） */
export function indexOpeningBook(lines: string[][], startFen = START_FEN): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of lines) {
    const c = new Chess(startFen);
    for (const san of line) {
      const key = fenKey(c.fen());
      const m = c.move(san);
      if (!m) throw new Error(`开局书非法着法 ${san}（在 ${key}）`);
      const list = map.get(key) ?? [];
      if (!list.includes(m.san)) list.push(m.san);
      map.set(key, list);
    }
  }
  return map;
}

const bookCache = new WeakMap<string[][], Map<string, string[]>>();

/** 若当前局面在开局书中，返回主变下一步 SAN；否则 null */
export function pickBookReply(fen: string, lines: string[][], startFen = START_FEN): string | null {
  if (lines.length === 0) return null;
  let index = bookCache.get(lines);
  if (!index) {
    index = indexOpeningBook(lines, startFen);
    bookCache.set(lines, index);
  }
  return index.get(fenKey(fen))?.[0] ?? null;
}
