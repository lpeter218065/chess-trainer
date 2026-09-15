import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  applyOpponent,
  answerFollowUp,
  canAskCoach,
  completeAfterAsk,
  gradeFollowUp,
  islandByLevelId,
  levelById,
  revealTell,
  scoreStars,
  startSail,
  tryPlayerMove,
  type Coach,
  type RecognizeLevel,
  type SailLevel,
  type SailPlay,
} from '../campaign';
import { SQUARE_COLORS, type BoardAnnotations } from '../chess/annotations';
import { Board } from '../components/Board';
import { CampaignAsk } from '../components/campaign/CampaignAsk';
import { CoachPanel, OptionButton } from '../components/campaign/CoachPanel';
import { Stars } from '../components/campaign/Stars';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { NavBack } from '../components/layout/NavBack';
import { useCampaign } from '../store/campaign';
import { localizeContent, useLocale, useT } from '../i18n';

function highlightsOf(squares: string[]): BoardAnnotations {
  return {
    arrows: [],
    squares: squares.map((square) => ({ square, color: SQUARE_COLORS.focus })),
  };
}

export function CampaignLevelPage() {
  const { id } = useParams();
  const t = useT();
  const locale = useLocale();
  const source = levelById(decodeURIComponent(id ?? ''));
  const level = useMemo(() => (source ? localizeContent(source, locale) : source), [source, locale]);
  if (!source || !level) {
    return (
      <div className="page-shell">
        <NavBack to="/campaign">{t('campaign.isles')}</NavBack>
        <p className="mt-6 text-sm text-muted">{t('campaign.missing')}</p>
      </div>
    );
  }
  const island = islandByLevelId(source.id);
  const mapTo = island ? `/campaign/${island.id}` : '/campaign';
  if (level.kind === 'recognize' && source.kind === 'recognize') {
    return <RecognizePlay key={level.id} level={level} source={source} mapTo={mapTo} />;
  }
  if (level.kind !== 'recognize' && source.kind !== 'recognize') {
    return <SailPlayView key={level.id} level={level} source={source} mapTo={mapTo} />;
  }
  return null;
}

function RecognizePlay({ level, source, mapTo }: { level: RecognizeLevel; source: RecognizeLevel; mapTo: string }) {
  const t = useT();
  const locale = useLocale();
  const recordLevel = useCampaign((s) => s.recordLevel);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [hoverFocus, setHoverFocus] = useState<CommentaryFocus | null>(null);
  const [retries, setRetries] = useState(0);
  const [followUpMiss, setFollowUpMiss] = useState(0);
  const [done, setDone] = useState(false);
  const [pendingFollow, setPendingFollow] = useState(false);

  useEffect(() => {
    setHoverFocus(null);
  }, [coach]);

  const replay = () => {
    setCoach(null);
    setHoverFocus(null);
    setRetries(0);
    setFollowUpMiss(0);
    setDone(false);
    setPendingFollow(false);
  };

  const finish = (miss: number, retried: number, extraSay?: string) => {
    const stars = scoreStars({ retries: retried, hints: 0, followUpMiss: miss });
    recordLevel(level.id, stars, source.ideaCard);
    setDone(true);
    const card = t('campaign.rememberCard', { card: level.ideaCard });
    setCoach({
      tone: 'done',
      say: extraSay ? `${extraSay} ${card}` : card,
      remember: level.ideaCard,
      highlights: level.highlights,
    });
    setPendingFollow(false);
  };

  const pickAnswer = (id: string) => {
    const opt = level.options.find((o) => o.id === id);
    if (!opt) return;
    if (!opt.correct) {
      setRetries((n) => n + 1);
      setCoach({
        tone: 'retry',
        say: t('campaign.retryCenter'),
        highlights: level.highlights,
      });
      return;
    }
    if (level.followUp) {
      setCoach({
        tone: 'ok',
        say: level.explain,
        highlights: level.highlights,
        followUp: level.followUp,
      });
      setPendingFollow(true);
      return;
    }
    finish(0, retries, level.explain);
  };

  const pickFollow = (id: string) => {
    if (!level.followUp) return;
    const ok = gradeFollowUp(level.followUp, id);
    const miss = followUpMiss + (ok ? 0 : 1);
    setFollowUpMiss(miss);
    finish(miss, retries, ok ? level.followUp.explainOk : level.followUp.explainBad);
  };

  const showAsk = Boolean(coach && canAskCoach(coach));

  return (
    <LevelShell
      title={level.title}
      kind={t('campaign.kind.recognize')}
      mapTo={mapTo}
      docked={showAsk || done}
      board={
        <Board
          fen={level.fen}
          orientation={level.orientation}
          interactive={false}
          annotations={highlightsOf(coach?.highlights ?? level.highlights)}
          hintArrow={null}
          hoverFocus={hoverFocus}
          lastMove={level.lastMove}
          onMove={() => false}
        />
      }
    >
      <div className="mt-4">
        {!coach && (
          <>
            <p className="campaign-prompt text-sm font-medium leading-relaxed text-ink">{level.question}</p>
            <div className="mt-3 flex flex-col gap-2">
              {level.options.map((o) => (
                <OptionButton
                  key={o.id}
                  id={o.id}
                  label={o.label}
                  onPick={pickAnswer}
                  onHover={setHoverFocus}
                />
              ))}
            </div>
          </>
        )}
        {coach && (
          <CoachPanel
            coach={coach}
            onPick={pendingFollow ? pickFollow : undefined}
            onHover={setHoverFocus}
            onContinue={done ? undefined : coach.tone === 'retry' && !pendingFollow ? () => setCoach(null) : undefined}
            continueLabel={t('campaign.pickAgain')}
          />
        )}
        {(showAsk || done) && (
          <div className="campaign-dock">
            {showAsk && coach && (
              <CampaignAsk
                seed={{
                  islandTitle: localizeContent(islandByLevelId(level.id)?.title ?? '', locale),
                  levelTitle: level.title,
                  ideaCard: level.ideaCard,
                  levelQuestion: level.question,
                  coachSay: coach.say,
                  fen: level.fen,
                  historySan: [],
                  lastSan: null,
                }}
                onFocus={setHoverFocus}
                activeFocus={hoverFocus}
              />
            )}
            {done && (
              <DoneBar
                mapTo={mapTo}
                stars={scoreStars({ retries, hints: 0, followUpMiss })}
                onReplay={replay}
              />
            )}
          </div>
        )}
      </div>
    </LevelShell>
  );
}

