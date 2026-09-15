import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { squaresForTheme } from '../chess/boardTheme';
import { piecesForSet } from '../chess/pieceSet';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';

/**
 * 小棋盘：用 ResizeObserver 量出容器内最大正方形边长，
 * 避免 compact 布局下 h-full + max-w 把棋盘拉成非正方形（子力变形）。
 */
function MiniBoardImpl({
  fen,
  orientation,
  lastMove,
  boardId,
  className,
}: {
  fen: string;
  orientation: 'white' | 'black';
  lastMove: { from: string; to: string } | null;
  boardId: string;
  className?: string;
}) {
  const t = useT();
  const pieceSet = useSettings((s) => s.pieceSet);
  const pieceColor = useSettings((s) => s.pieceColor);
  const boardTheme = useSettings((s) => s.boardTheme);
  const theme = squaresForTheme(boardTheme);
  const pieces = useMemo(() => piecesForSet(pieceSet, pieceColor), [pieceSet, pieceColor]);
  const hostRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // 容器若只有一侧有尺寸（如只设了 height），取可用边
      const next = Math.floor(Math.min(w || h, h || w));
      setSide((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const squareStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = {};
    if (lastMove) {
      s[lastMove.from] = { backgroundColor: theme.lastFrom };
      s[lastMove.to] = { backgroundColor: theme.lastTo };
    }
    return s;
  }, [lastMove, theme]);

  const options = useMemo(() => ({
    id: boardId,
    position: fen,
    pieces,
    boardOrientation: orientation,
    allowDragging: false,
    squareStyles,
    lightSquareStyle: { backgroundColor: theme.light },
    darkSquareStyle: { backgroundColor: theme.dark },
    boardStyle: side > 0
      ? { width: side, height: side }
      : { width: '100%', height: '100%' },
    showAnimations: false,
    showNotation: false,
  }), [boardId, fen, orientation, squareStyles, side, pieces, theme]);

  const orientationLabel = orientation === 'white' ? t('board.whiteView') : t('board.blackView');

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={t('board.readonlyMini', { view: orientationLabel })}
      className={`flex items-center justify-center overflow-hidden ${className ?? 'aspect-square w-36 shrink-0'}`}
    >
      {side > 0 ? (
        <div
          aria-hidden="true"
          inert
          className="pointer-events-none shrink-0 overflow-hidden rounded-md"
          style={{ width: side, height: side }}
        >
          <Chessboard options={options} />
        </div>
      ) : null}
    </div>
  );
}

export const MiniBoard = memo(MiniBoardImpl);
