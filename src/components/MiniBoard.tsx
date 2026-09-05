import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';

/**
 * 小棋盘：用 ResizeObserver 量出容器内最大正方形边长，
 * 避免 compact 布局下 h-full + max-w 把棋盘拉成非正方形（子力变形）。
 */
export function MiniBoard({
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
      s[lastMove.from] = { backgroundColor: 'rgba(255, 213, 79, 0.45)' };
      s[lastMove.to] = { backgroundColor: 'rgba(255, 213, 79, 0.65)' };
    }
    return s;
  }, [lastMove]);

  const options = useMemo(() => ({
    id: boardId,
    position: fen,
    boardOrientation: orientation,
    allowDragging: false,
    squareStyles,
    boardStyle: side > 0
      ? { width: side, height: side }
      : { width: '100%', height: '100%' },
    showAnimations: false,
    showNotation: false,
  }), [boardId, fen, orientation, squareStyles, side]);

  return (
    <div
      ref={hostRef}
      className={`flex items-center justify-center overflow-hidden rounded-md border border-line bg-cream ${className ?? 'aspect-square w-36 shrink-0'}`}
    >
      {side > 0 ? <Chessboard options={options} /> : null}
    </div>
  );
}
