import type { Locale } from '../i18n/locale';
import { formatEval } from '../chess/notation';
import type { AnnotatedGame, AnnotatedMove, ReviewBlock, ReviewDocument, VariationLine } from './types';

const NAGS = new Set(['', '!', '?', '!!', '??', '!?', '?!']);

function stripFences(raw: string): string {
  const fence = raw.match(/```(?:json|ndjson)?\s*([\s\S]*?)```/i);
  return (fence?.[1] ?? raw).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asPly(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function normalizeVariationLine(value: unknown, depth: number): VariationLine | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const moves = typeof rec.moves === 'string' ? rec.moves.trim() : '';
  const text = typeof rec.text === 'string' ? rec.text.trim() : '';
  if (!moves && !text) return null;
  const line: VariationLine = { moves, text };
  if (typeof rec.label === 'string' && rec.label.trim()) line.label = rec.label.trim();
  if (depth < 3 && Array.isArray(rec.children)) {
    const children = rec.children
      .map((child) => normalizeVariationLine(child, depth + 1))
      .filter((child): child is VariationLine => child !== null);
    if (children.length) line.children = children;
  }
  return line;
}

function normalizeBlock(value: unknown): ReviewBlock | null {
  const rec = asRecord(value);
  if (!rec || typeof rec.type !== 'string') return null;
  if (rec.type === 'paragraph') {
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    if (!text) return null;
    const ply = asPly(rec.ply);
    return ply ? { type: 'paragraph', text, ply } : { type: 'paragraph', text };
  }
  if (rec.type === 'move') {
    const ply = asPly(rec.ply);
    const san = typeof rec.san === 'string' ? rec.san.trim() : '';
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    if (!ply || !san || !text) return null;
    const nag = typeof rec.nag === 'string' && NAGS.has(rec.nag) ? rec.nag : '';
    return { type: 'move', ply, san, nag, text };
  }
  if (rec.type === 'diagram') {
    const ply = asPly(rec.ply);
    if (!ply) return null;
    const caption = typeof rec.caption === 'string' ? rec.caption.trim() : '';
    return caption ? { type: 'diagram', ply, caption } : { type: 'diagram', ply };
  }
  if (rec.type === 'variation') {
    const ply = asPly(rec.ply);
    if (!ply) return null;
    const lines = Array.isArray(rec.lines)
      ? rec.lines.map((line) => normalizeVariationLine(line, 0)).filter((line): line is VariationLine => line !== null)
      : [];
    if (lines.length === 0 && typeof rec.text === 'string' && rec.text.trim()) {
      lines.push({ moves: typeof rec.moves === 'string' ? rec.moves : '', text: rec.text.trim() });
    }
    if (lines.length === 0) return null;
    const intro = typeof rec.intro === 'string' ? rec.intro.trim() : '';
    return intro ? { type: 'variation', ply, intro, lines } : { type: 'variation', ply, lines };
  }
  return null;
}

function takeMeta(rec: Record<string, unknown>, doc: ReviewDocument): boolean {
  let hit = false;
  if (typeof rec.title === 'string') {
    doc.title = rec.title.trim();
    hit = true;
  }
  if (typeof rec.overview === 'string') {
    doc.overview = rec.overview.trim();
    hit = true;
  }
  if (Array.isArray(rec.blocks)) {
    for (const item of rec.blocks) {
      const block = normalizeBlock(item);
      if (block) doc.blocks.push(block);
    }
    hit = true;
  }
  return hit;
}

function emptyDoc(): ReviewDocument {
  return { title: '', overview: '', blocks: [] };
}

function parseNdjson(text: string): ReviewDocument | null {
  const doc = emptyDoc();
  let parsed = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!line.startsWith('{')) {
      if (!parsed) return null;
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = asRecord(value);
    if (!rec) continue;
    parsed = true;
    if (takeMeta(rec, doc)) {
      const block = rec.type ? normalizeBlock(rec) : null;
      if (block) doc.blocks.push(block);
      continue;
    }
    const block = normalizeBlock(rec);
    if (block) doc.blocks.push(block);
  }
  return parsed ? doc : null;
}

function parseObject(text: string): ReviewDocument | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const rec = asRecord(value);
  if (!rec) return null;
  const doc = emptyDoc();
  takeMeta(rec, doc);
  if (!doc.title && !doc.overview && doc.blocks.length === 0) return null;
  return doc;
}

