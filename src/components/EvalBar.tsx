import { formatEval } from '../chess/notation';

export function EvalBar({ cp, playerIsWhite }: { cp: number; playerIsWhite: boolean }) {
  // cp 为用户视角；条形图以白方视角显示
  const whiteCp = playerIsWhite ? cp : -cp;
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  const whitePct = 50 + (clamped / 1000) * 50;
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-neutral-100 transition-all" style={{ width: `${whitePct}%` }} />
      </div>
      <span className="w-16 text-right font-mono text-sm">{formatEval(cp)}</span>
    </div>
  );
}
