import { memo, useEffect, useState } from 'react';
import { MiniBoard } from './MiniBoard';
import { fenAfterUciPlies } from '../chess/notation';
import { useViewportSize } from '../platform';
import { trainerLayoutMode } from './layout/TrainerLayout';

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
  fillHeight,
}: {
  baseFen: string;
  line: PvLineData;
  orientation: 'white' | 'black';
  boardId: string;
  /** 宽屏左栏：填满格子高度 */
  fillHeight?: boolean;
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
  const phone = !fillHeight;

  return (
    <div className={`touch-row flex min-h-0 gap-3 rounded-xl border border-line bg-white ${phone ? 'p-3' : 'h-full gap-2 p-2'}`}>
      <div className={fillHeight ? 'flex h-full max-w-[46%] shrink-0 items-center justify-center' : undefined}>
        <MiniBoard
          fen={viewed.fen}
          orientation={orientation}
          lastMove={viewed.lastMove}
          boardId={boardId}
          className={fillHeight ? 'h-full w-full' : 'aspect-square w-[clamp(5rem,24vw,8rem)] shrink-0'}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <div className="min-h-0 overflow-hidden">
          <div className={`mb-0.5 flex items-center gap-2 font-semibold ${phone ? 'text-sm' : 'text-xs'}`}>
            <span>{line.label}</span>
            {line.evalText && <span className="font-mono font-normal text-muted">{line.evalText}</span>}
          </div>
          <p className={`font-mono leading-relaxed text-ink ${phone ? 'text-sm' : 'text-xs leading-snug line-clamp-3'}`}>
            {line.moves.join(' ') || '—'}
          </p>
          <p className={`mt-0.5 text-muted ${phone ? 'text-xs' : 'text-[10px]'}`}>
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
  analyzing,
}: {
  baseFen: string;
  lines: PvLineData[];
  orientation: 'white' | 'black';
  analyzing?: boolean;
}) {
  const { width, height } = useViewportSize();
  const fillHeight = trainerLayoutMode(width, height) === 'wide';
  const shown = lines.slice(0, 3);

  if (shown.length === 0) {
    if (!fillHeight) {
      return (
        <p className="px-1 py-3 text-sm leading-relaxed text-muted">
          {analyzing ? '引擎正在算出候选着法…' : '走子后会出现候选着法'}
        </p>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
            {analyzing ? `PV${n} 分析中…` : `PV${n} · 走子后会出现候选`}
          </div>
        ))}
      </div>
    );
  }

  if (!fillHeight) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        {shown.map((line, i) => (
          <PvLineCard
            key={line.label}
            baseFen={baseFen}
            line={line}
            orientation={orientation}
            boardId={`pv-board-${i}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {shown.map((line, i) => (
        <div key={line.label} className="min-h-0 flex-1">
          <PvLineCard
            baseFen={baseFen}
            line={line}
            orientation={orientation}
            boardId={`pv-board-${i}`}
            fillHeight
          />
        </div>
      ))}
      {shown.length < 3 &&
        Array.from({ length: 3 - shown.length }).map((_, i) => (
          <div key={`empty-${i}`} className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
            等待分析…
          </div>
        ))}
    </div>
  );
}

export const EngineLinesPanel = memo(EngineLinesPanelImpl);
