import { useId, useState, type FocusEvent } from 'react';
import { AnnotatedCommentary, type CommentaryFocusMode } from './AnnotatedCommentary';
import { FOLLOW_UP_CHIPS, type FollowUpTurn } from '../llm/prompts';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { useViewportClass } from '../platform';

export function FollowUpComposer({
  disabled,
  error,
  onAsk,
}: {
  disabled?: boolean;
  error?: string | null;
  onAsk: (question: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const inputId = useId();
  const compact = useViewportClass() === 'compact';
  const busy = disabled;
  const showChips = !compact || editing;

  const send = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setDraft('');
    onAsk(text);
  };

  const onComposerBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setEditing(false);
  };

  return (
    <div
      className="follow-up-composer"
      data-compact={compact}
      onFocus={() => setEditing(true)}
      onBlur={onComposerBlur}
    >
      <div className="follow-up-chips" hidden={!showChips}>
        {FOLLOW_UP_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={busy}
            className="follow-up-chip btn btn-sm shrink-0 whitespace-nowrap"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => send(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">继续问教练</label>
        <input
          id={inputId}
          className="field min-w-0 flex-1"
          placeholder="继续问教练…"
          autoComplete="off"
          autoCorrect="off"
          value={draft}
          disabled={busy}
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button
          type="button"
          className="follow-up-send btn btn-primary shrink-0"
          disabled={busy || !draft.trim()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => send(draft)}
        >
          发送
        </button>
      </div>
      {error && <p className="follow-up-error mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function FollowUpChat({
  turns,
  streaming,
  streamingText,
  disabled,
  error,
  onAsk,
  onFocus,
  focusMode = 'hover',
  activeFocus = null,
  hideComposer = false,
}: {
  turns: FollowUpTurn[];
  streaming: boolean;
  streamingText?: string;
  disabled?: boolean;
  error?: string | null;
  onAsk: (question: string) => void;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode?: CommentaryFocusMode;
  activeFocus?: CommentaryFocus | null;
  hideComposer?: boolean;
}) {
  const busy = disabled || streaming;
  const focusProps = { onFocus, focusMode, activeFocus };
  if (hideComposer && turns.length === 0 && !streaming) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-semibold text-muted">继续追问</h3>
      <div className="mb-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'rounded-xl bg-cream px-3 py-2 text-sm' : 'px-1'}>
            {t.role === 'user' ? (
              <p className="text-ink">{t.content}</p>
            ) : (
              <AnnotatedCommentary text={t.content} streaming={false} showHoverHint={false} {...focusProps} />
            )}
          </div>
        ))}
        {streaming && (
          <div className="px-1">
            <AnnotatedCommentary text={streamingText ?? ''} streaming placeholder="思考中…" showHoverHint={false} {...focusProps} />
          </div>
        )}
      </div>
      {turns.length === 0 && !streaming && (
        <p className="mb-2 text-xs text-muted">可以追问细节。{focusMode === 'tap' ? '点' : '悬停'}回答里带标记的句子，棋盘会标出对应格子。</p>
      )}
      {!hideComposer && <FollowUpComposer disabled={busy} error={error} onAsk={onAsk} />}
    </div>
  );
}
