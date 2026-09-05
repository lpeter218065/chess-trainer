const SQUARE = '[a-h][1-8]';
const SQUARE_LIST = new RegExp(`^(${SQUARE}(?:,${SQUARE})*)$`);
const ARROW = new RegExp(`^(${SQUARE})-(${SQUARE})$`);

export interface CommentaryFocus {
  squares: string[];
  arrows: { from: string; to: string }[];
}

export function parseMarkerContent(raw: string): CommentaryFocus {
  const squares: string[] = [];
  const arrows: { from: string; to: string }[] = [];
  for (const part of raw.split('|').map((p) => p.trim())) {
    const arrow = part.match(ARROW);
    if (arrow) {
      arrows.push({ from: arrow[1], to: arrow[2] });
      continue;
    }
    const list = part.match(SQUARE_LIST);
    if (list) {
      squares.push(...list[1].split(','));
    }
  }
  return { squares, arrows };
}

/** 提取一段文字中全部 {{...}} 标记的并集（多行局面判断用） */
export function focusFromText(text: string): CommentaryFocus {
  const squares = new Set<string>();
  const arrows: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const f = focusFromLine(line);
    for (const sq of f.squares) squares.add(sq);
    for (const a of f.arrows) {
      const k = `${a.from}-${a.to}`;
      if (seen.has(k)) continue;
      seen.add(k);
      arrows.push(a);
    }
  }
  return { squares: [...squares], arrows };
}

/** 提取一行文字中全部 {{...}} 标记的并集 */
export function focusFromLine(line: string): CommentaryFocus {
  const squares = new Set<string>();
  const arrows: { from: string; to: string }[] = [];
  for (const m of line.matchAll(/\{\{([^}]+)\}\}/g)) {
    const f = parseMarkerContent(m[1]);
    f.squares.forEach((s) => squares.add(s));
    arrows.push(...f.arrows);
  }
  return { squares: [...squares], arrows };
}

/** 去掉 {{...}} 标记，保留可读文本 */
export function stripMarkers(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '').replace(/\s+/g, ' ').trim();
}

export type TextPart =
  | { kind: 'text'; text: string }
  | { kind: 'marker'; text: string; focus: CommentaryFocus };

export function splitAnnotatedText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: 'text', text: text.slice(last, idx) });
    parts.push({ kind: 'marker', text: stripMarkers(m[0]), focus: parseMarkerContent(m[1]) });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
