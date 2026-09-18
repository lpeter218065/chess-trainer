import type { Quality } from '../chess/quality';

export type Nag = '' | '!' | '?' | '!!' | '??' | '!?' | '?!';

export interface AnnotatedMove {
  ply: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
  side: 'w' | 'b';
  /** 白方视角 cp */
  evalBefore: number;
  evalAfter: number;
  quality: Quality;
  bestSan: string;
  bestUci: string;
  pvSans: string[][];
  key: boolean;
  nag: Nag;
}

export interface AnnotatedGame {
  pgn: string;
  headers: Record<string, string>;
  startFen: string;
  moves: AnnotatedMove[];
}

export interface VariationLine {
  label?: string;
  moves: string;
  text: string;
  children?: VariationLine[];
}

export type ReviewBlock =
  | { type: 'paragraph'; text: string; ply?: number }
  | { type: 'move'; ply: number; san: string; nag?: string; text: string }
  | { type: 'diagram'; ply: number; caption?: string }
  | { type: 'variation'; ply: number; intro?: string; lines: VariationLine[] };

export interface ReviewDocument {
  title: string;
  overview: string;
  blocks: ReviewBlock[];
}

export interface AnnotateProgress {
  done: number;
  total: number;
}