function SailPlayView({ level, source, mapTo }: { level: SailLevel; source: SailLevel; mapTo: string }) {
  const t = useT();
  const locale = useLocale();
  const [params] = useSearchParams();
  const rawDeviate = params.get('deviate');
  const deviate = rawDeviate === '1' ? true : rawDeviate && rawDeviate !== '0' ? rawDeviate : undefined;
  const recordLevel = useCampaign((s) => s.recordLevel);
  const [hoverFocus, setHoverFocus] = useState<CommentaryFocus | null>(null);
  const [play, setPlay] = useState<SailPlay>(() => startSail(level));

  useEffect(() => {
    setPlay(startSail(level));
  }, [level, deviate]);

  useEffect(() => {
    setHoverFocus(null);
  }, [play.coach]);

  const annotations = useMemo(
    () => highlightsOf(play.coach?.highlights ?? []),
    [play.coach],
  );

  const onMove = (from: string, to: string) => {
    const next = tryPlayerMove(play, level, from, to);
    setPlay(next);
    return next.fen !== play.fen;
  };

  const afterFollow = (pick: string) => {
    if (!play.coach?.followUp) return;
    const { play: next, ok } = answerFollowUp(play, play.coach.followUp, pick);
    if (next.punish) {
      setPlay(next);
      if (next.waiting === 'done') recordLevel(level.id, scoreStars(next), source.ideaCard);
      return;
    }
    if (play.offBook && !play.pendingReply) {
      const done = completeAfterAsk(next, level);
      setPlay(done);
      recordLevel(level.id, scoreStars(done), source.ideaCard);
      return;
    }
    if (!next.pendingReply && next.waiting === 'oppAsk') {
      const replied = applyOpponent({ ...next, pendingReply: true, waiting: 'oppAsk' }, level, deviate);
      setPlay(replied);
      if (replied.waiting === 'done') recordLevel(level.id, scoreStars(replied), source.ideaCard);
      return;
    }
    setPlay(next);
    if (next.waiting === 'done') recordLevel(level.id, scoreStars(next), source.ideaCard);
    void ok;
  };

  const continueAfterCoach = () => {
    if (play.offBook && play.waiting === 'oppAsk' && !play.coach?.followUp) {
      const done = completeAfterAsk(play, level);
      setPlay(done);
      recordLevel(level.id, scoreStars(done), source.ideaCard);
      return;
    }
    if (play.pendingReply && (play.waiting === 'oppAsk' || play.waiting === 'followUp')) {
      const replied = applyOpponent(play, level, deviate);
      setPlay(replied);
      if (replied.waiting === 'done' && !replied.coach?.followUp) {
        recordLevel(level.id, scoreStars(replied), source.ideaCard);
      }
      return;
    }
    if (play.waiting === 'done') return;
    if (play.coach?.tone === 'retry') {
      setPlay({ ...play, coach: play.coach.showTellMe ? play.coach : { ...play.coach, say: play.coach.say } });
    }
  };

  useEffect(() => {
    if (play.waiting === 'oppAsk' && play.pendingReply && !play.coach?.followUp) {
      const t = window.setTimeout(() => {
        const replied = applyOpponent(play, level, deviate);
        setPlay(replied);
        if (replied.waiting === 'done' && !replied.coach?.followUp) {
          recordLevel(level.id, scoreStars(replied), source.ideaCard);
        }
      }, 700);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [play, level, deviate, recordLevel]);

  const turn = new Chess(play.fen).turn();
  const yourTurn = play.waiting === 'move' && turn === level.playerColor;
  const showAsk =
    Boolean(play.coach) &&
    canAskCoach(play.coach) &&
    !(play.pendingReply && play.waiting === 'oppAsk' && !play.coach?.followUp);

  return (
    <LevelShell
      title={level.title}
      kind={level.kind === 'boss' ? t('campaign.kind.boss') : t('campaign.kind.sail')}
      mapTo={mapTo}
      docked={showAsk || play.waiting === 'done'}
      board={
        <Board
          fen={play.fen}
          orientation={level.orientation}
          interactive={yourTurn}
          annotations={annotations}
          hintArrow={null}
          hoverFocus={hoverFocus}
          lastMove={play.lastMove}
          onMove={onMove}
        />
      }
    >
      <p className="campaign-turn mt-2 text-xs text-muted">
        {play.punish && play.waiting === 'move'
          ? t('campaign.deviateSoft')
          : yourTurn
            ? t('campaign.yourTurn')
            : play.waiting === 'done'
              ? t('campaign.levelDone')
              : t('campaign.look')}
      </p>
      {play.coach && (
        <div className="mt-3">
          <CoachPanel
            coach={play.coach}
            onPick={play.coach.followUp ? afterFollow : undefined}
            onHover={setHoverFocus}
            onTellMe={play.coach.showTellMe ? () => setPlay(revealTell(play, level)) : undefined}
            onContinue={
              play.coach.followUp
                ? undefined
                : play.waiting === 'done'
                  ? undefined
                  : play.pendingReply || play.waiting === 'oppAsk'
                    ? continueAfterCoach
                    : play.coach.tone === 'retry'
                      ? () => setPlay({ ...play, coach: { ...play.coach!, showTellMe: play.coach!.showTellMe, followUp: undefined } })
                      : undefined
            }
            continueLabel={play.pendingReply ? t('campaign.nextMove') : t('campaign.ok')}
          />
        </div>
      )}
      {(showAsk || play.waiting === 'done') && (
        <div className="campaign-dock">
          {showAsk && play.coach && (
            <CampaignAsk
              seed={{
                islandTitle: localizeContent(islandByLevelId(level.id)?.title ?? '', locale),
                levelTitle: level.title,
                ideaCard: play.coach.remember ?? level.ideaCard,
                coachSay: play.coach.say,
                fen: play.fen,
                historySan: play.historySan,
                lastSan: play.lastSan,
              }}
              onFocus={setHoverFocus}
              activeFocus={hoverFocus}
            />
          )}
          {play.waiting === 'done' && (
            <DoneBar mapTo={mapTo} stars={scoreStars(play)} onReplay={() => setPlay(startSail(level))} />
          )}
        </div>
      )}
    </LevelShell>
  );
}

function LevelShell({
  title,
  kind,
  mapTo,
  board,
  children,
  docked = false,
}: {
  title: string;
  kind: string;
  mapTo: string;
  board: ReactNode;
  children: ReactNode;
  docked?: boolean;
}) {
  const t = useT();
  return (
    <div className={`page-shell campaign-level${docked ? ' campaign-level-docked' : ''}`}>
      <header className="campaign-level-header">
        <NavBack to={mapTo}>{t('campaign.map')}</NavBack>
        <p className="campaign-level-kind">{kind}</p>
        <h1 className="page-title campaign-level-title">{title}</h1>
      </header>
      <div className="campaign-stage">
        <div className="campaign-board">
          <div className="campaign-board-well">{board}</div>
        </div>
        <div className="campaign-side">{children}</div>
      </div>
    </div>
  );
}

function DoneBar({
  mapTo,
  stars,
  onReplay,
}: {
  mapTo: string;
  stars: number;
  onReplay: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brass/40 bg-cream/70 p-3.5 shadow-xs">
      <div className="flex items-center gap-2.5">
        <Stars n={stars} />
        <span className="text-xs font-semibold text-walnut">
          {stars === 3 ? t('home.cleanDone') : t('home.done')}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-sm text-xs" onClick={onReplay}>
          {t('campaign.playAgain')}
        </button>
        <Link className="btn btn-primary btn-sm text-xs" to={mapTo}>
          {t('campaign.backToMap')}
        </Link>
      </div>
    </div>
  );
}
