import { AnnotatedCommentary, type CommentaryFocusMode } from './AnnotatedCommentary';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { useT } from '../i18n';

export function AssessmentPanel({
  side,
  text,
  streaming,
  error,
  onSide,
  onFocus,
  focusMode = 'hover',
  activeFocus = null,
  onRetry,
}: {
  side: 'w' | 'b';
  text: string;
  streaming: boolean;
  error?: string | null;
  onSide: (side: 'w' | 'b') => void;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode?: CommentaryFocusMode;
  activeFocus?: CommentaryFocus | null;
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-line bg-cream/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-walnut">{t('assess.title')}</h3>
        <div className="flex gap-1" role="group" aria-label={t('assess.view')}>
          {([['w', t('assess.white')], ['b', t('assess.black')]] as const).map(([c, label]) => (
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
        placeholder={error ? '' : t('assess.empty')}
        onFocus={onFocus}
        showHoverHint={text.length > 0 && !streaming}
        focusMode={focusMode}
        activeFocus={activeFocus}
      />
      {error && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-danger" role="alert">
          <span className="min-w-0 flex-1">{error}</span>
          {onRetry && <button type="button" className="btn btn-sm shrink-0" onClick={onRetry}>{t('assess.retry')}</button>}
        </div>
      )}
    </section>
  );
}
