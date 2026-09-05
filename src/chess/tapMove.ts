export interface TapState {
  selected: string | null;
  targets: string[];
}

export type TapResult =
  | { kind: 'select'; state: TapState }
  | { kind: 'clear'; state: TapState }
  | { kind: 'move'; from: string; to: string; promotion?: 'q'; state: TapState };

export const EMPTY_TAP: TapState = { selected: null, targets: [] };

function targetsFrom(square: string, legalMoves: { from: string; to: string }[]): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const m of legalMoves) {
    if (m.from !== square || seen.has(m.to)) continue;
    seen.add(m.to);
    targets.push(m.to);
  }
  return targets;
}

function select(square: string, legalMoves: { from: string; to: string }[]): TapResult {
  return { kind: 'select', state: { selected: square, targets: targetsFrom(square, legalMoves) } };
}

export function tapMoveReducer(
  state: TapState,
  square: string,
  legalMoves: { from: string; to: string; promotion?: string }[],
  ownPieceSquares: Set<string>,
  interactive = true,
): TapResult {
  if (!interactive) return { kind: 'clear', state: EMPTY_TAP };

  if (state.selected) {
    if (state.targets.includes(square)) {
      const promo = legalMoves.some((m) => m.from === state.selected && m.to === square && m.promotion);
      return {
        kind: 'move',
        from: state.selected,
        to: square,
        ...(promo ? { promotion: 'q' as const } : {}),
        state: EMPTY_TAP,
      };
    }
    if (ownPieceSquares.has(square) && square !== state.selected) {
      return select(square, legalMoves);
    }
    return { kind: 'clear', state: EMPTY_TAP };
  }

  if (ownPieceSquares.has(square)) return select(square, legalMoves);
  return { kind: 'clear', state: EMPTY_TAP };
}
