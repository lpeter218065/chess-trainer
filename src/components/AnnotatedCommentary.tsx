import { useEffect, useRef } from 'react';
import { focusFromLine, stripMarkers, type CommentaryFocus } from '../chess/commentaryMarkers';
import { toggleFocus } from '../chess/commentaryFocus';
import { useT } from '../i18n';

type LineKind = 'summary' | 'bullet' | 'next';
export type CommentaryFocusMode = 'hover' | 'tap';

function classifyLine(line: string): { kind: LineKind; text: string } {
  const t = line.trim();
  if (t.startsWith('•')) return { kind: 'bullet', text: t.slice(1).trim() };
  if (t.startsWith('- ')) return { kind: 'bullet', text: t.slice(2).trim() };
  if (t.startsWith('→')) return { kind: 'next', text: t.slice(1).trim() };
  return { kind: 'summary', text: t };
}

function focusKey(f: CommentaryFocus): string {
  return `${f.squares.slice().sort().join(',')}|${f.arrows.map((a) => `${a.from}-${a.to}`).sort().join(',')}`;
}

function FocusLine({
  text,
  onFocus,
  focusMode,
  activeFocus,
  className,
}: {
  text: string;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode: CommentaryFocusMode;
  activeFocus: CommentaryFocus | null;
  className?: string;
}) {
  const focus = focusFromLine(text);
  const interactive = focus.squares.length > 0 || focus.arrows.length > 0;
  const key = focusKey(focus);
  const sticky = focusMode === 'tap' && activeFocus != null && focusKey(activeFocus) === key;

  const onTap = () => {
    if (!interactive) return;
    const currentKey = activeFocus ? focusKey(activeFocus) : null;
    const next = toggleFocus(currentKey, key);
    onFocus(next === null ? null : focus);
  };

  return (
    <span
      role={interactive && focusMode === 'tap' ? 'button' : undefined}
      tabIndex={interactive && focusMode === 'tap' ? 0 : undefined}
      className={`${className ?? ''} ${interactive ? 'cursor-pointer rounded decoration-brass/50 decoration-dotted underline-offset-2 hover:underline' : ''} ${sticky ? 'border border-walnut bg-cream' : ''}`}
      onMouseEnter={focusMode === 'hover' && interactive ? () => onFocus(focus) : undefined}
      onMouseLeave={focusMode === 'hover' && interactive ? () => onFocus(null) : undefined}
      onClick={focusMode === 'tap' && interactive ? onTap : undefined}
      onKeyDown={focusMode === 'tap' && interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      } : undefined}
    >
      {stripMarkers(text)}
    </span>
  );
}

function StructuredAnnotated({
  text,
  streaming,
  onFocus,
  showHoverHint,
  focusMode,
  activeFocus,
}: {
  text: string;
  streaming: boolean;
  onFocus: (f: CommentaryFocus | null) => void;
  showHoverHint: boolean;
  focusMode: CommentaryFocusMode;
  activeFocus: CommentaryFocus | null;
}) {
  const lines = text.split('\n').map(classifyLine).filter((l) => l.text);
  const summary = lines.filter((l) => l.kind === 'summary').map((l) => l.text);
  const bullets = lines.filter((l) => l.kind === 'bullet');
  const next = lines.filter((l) => l.kind === 'next');
  const t = useT();
  const hintText = focusMode === 'hover' ? t('chat.emptyHover') : t('notes.tapHint');
  const lineProps = { onFocus, focusMode, activeFocus };

  return (
    <div className="text-sm leading-relaxed">
      {summary.length > 0 && (
        <p className="mb-2 font-medium">
          <FocusLine text={summary.join(' ')} {...lineProps} />
        </p>
      )}
      {bullets.length > 0 && (
        <ul className="mb-2 list-none space-y-1.5 pl-0">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 rounded px-1 hover:bg-cream">
              <span className="shrink-0 text-brass">•</span>
              <FocusLine text={b.text} {...lineProps} />
            </li>
          ))}
        </ul>
      )}
      {next.length > 0 && (
        <p className="text-muted">
          <span className="mr-1 text-walnut">→</span>
          <FocusLine text={next.map((n) => n.text).join(' ')} {...lineProps} />
        </p>
      )}
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-walnut align-middle" />}
      {showHoverHint && <p className="mt-2 text-xs text-muted">{hintText}</p>}
    </div>
  );
}

function hasStructuredLines(text: string): boolean {
  return text.split('\n').some((l) => {
    const t = l.trim();
    return t.startsWith('•') || t.startsWith('- ') || t.startsWith('→');
  });
}

export function AnnotatedCommentary({
  text,
  streaming,
  placeholder,
  onFocus,
  showHoverHint = true,
  focusMode = 'hover',
  activeFocus = null,
}: {
  text: string;
  streaming: boolean;
  placeholder?: string;
  onFocus: (f: CommentaryFocus | null) => void;
  showHoverHint?: boolean;
  focusMode?: CommentaryFocusMode;
  activeFocus?: CommentaryFocus | null;
}) {
  const previousTextRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previousText = previousTextRef.current;
    previousTextRef.current = text;
    if (previousText === undefined || !text.startsWith(previousText)) onFocus(null);
  }, [text]);

  if (!text && !streaming) return <p className="text-sm text-muted">{placeholder ?? ''}</p>;
  if (hasStructuredLines(text)) {
    return (
      <StructuredAnnotated
        text={text}
        streaming={streaming}
        onFocus={onFocus}
        showHoverHint={showHoverHint}
        focusMode={focusMode}
        activeFocus={activeFocus}
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      <FocusLine text={text} onFocus={onFocus} focusMode={focusMode} activeFocus={activeFocus} />
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-walnut align-middle" />}
    </p>
  );
}
