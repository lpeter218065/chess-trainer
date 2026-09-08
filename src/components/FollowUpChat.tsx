import { useId, useState } from 'react';
import { AnnotatedCommentary, type CommentaryFocusMode } from './AnnotatedCommentary';
import { FOLLOW_UP_CHIPS, type FollowUpTurn } from '../llm/prompts';
import type { CommentaryFocus } from '../chess/commentaryMarkers';

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
  const inputId = useId();
  const busy = disabled;

  const send = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setDraft('');
    onAsk(text);
  };

  return (
    <div className="bg-paper/95 px-3 py-2">
      <div className="mb-2 flex gap-1.5 overflow-x-auto overscroll-x-contain">
        {FOLLOW_UP_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={busy}
            className="btn btn-sm shrink-0 whitespace-nowrap rounded-full px-3"
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
          value={draft}
          disabled={busy}
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary shrink-0"
          disabled={busy || !draft.trim()}
          onClick={() => send(draft)}
        >
          发送
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
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

  return (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">继续追问</h3>
      <div className="mb-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'rounded-lg bg-cream/50 px-2.5 py-1.5 text-sm' : 'px-1'}>
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
        <p className="mb-2 text-xs text-muted">可追问细节；{focusMode === 'tap' ? '点击' : '悬停'}回答里带标记的句子可高亮棋盘</p>
      )}
      {!hideComposer && <FollowUpComposer disabled={busy} error={error} onAsk={onAsk} />}
    </div>
  );
}
