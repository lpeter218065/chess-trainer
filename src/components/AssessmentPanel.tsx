import { AnnotatedCommentary, type CommentaryFocusMode } from './AnnotatedCommentary';
import type { CommentaryFocus } from '../chess/commentaryMarkers';

export function AssessmentPanel({
  side,
  text,
  streaming,
  error,
  onSide,
  onFocus,
  focusMode = 'hover',
  activeFocus = null,
}: {
  side: 'w' | 'b';
  text: string;
  streaming: boolean;
  error?: string | null;
  onSide: (side: 'w' | 'b') => void;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode?: CommentaryFocusMode;
  activeFocus?: CommentaryFocus | null;
}) {
  return (
    <section className="rounded-xl border border-felt/25 bg-felt-fg/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-felt uppercase">局面判断</h3>
        <div className="flex gap-1" role="group" aria-label="判断视角">
          {([['w', '白棋'], ['b', '黑棋']] as const).map(([c, label]) => (
            <button
              key={c}
              type="button"
              aria-pressed={side === c}
              className={`btn btn-sm ${side === c ? 'btn-on' : 'btn-ghost text-muted'}`}
              onClick={() => onSide(c)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <AnnotatedCommentary
        text={text}
        streaming={streaming}
        placeholder="正在判断计划、方向与战术…"
        onFocus={onFocus}
        showHoverHint={text.length > 0 && !streaming}
        focusMode={focusMode}
        activeFocus={activeFocus}
      />
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
    </section>
  );
}
