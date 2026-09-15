export const PIECE_COLOR_IDS = ['standard', 'walnut', 'brass', 'contrast'] as const;
export type PieceColorId = (typeof PIECE_COLOR_IDS)[number];

export interface PieceTint {
  whiteFill: string;
  blackFill: string;
  whiteStroke: string;
  blackStroke: string;
}

const TINTS: Record<PieceColorId, PieceTint> = {
  standard: {
    whiteFill: '#ffffff',
    blackFill: '#1a1410',
    whiteStroke: '#1a1410',
    blackStroke: '#1a1410',
  },
  walnut: {
    whiteFill: '#faf6ef',
    blackFill: '#3d291e',
    whiteStroke: '#3d291e',
    blackStroke: '#9a7b45',
  },
  brass: {
    whiteFill: '#f7f0e6',
    blackFill: '#6b4e24',
    whiteStroke: '#3d291e',
    blackStroke: '#1a1410',
  },
  contrast: {
    whiteFill: '#fffdf8',
    blackFill: '#111111',
    whiteStroke: '#111111',
    blackStroke: '#faf6ef',
  },
};

export function parsePieceColor(id: unknown): PieceColorId {
  return PIECE_COLOR_IDS.includes(id as PieceColorId) ? (id as PieceColorId) : 'standard';
}

export function tintForColor(id: PieceColorId): PieceTint {
  return TINTS[id];
}

export function pieceSetUsesTint(pieceSet: string): boolean {
  return pieceSet === 'classic' || pieceSet === 'walnut' || pieceSet === 'letter';
}
