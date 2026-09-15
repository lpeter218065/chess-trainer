import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { useShallow } from 'zustand/react/shallow';
import type { BoardAnnotations } from '../chess/annotations';
import { ARROW_COLORS } from '../chess/annotations';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { EMPTY_TAP, tapMoveReducer, type TapState } from '../chess/tapMove';
import { isIncrementalFen, sideToMove } from '../chess/notation';
import { squaresForTheme } from '../chess/boardTheme';
import { piecesForSet } from '../chess/pieceSet';
import { useSettings } from '../store/settings';
import { useT } from '../i18n';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  interactive: boolean;
  annotations: BoardAnnotations | null;
  hintArrow: { from: string; to: string } | null;
  hoverFocus: CommentaryFocus | null;
  lastMove: { from: string; to: string } | null;
  onMove(from: string, to: string, promotion?: string): Promise<boolean> | boolean;
  onBackgroundTap?: () => void;
}

function tapInputs(fen: string): {
  legalMoves: { from: string; to: string; promotion?: string }[];
  ownPieceSquares: Set<string>;
} {
  const chess = new Chess(fen);
  const turn = chess.turn();
  const legalMoves = chess.moves({ verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
  }));
  const ownPieceSquares = new Set<string>();
  for (const row of chess.board()) {
    for (const p of row) {
      if (p && p.color === turn) ownPieceSquares.add(p.square as Square);
    }
  }
  return { legalMoves, ownPieceSquares };
}

function BoardImpl({
  fen,
  orientation,
  interactive,
  annotations,
  hintArrow,
  hoverFocus,
  lastMove,
  onMove,
  onBackgroundTap,
}: BoardProps) {
  const t = useT();
  const { pieceSet, pieceColor, boardTheme } = useSettings(
    useShallow((s) => ({ pieceSet: s.pieceSet, pieceColor: s.pieceColor, boardTheme: s.boardTheme })),
  );
  const theme = squaresForTheme(boardTheme);
  const pieces = useMemo(() => piecesForSet(pieceSet, pieceColor), [pieceSet, pieceColor]);
  const [tap, setTap] = useState<TapState>(EMPTY_TAP);
  const lastTapRef = useRef<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const prevFenRef = useRef<string>('');
  const [side, setSide] = useState(0);
  const { legalMoves, ownPieceSquares } = useMemo(() => tapInputs(fen), [fen]);
  const boardAria = useMemo(() => {
    const side = sideToMove(fen) === 'w' ? t('home.playWhite') : t('home.playBlack');
    const view = orientation === 'white' ? t('board.whiteView') : t('board.blackView');
    return t('board.trainerSurface', { side, view });
  }, [fen, orientation, t]);

  // 仅当本次 fen 相对上一次为「单步」变化时才动画（回退/跳步/变着一次动多子会点选错位）。
  // prevFenRef 在 commit 后更新，故渲染期读到的是上一帧已提交的 fen。
  const showAnimations = isIncrementalFen(prevFenRef.current, fen);
  useEffect(() => {
    prevFenRef.current = fen;
  }, [fen]);

  useEffect(() => {
    setTap(EMPTY_TAP);
  }, [fen, interactive]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const box = el.parentElement ?? el;
    const measure = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      const next = Math.floor(Math.min(w || h, h || w));
      setSide((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const tryMove = useCallback((from: string, to: string) => {
    const legal = legalMoves.find((m) => m.from === from && m.to === to);
    if (!legal) return false;
    setTap(EMPTY_TAP);
    void onMove(from, to, legal.promotion ? 'q' : undefined);
    return true;
  }, [legalMoves, onMove]);

  const applyTap = useCallback((square: string) => {
    if (lastTapRef.current === square) return;
    lastTapRef.current = square;
    queueMicrotask(() => {
      lastTapRef.current = null;
    });
    onBackgroundTap?.();
    const result = tapMoveReducer(tap, square, legalMoves, ownPieceSquares, interactive);
    setTap(result.state);
    if (result.kind === 'move') {
      void onMove(result.from, result.to, result.promotion);
    }
  }, [legalMoves, ownPieceSquares, interactive, onBackgroundTap, onMove, tap]);

  const squareStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = {};
    for (const sq of annotations?.squares ?? []) {
      s[sq.square] = { backgroundColor: sq.color };
    }
    for (const sq of hoverFocus?.squares ?? []) {
      s[sq] = { backgroundColor: theme.hover };
    }
    if (lastMove) {
      s[lastMove.from] = { backgroundColor: theme.lastFrom };
      s[lastMove.to] = { backgroundColor: theme.lastTo };
    }
    if (tap.selected) {
      s[tap.selected] = { backgroundColor: theme.select };
    }
    for (const to of tap.targets) {
      s[to] = { ...(s[to] ?? {}), backgroundImage: theme.target };
    }
    return s;
  }, [annotations, hoverFocus, lastMove, tap, theme]);

  const arrows = useMemo(() => {
    const list = [...(annotations?.arrows ?? [])];
    if (hintArrow) {
      list.push({ ...hintArrow, color: ARROW_COLORS.hint });
    }
    for (const a of hoverFocus?.arrows ?? []) {
      list.push({ from: a.from, to: a.to, color: theme.hoverArrow });
    }
    return list.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color }));
  }, [annotations, hintArrow, hoverFocus, theme]);

  const onPieceDrop = useCallback(({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!interactive || !targetSquare) return false;
    return tryMove(sourceSquare, targetSquare);
  }, [interactive, tryMove]);

  const options = useMemo(() => ({
    id: 'trainer-board',
    position: fen,
    pieces,
    boardOrientation: orientation,
    allowDragging: interactive,
    dragActivationDistance: 8,
    // 回退会一次改很多子；默认动画期间内部格子仍是旧局面，点选/拖动会对不上。
    // 故仅在本次为单步变化时开启动画。
    showAnimations,
    canDragPiece: ({ square }: { square: string | null }) => {
      if (!interactive || !square) return false;
      return ownPieceSquares.has(square);
    },
    squareStyles,
    lightSquareStyle: { backgroundColor: theme.light },
    darkSquareStyle: { backgroundColor: theme.dark },
    boardStyle: side > 0 ? { width: side, height: side } : { width: '100%', height: '100%' },
    arrows,
    onPieceDrop,
    onPieceDrag: () => {
      setTap(EMPTY_TAP);
    },
    onPieceClick: ({ square }: { square: string | null }) => {
      if (!square) return;
      applyTap(square);
    },
    onSquareClick: ({ square }: { square: string }) => {
      applyTap(square);
    },
  }), [fen, orientation, interactive, ownPieceSquares, squareStyles, arrows, onPieceDrop, applyTap, side, showAnimations, pieces, theme]);

  return (
    <div
      ref={hostRef}
      className="chess-board-surface flex h-full min-h-0 w-full items-center justify-center"
      data-selected={tap.selected ?? ''}
      role="group"
      aria-label={boardAria}
    >
      {side > 0 && (
        <div
          className="chess-board-frame"
          style={{ width: side, height: side }}
        >
          <Chessboard options={options} />
        </div>
      )}
    </div>
  );
}

export const Board = memo(BoardImpl);
