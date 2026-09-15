import { createElement, type CSSProperties, type ReactElement } from 'react';
import { defaultPieces, type PieceRenderObject } from 'react-chessboard';
import { tintForColor, type PieceColorId, type PieceTint } from './pieceColor';

export const PIECE_SET_IDS = ['classic', 'walnut', 'letter', 'spatial', 'fantasy', 'shapes'] as const;
export type PieceSetId = (typeof PIECE_SET_IDS)[number];

const PIECE_SVG_URLS = import.meta.glob('./pieces/*/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const PIECE_KEYS = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] as const;
const LETTER_GLYPH: Record<(typeof PIECE_KEYS)[number], string> = {
  wP: 'P',
  wN: 'N',
  wB: 'B',
  wR: 'R',
  wQ: 'Q',
  wK: 'K',
  bP: 'P',
  bN: 'N',
  bB: 'B',
  bR: 'R',
  bQ: 'Q',
  bK: 'K',
};

type PieceProps = { fill?: string; square?: string; svgStyle?: CSSProperties };

export function parsePieceSet(id: unknown): PieceSetId {
  return PIECE_SET_IDS.includes(id as PieceSetId) ? (id as PieceSetId) : 'classic';
}

function tintPieces(whiteFill: string, blackFill: string): PieceRenderObject {
  const out: PieceRenderObject = {};
  for (const key of PIECE_KEYS) {
    const render = defaultPieces[key];
    if (typeof render !== 'function') continue;
    const fill = key.startsWith('w') ? whiteFill : blackFill;
    out[key] = (props?: PieceProps) => render({ ...props, fill });
  }
  return out;
}

function letterPieces(tint: PieceTint): PieceRenderObject {
  const out: PieceRenderObject = {};
  for (const key of PIECE_KEYS) {
    const white = key.startsWith('w');
    const glyph = LETTER_GLYPH[key];
    const fill = white ? tint.whiteFill : tint.blackFill;
    const stroke = white ? tint.whiteStroke : tint.blackStroke;
    const text = white ? tint.whiteStroke : tint.whiteFill;
    out[key] = (props?: PieceProps): ReactElement =>
      createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 45 45',
          width: '100%',
          height: '100%',
          style: props?.svgStyle,
        },
        createElement('circle', {
          cx: 22.5,
          cy: 22.5,
          r: 17.5,
          fill,
          stroke,
          strokeWidth: 1.8,
        }),
        createElement(
          'text',
          {
            x: 22.5,
            y: 29,
            textAnchor: 'middle',
            fontSize: 18,
            fontWeight: 700,
            fontFamily: 'Avenir Next, PingFang SC, sans-serif',
            fill: text,
          },
          glyph,
        ),
      );
  }
  return out;
}

function urlsForSet(set: 'spatial' | 'fantasy' | 'shapes'): Record<string, string> {
  const prefix = `./pieces/${set}/`;
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(PIECE_SVG_URLS)) {
    if (!path.startsWith(prefix) || !path.endsWith('.svg')) continue;
    const name = path.slice(prefix.length, -'.svg'.length);
    out[name] = url;
  }
  return out;
}

function piecesFromUrls(urls: Record<string, string>): PieceRenderObject {
  const out: PieceRenderObject = {};
  for (const key of PIECE_KEYS) {
    const src = urls[key];
    if (!src) continue;
    out[key] = (props?: PieceProps): ReactElement =>
      createElement('img', {
        src,
        alt: '',
        draggable: false,
        style: { width: '100%', height: '100%', display: 'block', ...props?.svgStyle },
      });
  }
  return out;
}

export function piecesForSet(id: PieceSetId, color: PieceColorId = 'standard'): PieceRenderObject | undefined {
  const tint = tintForColor(id === 'walnut' && color === 'standard' ? 'walnut' : color);
  switch (id) {
    case 'letter':
      return letterPieces(color === 'standard' ? tintForColor('walnut') : tint);
    case 'walnut':
      return tintPieces(tint.whiteFill, tint.blackFill);
    case 'spatial':
    case 'fantasy':
    case 'shapes':
      return piecesFromUrls(urlsForSet(id));
    default:
      if (color === 'standard') return undefined;
      return tintPieces(tint.whiteFill, tint.blackFill);
  }
}
