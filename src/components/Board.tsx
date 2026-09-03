import { useMemo, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  interactive: boolean;
  arrow: { from: string; to: string } | null;
  lastMove: { from: string; to: string } | null;
  onMove(from: string, to: string, promotion?: string): Promise<boolean> | boolean;
}

export function Board({ fen, orientation, interactive, arrow, lastMove, onMove }: BoardProps) {
  const squareStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = {};
    if (lastMove) {
      s[lastMove.from] = { backgroundColor: 'rgba(255, 213, 79, 0.45)' };
      s[lastMove.to] = { backgroundColor: 'rgba(255, 213, 79, 0.65)' };
    }
    return s;
  }, [lastMove]);

  return (
    <Chessboard
      options={{
        id: 'trainer-board',
        position: fen,
        boardOrientation: orientation,
        allowDragging: interactive,
        squareStyles,
        arrows: arrow ? [{ startSquare: arrow.from, endSquare: arrow.to, color: '#2563eb' }] : [],
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!targetSquare) return false;
          // 需要升变时默认升后；chess.js 会拒绝无需升变时带 promotion 的着法，所以先判断
          const chess = new Chess(fen);
          const legal = chess.moves({ verbose: true }).find((m) => m.from === sourceSquare && m.to === targetSquare);
          if (!legal) return false;
          void onMove(sourceSquare, targetSquare, legal.promotion ? 'q' : undefined);
          return true;
        },
      }}
    />
  );
}
