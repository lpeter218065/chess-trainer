import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { AnnotatedCommentary, type CommentaryFocusMode } from './AnnotatedCommentary';
import type { FollowUpTurn } from '../llm/prompts';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { useViewportClass } from '../platform';
import { getSharedSpeechPort, type SpeechPort } from '../speech/recognition';
import { htmlLang, useLocale, useT } from '../i18n';

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="follow-up-mic-icon">
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 11a5 5 0 0 0 10 0M12 16v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FollowUpComposer({
  disabled,
  error,
  onAsk,
  chips,
  placeholder,
  speechPort,
  alwaysShowChips = false,
}: {
  disabled?: boolean;
  error?: string | null;
  onAsk: (question: string) => void;
  chips?: readonly string[];
  placeholder?: string;
  speechPort?: SpeechPort;
  alwaysShowChips?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [listening, setListening] = useState(false);
  const t = useT();
  const locale = useLocale();
  const placeholderText = placeholder ?? t('chat.followPlaceholder');
  const chipList = chips ?? [t('chat.chip.plan'), t('chat.chip.weak'), t('chat.chip.second'), t('chat.chip.piece')];
  const [speechError, setSpeechError] = useState<string | null>(null);
  const portRef = useRef<SpeechPort | null>(speechPort ?? null);
  const inputId = useId();
  const compact = useViewportClass() === 'compact';
  const busy = disabled;
  const showChips = alwaysShowChips || !compact || editing;

  useEffect(() => {
    let cancelled = false;
    const ready = speechPort ? Promise.resolve(speechPort) : getSharedSpeechPort();
    void ready.then(async (port) => {
      const ok = await port.available();
      if (cancelled) return;
      portRef.current = port;
      setMicOn(ok);
    });
    return () => {
      cancelled = true;
      void portRef.current?.stop();
    };
  }, [speechPort]);

  useEffect(() => {
    if (busy && listening) {
      void portRef.current?.stop();
      setListening(false);
    }
  }, [busy, listening]);

  const send = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    void portRef.current?.stop();
    setListening(false);
    setDraft('');
    onAsk(text);
  };

  const toggleMic = async () => {
    if (busy || !micOn) return;
    const port = portRef.current;
    if (!port) return;
    if (listening) {
      await port.stop();
      setListening(false);
      return;
    }
    setSpeechError(null);
    setListening(true);
    try {
      await port.start({
        onPartial: (text) => setDraft(text),
        onFinal: (text) => setDraft(text),
        onError: (message) => {
          setSpeechError(message);
          setListening(false);
        },
        onEnd: () => setListening(false),
      });
    } catch (e) {
      setListening(false);
      setSpeechError((e as Error).message || t('speech.fail'));
    }
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
        {chipList.map((chip) => (
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
      {listening && (
        <p className="follow-up-listen" role="status">
          {t('speech.listening')}
        </p>
      )}
      <div className="follow-up-row flex gap-2">
        <label htmlFor={inputId} className="sr-only">{listening ? t('speech.listeningShort') : placeholderText}</label>
        <input
          id={inputId}
          className="field min-w-0 flex-1"
          placeholder={listening ? t('speech.listeningPlaceholder') : placeholderText}
          autoComplete="off"
          autoCorrect="off"
          lang={htmlLang(locale)}
          inputMode="text"
          enterKeyHint="send"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        {micOn && (
          <button
            type="button"
            className="follow-up-mic btn shrink-0"
            aria-label={listening ? t('speech.stop') : t('speech.start')}
            aria-pressed={listening}
            data-listening={listening ? 'true' : undefined}
            disabled={busy}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void toggleMic()}
          >
            <MicIcon />
          </button>
        )}
        <button
          type="button"
          className="follow-up-send btn btn-primary shrink-0"
          disabled={busy || !draft.trim()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => send(draft)}
        >
          {t('chat.send')}
        </button>
      </div>
      {(speechError || error) && (
        <p className="follow-up-error mt-1 text-xs text-danger" role="alert">
          {speechError || error}
        </p>
      )}
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
  heading,
  chips,
  placeholder,
  emptyHint,
  alwaysShowChips = false,
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
  heading?: string;
  chips?: readonly string[];
  placeholder?: string;
  emptyHint?: string;
  alwaysShowChips?: boolean;
}) {
  const tx = useT();
  const busy = disabled || streaming;
  const focusProps = { onFocus, focusMode, activeFocus };
  const title = heading ?? tx('chat.followHeading');
  if (hideComposer && turns.length === 0 && !streaming) return null;

  return (
    <div className="follow-up-chat mt-3 border-t border-line pt-3">
      <h3 className="follow-up-heading mb-2 text-xs font-semibold text-muted">{title}</h3>
      <div className="follow-up-thread mb-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
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
            <AnnotatedCommentary text={streamingText ?? ''} streaming placeholder={tx('chat.thinking')} showHoverHint={false} {...focusProps} />
          </div>
        )}
      </div>
      {turns.length === 0 && !streaming && (
        <p className="mb-2 text-xs text-muted">
          {emptyHint ?? (focusMode === 'tap' ? tx('chat.emptyTap') : tx('chat.emptyHover'))}
        </p>
      )}
      {!hideComposer && (
        <FollowUpComposer
          disabled={busy}
          error={error}
          onAsk={onAsk}
          chips={chips}
          placeholder={placeholder}
          alwaysShowChips={alwaysShowChips}
        />
      )}
    </div>
  );
}
