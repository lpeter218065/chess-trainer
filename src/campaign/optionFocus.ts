import type { CommentaryFocus } from '../chess/commentaryMarkers';

function addSquare(into: Set<string>, raw: string) {
  const sq = raw.toLowerCase();
  if (/^[a-h][1-8]$/.test(sq)) into.add(sq);
}

function collect(text: string, into: Set<string>) {
  for (const m of text.matchAll(/[NBRQK]x?([a-h][1-8])/gi)) addSquare(into, m[1]);
  for (const m of text.matchAll(/[a-h]x([a-h][1-8])/gi)) addSquare(into, m[1]);
  for (const m of text.matchAll(/[a-h][1-8]/gi)) addSquare(into, m[0]);
}

/** 选项划过时，把文案里的格子亮到棋盘上。 */
export function focusFromChoice(id: string, label: string): CommentaryFocus {
  const squares = new Set<string>();
  const arrows: { from: string; to: string }[] = [];
  collect(id, squares);
  collect(label, squares);

  const stare = label.match(/([a-h])\s*兵[^。]*盯\s*([a-h][1-8])/i);
  if (stare) {
    const from = `${stare[1].toLowerCase()}5`;
    const to = stare[2].toLowerCase();
    addSquare(squares, from);
    addSquare(squares, to);
    arrows.push({ from, to });
  }

  return { squares: [...squares].sort(), arrows };
}

export function hasBoardPreview(focus: CommentaryFocus): boolean {
  return focus.squares.length > 0 || focus.arrows.length > 0;
}
