import { memo, useEffect, useState } from 'react';
import { MiniBoard } from './MiniBoard';
import { fenAfterUciPlies } from '../chess/notation';

export interface PvLineData {
  label: string;
  uci: string[];
  moves: string[];
  /** eval display optional */
  evalText?: string;
}

/** 单条 PV：默认停在第 1 步，不自动连播 */
function PvLineCardImpl({
  baseFen,
  line,
  orientation,
  boardId,
  compact,
}: {
  baseFen: string;
  line: PvLineData;
  orientation: 'white' | 'black';
  boardId: string;
  /** fill parent height (left column slots) */
  compact?: boolean;
}) {
  const maxStep = line.uci.length;
  const [step, setStep] = useState(maxStep > 0 ? 1 : 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setStep(maxStep > 0 ? 1 : 0);
    setPlaying(false);
  }, [baseFen, line.label, line.uci.join(','), maxStep]);

  useEffect(() => {
    if (!playing || maxStep === 0) return;
    const id = setInterval(() => {
      setStep((s) => (s >= maxStep ? 1 : s + 1));
    }, 900);
    return () => clearInterval(id);
  }, [playing, maxStep]);

  const viewed = fenAfterUciPlies(baseFen, line.uci, step);
  const currentSan = step > 0 ? line.moves[step - 1] : null;

  return (
    <div className={`touch-row flex min-h-0 gap-2 rounded-xl border border-line bg-white p-2 ${compact ? 'h-full' : ''}`}>
      {/* 外层限宽；内层量正方形边长，避免棋盘被拉扁 */}
      <div className={compact ? 'flex h-full max-w-[46%] shrink-0 items-center justify-center' : undefined}>
        <MiniBoard
          fen={viewed.fen}
          orientation={orientation}
          lastMove={viewed.lastMove}
          boardId={boardId}
          className={compact ? 'h-full w-full' : undefined}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
        <div className="min-h-0 overflow-hidden">
          <div className="mb-0.5 flex items-center gap-2 text-xs font-semibold">
            <span>{line.label}</span>
            {line.evalText && <span className="font-mono font-normal text-muted">{line.evalText}</span>}
          </div>
          <p className="font-mono text-xs leading-snug text-ink line-clamp-3">{line.moves.join(' ') || '—'}</p>
          <p className="mt-0.5 text-[10px] text-muted">
            {step === 0 ? '起始' : `${step}/${maxStep}${currentSan ? ` · ${currentSan}` : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? '暂停' : '播放'}
          </button>
          <button type="button" className="btn btn-sm" disabled={step <= 0} onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }}>←</button>
          <button type="button" className="btn btn-sm" disabled={step >= maxStep} onClick={() => { setPlaying(false); setStep((s) => Math.min(maxStep, s + 1)); }}>→</button>
          <button type="button" className="btn btn-sm" onClick={() => { setPlaying(false); setStep(maxStep > 0 ? 1 : 0); }}>复位</button>
        </div>
      </div>
    </div>
  );
}

export const PvLineCard = memo(PvLineCardImpl);

function EngineLinesPanelImpl({
  baseFen,
  lines,
  orientation,
}: {
  baseFen: string;
  lines: PvLineData[];
  orientation: 'white' | 'black';
}) {
  if (lines.length === 0) return null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {lines.slice(0, 3).map((line, i) => (
        <div key={line.label} className="min-h-0 flex-1">
          <PvLineCard
            baseFen={baseFen}
            line={line}
            orientation={orientation}
            boardId={`pv-board-${i}`}
            compact
          />
        </div>
      ))}
      {lines.length < 3 &&
        Array.from({ length: 3 - lines.length }).map((_, i) => (
          <div key={`empty-${i}`} className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
            等待分析…
          </div>
        ))}
    </div>
  );
}

export const EngineLinesPanel = memo(EngineLinesPanelImpl);