/** 解析模型输出：优先逐行 NDJSON，其次整段 JSON，再退回原文当概述。 */
export function parseReviewOutput(raw: string): ReviewDocument {
  const text = stripFences(raw);
  if (!text) return emptyDoc();
  const nd = parseNdjson(text);
  if (nd && (nd.title || nd.overview || nd.blocks.length > 0)) return nd;
  const obj = parseObject(text);
  if (obj) return obj;
  if (text.includes('{')) return emptyDoc();
  return { title: '', overview: text, blocks: [] };
}

export function stubComment(move: AnnotatedMove, locale: Locale): string {
  if (locale === 'en') {
    if (move.quality === 'best') return 'The right move.';
    if (move.quality === 'good') return 'A solid continuation.';
    if (move.quality === 'inaccuracy') return `Inexact. ${move.bestSan || 'The engine move'} was stronger.`;
    if (move.quality === 'mistake') return `A mistake. Better is ${move.bestSan || 'the engine line'}.`;
    return `A blunder. ${move.bestSan || 'The engine move'} keeps the position.`;
  }
  if (move.quality === 'best') return '正着。';
  if (move.quality === 'good') return '稳妥的续着。';
  if (move.quality === 'inaccuracy') return `不够精确。更好是 ${move.bestSan || '引擎着法'}。`;
  if (move.quality === 'mistake') return `错着。应走 ${move.bestSan || '引擎着法'}。`;
  return `严重失误。应走 ${move.bestSan || '引擎着法'}。`;
}

export function ensureMoveBlocks(doc: ReviewDocument, moves: AnnotatedMove[], locale: Locale): ReviewDocument {
  const have = new Set(doc.blocks.filter((b) => b.type === 'move').map((b) => b.ply));
  const missing = moves
    .filter((m) => !have.has(m.ply))
    .map((m): ReviewBlock => ({
      type: 'move',
      ply: m.ply,
      san: m.san,
      nag: m.nag,
      text: stubComment(m, locale),
    }));
  if (missing.length === 0) return doc;
  return { ...doc, blocks: [...doc.blocks, ...missing] };
}

export function mergeReviewDocuments(base: ReviewDocument, extra: ReviewDocument): ReviewDocument {
  const seenMoves = new Set(base.blocks.filter((b) => b.type === 'move').map((b) => b.ply));
  const blocks = [...base.blocks];
  for (const block of extra.blocks) {
    if (block.type === 'move' && seenMoves.has(block.ply)) continue;
    if (block.type === 'move') seenMoves.add(block.ply);
    blocks.push(block);
  }
  return {
    title: base.title || extra.title,
    overview: base.overview || extra.overview,
    blocks,
  };
}

export function blockPly(block: ReviewBlock): number | null {
  if (block.type === 'paragraph') return block.ply ?? null;
  return block.ply;
}

/** 开局总评与按 ply 分组的逐步解说，供左右联动只显示当前步。 */
export function groupReviewBlocks(blocks: ReviewBlock[]): {
  lead: ReviewBlock[];
  steps: { ply: number; blocks: ReviewBlock[] }[];
} {
  const lead: ReviewBlock[] = [];
  const byPly = new Map<number, ReviewBlock[]>();
  const order: number[] = [];
  let started = false;
  let lastPly = 0;
  const pushStep = (ply: number, block: ReviewBlock) => {
    let list = byPly.get(ply);
    if (!list) {
      list = [];
      byPly.set(ply, list);
      order.push(ply);
    }
    list.push(block);
  };
  for (const block of blocks) {
    const ply = blockPly(block);
    if (!started && block.type === 'paragraph' && (ply == null || ply === 0)) {
      lead.push(block);
      continue;
    }
    if (ply != null && ply > 0) {
      started = true;
      lastPly = ply;
      pushStep(ply, block);
      continue;
    }
    if (lastPly > 0) pushStep(lastPly, block);
    else lead.push(block);
  }
  return { lead, steps: order.map((ply) => ({ ply, blocks: byPly.get(ply) ?? [] })) };
}

export function lastCoveredPly(doc: ReviewDocument): number {
  let max = 0;
  for (const block of doc.blocks) {
    if (block.type === 'move' && block.ply > max) max = block.ply;
  }
  return max;
}

export function moveNumberPrefix(startFen: string, ply: number): string {
  const startNum = Number(startFen.split(' ')[5] ?? '1');
  const blackFirst = startFen.split(' ')[1] === 'b';
  const plyIndex = Math.max(0, ply - 1);
  if (blackFirst) {
    if (plyIndex === 0) return `${startNum}...`;
    const after = plyIndex - 1;
    const fullMove = startNum + 1 + Math.floor(after / 2);
    return after % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
  }
  const fullMove = startNum + Math.floor(plyIndex / 2);
  return plyIndex % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
}

