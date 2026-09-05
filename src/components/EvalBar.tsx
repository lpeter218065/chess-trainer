import { formatEval } from '../chess/notation';

export function EvalBar({ cp, playerIsWhite }: { cp: number; playerIsWhite: boolean }) {
  // cp 为用户视角；条形图以白方视角显示
  const whiteCp = playerIsWhite ? cp : -cp;
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  const whitePct = 50 + (clamped / 1000) * 50;
  return (
    <div className="flex items-center gap-3" aria-label={`评估 ${formatEval(cp)}`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full border border-ink/20 bg-ink" aria-hidden="true">
        <div className="h-full bg-white transition-all duration-200" style={{ width: `${whitePct}%` }} />
      </div>
      <span className="w-16 text-right font-mono text-sm tabular-nums text-ink">{formatEval(cp)}</span>
    </div>
  );
}
