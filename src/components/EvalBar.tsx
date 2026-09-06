import { formatEval } from '../chess/notation';

export function EvalBar({ cp, playerIsWhite }: { cp: number; playerIsWhite: boolean }) {
  // cp 为用户视角；条形图以白方视角显示，两端标注哪端是「你」
  const whiteCp = playerIsWhite ? cp : -cp;
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  const whitePct = 50 + (clamped / 1000) * 50;
  const youOnLeft = playerIsWhite; // 白在左端
  return (
    <div className="flex items-center gap-2" aria-label={`评估 ${formatEval(cp)}（正为你占优）`}>
      <span className="w-8 shrink-0 text-[10px] text-muted">{youOnLeft ? '你' : '对手'}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full border border-ink/20 bg-ink" aria-hidden="true">
        <div className="h-full bg-white transition-all duration-200" style={{ width: `${whitePct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] text-muted">{youOnLeft ? '对手' : '你'}</span>
      <span className="w-16 text-right font-mono text-sm tabular-nums text-ink">{formatEval(cp)}</span>
    </div>
  );
}
