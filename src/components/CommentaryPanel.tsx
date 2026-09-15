import { useEffect, useState } from 'react';
import type { Round, SessionState } from '../store/session';
import type { Quality } from '../chess/quality';
import { useT } from '../i18n';
import type { ChromeKey } from '../i18n';
import { AnnotatedCommentary, type CommentaryFocusMode } from './AnnotatedCommentary';
import { FollowUpChat } from './FollowUpChat';
import { lessonFollowUpThreadId } from '../llm/prompts';
import type { CommentaryFocus } from '../chess/commentaryMarkers';

const QUALITY_CLASS: Record<Quality, string> = {
  best: 'bg-emerald-600', good: 'bg-green-500', inaccuracy: 'bg-yellow-500', mistake: 'bg-orange-500', blunder: 'bg-red-600',
};

interface Props {
  intro: string;
  rounds: Round[];
  /** -1 = 开场；否则为当前回合 */
  activeRoundIndex: number;
  streaming: string | null;
  llmError: string | null;
  followUps: SessionState['followUps'];
  followUpStreaming: boolean;
  followUpDraft: string;
  followUpError: string | null;
  followUpThreadId: string | null;
  onAskFollowUp: (threadId: string, question: string) => void;
  onSelectRound: (index: number) => void;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode?: CommentaryFocusMode;
  activeFocus?: CommentaryFocus | null;
  hideComposer?: boolean;
  onRetry?: () => void;
}

function roundLabel(r: Round): string {
  return `${r.index + 1}. ${r.userMove.san}${r.engineMove ? ` ${r.engineMove.san}` : ''}`;
}

function previewText(text: string): string {
  return text.replace(/\n/g, ' ').trim().slice(0, 80);
}

export function CommentaryPanel({
  intro,
  rounds,
  activeRoundIndex,
  streaming,
  llmError,
  followUps,
  followUpStreaming,
  followUpDraft,
  followUpError,
  followUpThreadId,
  onAskFollowUp,
  onSelectRound,
  onFocus,
  focusMode = 'hover',
  activeFocus = null,
  hideComposer = false,
  onRetry,
}: Props) {
  const t = useT();
  const [historyOpen, setHistoryOpen] = useState(false);
  const introThread = lessonFollowUpThreadId('intro');
  const activeRound = activeRoundIndex >= 0 ? rounds[activeRoundIndex] : undefined;
  const showingIntro = !activeRound;

  useEffect(() => {
    setHistoryOpen(false);
  }, [activeRoundIndex]);

  const historyItems: { index: number; label: string; preview: string }[] = [];
  if (!showingIntro && (intro.length > 0 || streaming === 'intro')) {
    historyItems.push({ index: -1, label: t('notes.intro'), preview: previewText(intro) });
  }
  for (const r of rounds) {
    if (showingIntro || r.index !== activeRoundIndex) {
      historyItems.push({ index: r.index, label: roundLabel(r), preview: previewText(r.commentary) });
    }
  }

  const showIntroFollowUp = showingIntro && intro.length > 0 && streaming !== 'intro';
  const streamingThisRound = !!activeRound && streaming === 'commentary' && activeRound.index === rounds.length - 1;
  const showRoundFollowUp = !!activeRound && activeRound.commentary.length > 0 && !streamingThisRound;

  return (
    <div className="flex flex-col gap-3">
      {historyItems.length > 0 && (
        <div className="relative">
          <button
            type="button"
            className={`btn btn-sm ${historyOpen ? 'btn-on' : 'text-muted'}`}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            {t('notes.historyCount', { n: historyItems.length })}
          </button>
          {historyOpen && (
            <ul className="menu absolute left-0 right-0 z-10 mt-1.5 max-h-36 py-1">
              {historyItems.map((item) => (
                <li key={item.index}>
                  <button
                    type="button"
                    className="min-h-11 w-full px-3 py-2 text-left text-xs"
                    onClick={() => {
                      onSelectRound(item.index);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="block truncate font-mono text-ink">{item.label}</span>
                    {item.preview && <span className="line-clamp-1 text-muted">{item.preview}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showingIntro && (
        <section className="rounded-xl border border-line p-3">
          <h3 className="mb-1 text-xs font-semibold text-muted">{t('notes.intro')}</h3>
          <AnnotatedCommentary
            text={intro}
            streaming={streaming === 'intro'}
            placeholder={llmError ? '' : t('notes.noIntro')}
            onFocus={onFocus}
            showHoverHint={intro.length > 0 && streaming !== 'intro'}
            focusMode={focusMode}
            activeFocus={activeFocus}
          />
          {showIntroFollowUp && (
            <FollowUpChat
              turns={followUps[introThread] ?? []}
              streaming={followUpStreaming && followUpThreadId === introThread}
              streamingText={followUpDraft}
              disabled={streaming !== null}
              error={followUpError}
              onAsk={(q) => onAskFollowUp(introThread, q)}
              onFocus={onFocus}
              focusMode={focusMode}
              activeFocus={activeFocus}
              hideComposer={hideComposer}
            />
          )}
        </section>
      )}

      {activeRound && (
        <section className="rounded-xl border border-line p-3">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="font-mono text-ink">{roundLabel(activeRound)}</span>
            <span className={`rounded px-1.5 py-0.5 text-white ${QUALITY_CLASS[activeRound.userMove.quality]}`}>
              {t(`quality.${activeRound.userMove.quality}` as ChromeKey)}
            </span>
            <span className="text-muted">{t(`angle.${activeRound.angle}` as ChromeKey)}</span>
          </div>
          <AnnotatedCommentary
            text={activeRound.commentary}
            streaming={streamingThisRound}
            placeholder={llmError ? '' : t('notes.noMove')}
            onFocus={onFocus}
            showHoverHint={activeRound.commentary.length > 0 && !streamingThisRound}
            focusMode={focusMode}
            activeFocus={activeFocus}
          />
          {showRoundFollowUp && (
            <FollowUpChat
              turns={followUps[lessonFollowUpThreadId('round', activeRound.index)] ?? []}
              streaming={followUpStreaming && followUpThreadId === lessonFollowUpThreadId('round', activeRound.index)}
              streamingText={followUpDraft}
              disabled={streaming !== null}
              error={followUpError}
              onAsk={(q) => onAskFollowUp(lessonFollowUpThreadId('round', activeRound.index), q)}
              onFocus={onFocus}
              focusMode={focusMode}
              activeFocus={activeFocus}
              hideComposer={hideComposer}
            />
          )}
        </section>
      )}
      {llmError && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 p-2 text-xs text-danger" role="alert">
          <span className="min-w-0 flex-1">{llmError}</span>
          {onRetry && <button type="button" className="btn btn-sm shrink-0" onClick={onRetry}>{t('assess.retry')}</button>}
        </div>
      )}
    </div>
  );
}