export function formatMoveHeading(startFen: string, ply: number, san: string, nag = ''): string {
  return `${moveNumberPrefix(startFen, ply)}${san}${nag}`;
}

export function formatCompactScore(
  startFen: string,
  moves: { ply: number; san: string; nag?: string }[],
): string {
  return moves.map((m) => `${moveNumberPrefix(startFen, m.ply)} ${m.san}${m.nag ?? ''}`).join('  ');
}

function named(value?: string): string | undefined {
  const v = value?.trim();
  if (!v || v === '?' || v === '*') return undefined;
  return v;
}

export function titleFromHeaders(headers: Record<string, string>, fallback: string): string {
  const white = named(headers.White);
  const black = named(headers.Black);
  if (white && black) return `${white} vs ${black}`;
  const event = named(headers.Event);
  if (event) return event;
  return fallback;
}

function pvField(move: AnnotatedMove): string {
  const listed = move.key ? move.pvSans : move.pvSans.slice(0, 1);
  return listed
    .map((pv, i) => (pv.length ? `PV${i + 1} ${pv.join(' ')}` : ''))
    .filter(Boolean)
    .join(' | ');
}

export function compactGameForPrompt(game: AnnotatedGame): string {
  const headerBits = [
    game.headers.White && game.headers.Black ? `${game.headers.White} vs ${game.headers.Black}` : '',
    game.headers.Event,
    game.headers.Result,
  ].filter(Boolean);
  const lines = game.moves.map((m) => {
    const tag = m.key ? ' KEY' : '';
    const pvs = pvField(m);
    return `${m.ply}. ${m.san}${m.nag} | ${m.quality} | ${formatEval(m.evalBefore)}→${formatEval(m.evalAfter)} | best ${m.bestSan || '—'} | ${pvs || 'PV —'}${tag}`;
  });
  return `Headers: ${headerBits.join(' · ') || '(none)'}
Start FEN: ${game.startFen}
Plies: ${game.moves.length}
Moves:
${lines.join('\n')}`;
}

export function compactKeyPositionsForPrompt(game: AnnotatedGame): string {
  const keys = game.moves.filter((m) => m.key);
  if (keys.length === 0) return '';
  return keys
    .map((m) => {
      const pvs = m.pvSans.map((pv, i) => `PV${i + 1}: ${pv.join(' ')}`).join('\n');
      return `ply ${m.ply} ${m.san}${m.nag} ${m.quality} ${formatEval(m.evalBefore)}→${formatEval(m.evalAfter)}\nFEN: ${m.fenBefore}\n${pvs || '(no PV)'}`;
    })
    .join('\n\n');
}

function blockPlyOf(block: ReviewBlock): number | null {
  if (block.type === 'paragraph') return block.ply ?? null;
  return block.ply;
}

/** 把第二轮「关键变化」插回主复盘：同 ply 的 variation 替换，更长的 move 解说覆盖原文。 */
export function mergeExpandedBlocks(base: ReviewDocument, extra: ReviewDocument): ReviewDocument {
  const blocks = [...base.blocks];
  for (const block of extra.blocks) {
    if (block.type === 'move') {
      const idx = blocks.findIndex((b) => b.type === 'move' && b.ply === block.ply);
      if (idx >= 0 && blocks[idx].type === 'move') {
        const prev = blocks[idx];
        if (block.text.length > prev.text.length) {
          blocks[idx] = { ...prev, text: block.text, nag: block.nag || prev.nag };
        }
      }
      continue;
    }
    if (block.type === 'variation') {
      const kept = blocks.filter((b) => !(b.type === 'variation' && b.ply === block.ply));
      blocks.length = 0;
      blocks.push(...kept);
      let insertAt = blocks.findIndex((b) => b.type === 'move' && b.ply === block.ply);
      if (insertAt < 0) {
        blocks.push(block);
        continue;
      }
      insertAt += 1;
      while (
        insertAt < blocks.length
        && blocks[insertAt].type === 'diagram'
        && blockPlyOf(blocks[insertAt]) === block.ply
      ) {
        insertAt += 1;
      }
      blocks.splice(insertAt, 0, block);
      continue;
    }
    if (block.type === 'diagram') {
      if (blocks.some((b) => b.type === 'diagram' && b.ply === block.ply)) continue;
      const moveIdx = blocks.findIndex((b) => b.type === 'move' && b.ply === block.ply);
      blocks.splice(moveIdx >= 0 ? moveIdx + 1 : blocks.length, 0, block);
    }
  }
  return { ...base, title: base.title || extra.title, overview: base.overview || extra.overview, blocks };
}
