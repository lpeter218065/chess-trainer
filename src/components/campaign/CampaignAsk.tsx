import { useEffect, useRef, useState } from 'react';
import { FollowUpChat } from '../FollowUpChat';
import { SettingsDialog } from '../SettingsDialog';
import { CAMPAIGN_ASK_MAX_TOKENS, buildCampaignAskMessages, type CampaignAskContext } from '../../campaign/ask';
import { settingsLlmPort } from '../../llm/port';
import type { FollowUpTurn } from '../../llm/prompts';
import { createStreamFlusher } from '../../utils/streamFlusher';
import { useSettings } from '../../store/settings';
import { useHasHover } from '../../platform';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';
import { useLocale, useT } from '../../i18n';

type AskSeed = Omit<CampaignAskContext, 'question' | 'turns'>;

export function useCampaignAsk() {
  const [turns, setTurns] = useState<FollowUpTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnsRef = useRef<FollowUpTurn[]>([]);
  turnsRef.current = turns;

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    turnsRef.current = [];
    setTurns([]);
    setStreaming(false);
    setDraft('');
    setError(null);
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = async (seed: AskSeed, question: string) => {
    const q = question.trim();
    if (!q || abortRef.current) return;
    const prior = turnsRef.current;
    const messages = buildCampaignAskMessages({ ...seed, turns: prior, question: q });
    const ac = new AbortController();
    abortRef.current = ac;
    const nextTurns = [...prior, { role: 'user' as const, content: q }];
    turnsRef.current = nextTurns;
    setTurns(nextTurns);
    setStreaming(true);
    setDraft('');
    setError(null);

    const flusher = createStreamFlusher((text) => {
      if (!ac.signal.aborted) setDraft(text);
    });
    try {
      for await (const chunk of settingsLlmPort.stream(messages, {
        temperature: 0.6,
        signal: ac.signal,
        maxTokens: CAMPAIGN_ASK_MAX_TOKENS,
        quick: true,
      })) {
        if (ac.signal.aborted) break;
        flusher.push(chunk);
      }
      if (!ac.signal.aborted) {
        const text = flusher.finish();
        const withReply = [...turnsRef.current, { role: 'assistant' as const, content: text }];
        turnsRef.current = withReply;
        setTurns(withReply);
        setDraft('');
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        setError((e as Error).message);
      }
    } finally {
      flusher.cancel();
      if (abortRef.current === ac) abortRef.current = null;
      setStreaming(false);
    }
  };

  return { turns, streaming, draft, error, submit, reset };
}

export function CampaignAsk({
  seed,
  onFocus,
  activeFocus = null,
}: {
  seed: AskSeed;
  onFocus: (focus: CommentaryFocus | null) => void;
  activeFocus?: CommentaryFocus | null;
}) {
  const t = useT();
  const locale = useLocale();
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ask = useCampaignAsk();
  const hover = useHasHover();
  const chips = [
    t('campaign.chip.detail'),
    t('campaign.chip.intent'),
    t('campaign.chip.square'),
    t('campaign.chip.else'),
  ];

  return (
    <div className="campaign-ask">
      {hasKey ? (
        <FollowUpChat
          heading={t('campaign.askHeading')}
          chips={chips}
          placeholder={t('campaign.askPlaceholder')}
          alwaysShowChips
          emptyHint={hover ? t('campaign.askEmptyHover') : t('campaign.askEmptyTap')}
          turns={ask.turns}
          streaming={ask.streaming}
          streamingText={ask.draft}
          error={ask.error ? t('campaign.askError', { msg: ask.error }) : null}
          onAsk={(question) => void ask.submit({ ...seed, locale }, question)}
          onFocus={onFocus}
          focusMode={hover ? 'hover' : 'tap'}
          activeFocus={activeFocus}
        />
      ) : (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs leading-relaxed text-muted">{t('campaign.needKey')}</p>
          <button type="button" className="btn btn-sm mt-2" onClick={() => setSettingsOpen(true)}>
            {t('home.configure')}
          </button>
        </div>
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
