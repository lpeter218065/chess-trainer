import { Chess } from 'chess.js';
import { START_FEN } from '../chess/pgn';
import { moveNumberPrefix } from './document';
import type { AnnotatedGame, AnnotatedMove, ReviewDocument, VariationLine } from './types';

export interface PgnSideline {
  sans: string[];
  comment?: string;
  children: PgnSideline[];
}

const HEADER_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'] as const;
const MAX_SIDELINES = 4;
const MAX_LINE_PLIES = 10;

function tokenizeSanLine(raw: string): string[] {
  const stripped = raw.replace(/\{[^}]*\}/g, ' ');
  return stripped
    .split(/\s+/)
    .map((tok) => tok.replace(/^[(\[]+|[\])]+$/g, ''))
    .map((tok) => tok.replace(/^\d+\.+(?:\.\.)?/, ''))
    .map((tok) => tok.replace(/[?!]+$/g, ''))
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 0 && tok !== '...' && tok !== '..');
}

export function playSans(fen: string, sans: string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  const tokens = tokenizeSanLine(sans.join(' '));
  for (const san of tokens.slice(0, MAX_LINE_PLIES)) {
    try {
      const move = chess.move(san, { strict: false });
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

function fenAfterSans(fen: string, sans: string[]): string {
  const chess = new Chess(fen);
  for (const san of sans) {
    try {
      chess.move(san, { strict: false });
    } catch {
      break;
    }
  }
  return chess.fen();
}

function pgnComment(text: string | undefined, max = 140): string {
  if (!text) return '';
  const t = text.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const cut = t.length > max ? `${t.slice(0, max - 1)}…` : t;
  return `{${cut}}`;
}

function numberedSan(startFen: string, ply: number, san: string, nag = ''): string {
  return `${moveNumberPrefix(startFen, ply)} ${san}${nag}`;
}

function sidelineKey(sans: string[]): string {
  return sans.slice(0, 3).join(' ');
}

function lineToSideline(fen: string, line: VariationLine): PgnSideline | null {
  const sans = playSans(fen, tokenizeSanLine(line.moves));
  if (sans.length === 0) return null;
  const after = fenAfterSans(fen, sans);
  const children: PgnSideline[] = [];
  for (const child of line.children ?? []) {
    const nested = lineToSideline(after, child) ?? lineToSideline(fen, child);
    if (nested) children.push(nested);
  }
  return { sans, comment: line.text || undefined, children };
}

function collectAtPly(move: AnnotatedMove, doc: ReviewDocument | null): PgnSideline[] {
  const found: PgnSideline[] = [];
  const seen = new Set<string>([move.san]);

  const push = (side: PgnSideline | null) => {
    if (!side || side.sans.length === 0) return;
    if (side.sans[0] === move.san) return;
    const key = sidelineKey(side.sans);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(side);
  };

  for (const pv of move.pvSans) {
    const sans = playSans(move.fenBefore, pv);
    push({ sans, children: [] });
  }

  if (doc) {
    for (const block of doc.blocks) {
      if (block.type !== 'variation' || block.ply !== move.ply) continue;
      for (const line of block.lines) {
        push(lineToSideline(move.fenBefore, line));
      }
    }
  }

  return found.slice(0, MAX_SIDELINES);
}

function emitSideline(startFen: string, fen: string, startPly: number, side: PgnSideline): string {
  const parts: string[] = [];
  const played: string[] = [];
  for (let i = 0; i < side.sans.length; i++) {
    const bit = numberedSan(startFen, startPly + i, side.sans[i]);
    parts.push(i === side.sans.length - 1 && side.comment ? `${bit} ${pgnComment(side.comment)}` : bit);
    played.push(side.sans[i]);
  }
  const after = fenAfterSans(fen, played);
  for (const child of side.children) {
    parts.push(`(${emitSideline(startFen, after, startPly + played.length, child)})`);
  }
  return parts.join(' ');
}

function formatHeaders(headers: Record<string, string>, startFen: string): string {
  const merged: Record<string, string> = { ...headers };
  if (!merged.Annotator) merged.Annotator = '国际象棋训练';
  const lines: string[] = [];
  const used = new Set<string>();
  for (const key of HEADER_ORDER) {
    const value = merged[key];
    if (value == null || value === '') continue;
    lines.push(`[${key} "${value.replace(/"/g, '')}"]`);
    used.add(key);
  }
  for (const [key, value] of Object.entries(merged)) {
    if (used.has(key) || key === 'FEN' || key === 'SetUp') continue;
    if (!value) continue;
    lines.push(`[${key} "${value.replace(/"/g, '')}"]`);
  }
  if (startFen !== START_FEN) {
    lines.push(`[SetUp "1"]`);
    lines.push(`[FEN "${startFen}"]`);
  }
  return lines.join('\n');
}

function commentsByPly(doc: ReviewDocument | null): Map<number, string> {
  const map = new Map<number, string>();
  if (!doc) return map;
  for (const block of doc.blocks) {
    if (block.type === 'move' && block.text) map.set(block.ply, block.text);
  }
  return map;
}

/** 把主线、引擎 PV 与复盘变化写成带括号变例的 PGN。 */
export function buildAnnotatedPgn(game: AnnotatedGame, doc: ReviewDocument | null): string {
  const comments = commentsByPly(doc);
  const body: string[] = [];
  if (doc?.overview) {
    const overview = pgnComment(doc.overview, 280);
    if (overview) body.push(overview);
  }

  const tokens: string[] = [];
  for (const move of game.moves) {
    const nag = move.nag || (comments.has(move.ply) ? '' : '');
    let piece = numberedSan(game.startFen, move.ply, move.san, nag);
    const comment = pgnComment(comments.get(move.ply));
    if (comment) piece = `${piece} ${comment}`;
    tokens.push(piece);
    const sides = collectAtPly(move, doc);
    for (const side of sides) {
      tokens.push(`(${emitSideline(game.startFen, move.fenBefore, move.ply, side)})`);
    }
  }

  const result = game.headers.Result && game.headers.Result !== '?' ? game.headers.Result : '*';
  if (tokens.length) body.push(`${tokens.join(' ')} ${result}`);
  else body.push(result);

  const head = formatHeaders(game.headers, game.startFen);
  return `${head}\n\n${body.join('\n\n')}\n`;
}

export function sidelinesForMove(move: AnnotatedMove, doc: ReviewDocument | null): PgnSideline[] {
  return collectAtPly(move, doc);
}
