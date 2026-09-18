import { formatEval } from '../chess/notation';
import { useT } from '../i18n';

export function EvalBar({
  cp,
  playerIsWhite,
  ends = 'player',
}: {
  cp: number;
  playerIsWhite: boolean;
  /** player：你/对手；colors：白/黑（复盘） */
  ends?: 'player' | 'colors';
}) {
  // cp 为用户视角；条形图以白方视角显示
  const whiteCp = playerIsWhite ? cp : -cp;
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  const whitePct = 50 + (clamped / 1000) * 50;
  const youOnLeft = playerIsWhite;
  const t = useT();
  const left = ends === 'colors' ? t('assess.white') : youOnLeft ? t('eval.you') : t('eval.opp');
  const right = ends === 'colors' ? t('assess.black') : youOnLeft ? t('eval.opp') : t('eval.you');
  return (
    <div className="flex items-center gap-2" aria-label={t('eval.aria', { eval: formatEval(cp) })}>
      <span className={`shrink-0 text-xs text-muted ${ends === 'colors' ? 'w-10' : 'w-8'}`}>{left}</span>
      <div className="eval-track" aria-hidden="true">
        <div className="eval-fill" style={{ width: `${whitePct}%` }} />
      </div>
      <span className={`shrink-0 text-right text-xs text-muted ${ends === 'colors' ? 'w-10' : 'w-8'}`}>{right}</span>
      <span className="w-16 text-right font-mono text-sm tabular-nums text-ink">{formatEval(cp)}</span>
    </div>
  );
}
