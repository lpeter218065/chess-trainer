import { memo } from 'react';
import type { BoardAnnotations } from '../chess/annotations';
import { ARROW_COLORS } from '../chess/annotations';

const ITEMS = [
  { color: ARROW_COLORS.best, label: '最佳着法' },
  { color: ARROW_COLORS.candidate, label: '候选着法' },
  { color: ARROW_COLORS.attack, label: '进攻方向' },
  { color: ARROW_COLORS.user, label: '你的着法' },
  { color: ARROW_COLORS.hint, label: '计划 / 战术' },
] as const;

function AnnotationLegendImpl({ annotations, showHint }: { annotations: BoardAnnotations | null; showHint: boolean }) {
  if (!annotations && !showHint) return null;
  const active = new Set(annotations?.arrows.map((a) => a.color) ?? []);
  if (showHint) active.add(ARROW_COLORS.hint);
  const visible = ITEMS.filter((i) => active.has(i.color));
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {visible.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const AnnotationLegend = memo(AnnotationLegendImpl);
