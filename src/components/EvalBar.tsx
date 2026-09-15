import { formatEval } from '../chess/notation';
import { useT } from '../i18n';

export function EvalBar({ cp, playerIsWhite }: { cp: number; playerIsWhite: boolean }) {
  // cp 为用户视角；条形图以白方视角显示，两端标注哪端是「你」
  const whiteCp = playerIsWhite ? cp : -cp;
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  const whitePct = 50 + (clamped / 1000) * 50;
  const youOnLeft = playerIsWhite; // 白在左端
  const t = useT();
  return (
    <div className="flex items-center gap-2" aria-label={t('eval.aria', { eval: formatEval(cp) })}>
      <span className="w-8 shrink-0 text-xs text-muted">{youOnLeft ? t('eval.you') : t('eval.opp')}</span>
      <div className="eval-track" aria-hidden="true">
        <div className="eval-fill" style={{ width: `${whitePct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs text-muted">{youOnLeft ? t('eval.opp') : t('eval.you')}</span>
      <span className="w-16 text-right font-mono text-sm tabular-nums text-ink">{formatEval(cp)}</span>
    </div>
  );
}
