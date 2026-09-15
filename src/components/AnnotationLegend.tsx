import { memo } from 'react';
import type { BoardAnnotations } from '../chess/annotations';
import { ARROW_COLORS } from '../chess/annotations';
import { useT } from '../i18n';
import type { ChromeKey } from '../i18n';

const ITEMS: { color: string; key: ChromeKey }[] = [
  { color: ARROW_COLORS.best, key: 'legend.best' },
  { color: ARROW_COLORS.candidate, key: 'legend.candidate' },
  { color: ARROW_COLORS.attack, key: 'legend.attack' },
  { color: ARROW_COLORS.user, key: 'legend.user' },
  { color: ARROW_COLORS.hint, key: 'legend.hint' },
];

function AnnotationLegendImpl({ annotations, showHint }: { annotations: BoardAnnotations | null; showHint: boolean }) {
  const t = useT();
  if (!annotations && !showHint) return null;
  const active = new Set(annotations?.arrows.map((a) => a.color) ?? []);
  if (showHint) active.add(ARROW_COLORS.hint);
  const visible = ITEMS.filter((i) => active.has(i.color));
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {visible.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: i.color }} />
          {t(i.key)}
        </span>
      ))}
    </div>
  );
}

export const AnnotationLegend = memo(AnnotationLegendImpl);
