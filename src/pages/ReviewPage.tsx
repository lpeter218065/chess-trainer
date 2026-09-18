import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { MoveList } from '../components/MoveList';
import { BoardMoreMenu, BoardStatus, BoardToolbar } from '../components/BoardToolbar';
import { SessionBar } from '../components/SessionBar';
import { TrainerLayout } from '../components/layout/TrainerLayout';
import { NavBack } from '../components/layout/NavBack';
import { originFromState, originLabel, originPath } from '../components/layout/navOrigin';
import { MissingKeyEmpty } from '../components/MissingKeyEmpty';
import { HttpsRequiredNotice } from '../components/SettingsFields';
import { ReviewBook } from '../components/review/ReviewBook';
import { ReviewPgnPanel } from '../components/review/ReviewPgnPanel';
import { SettingsDialog } from '../components/SettingsDialog';
import { LoadingScreen } from '../components/LoadingScreen';
import { navigatePly } from '../chess/notation';
import { nativeLlmUrlIssue } from '../llm/client';
import { isNative } from '../platform';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';
import { getReviewStore, newReviewSession, saveReviewSessionAs, switchReviewSession, useReview } from '../store/reviewInstance';
import { viewedPosition, type ReviewState } from '../store/review';
import { formatMoveHeading, titleFromHeaders } from '../review/document';
import { reviewKeyToNav } from '../review/keys';
import { printReview } from '../review/print';
import { useGameSessions } from '../store/gameSessions';

export function ReviewPage() {
  const t = useT();
  const [store, setStore] = useState<StoreApi<ReviewState> | null>(null);
  const [status, setStatus] = useState(() => t('explore.loadingEngine'));
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gs = useGameSessions.getState();
        let s: StoreApi<ReviewState>;
        if (sessionParam && gs.metas[sessionParam]?.kind === 'review') {
          s = await switchReviewSession(sessionParam);
          if (!cancelled) setSearchParams({}, { replace: true });
        } else {
          s = await getReviewStore();
        }
        if (!cancelled) setStore(s);
      } catch (e) {
        if (!cancelled) setStatus(t('explore.engineFail', { msg: String(e) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionParam, setSearchParams, t]);

  if (!store) return <LoadingScreen message={status} />;
  return <ReviewView store={store} />;
}

export function ReviewView({ store }: { store: StoreApi<ReviewState> }) {
  const t = useT();
  const location = useLocation();
  const origin = originFromState(location.state);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const baseUrl = useSettings((s) => s.llm.baseUrl);
  const httpsBlocked = nativeLlmUrlIssue(baseUrl, isNative()) === 'http';
  const [pgnInput, setPgnInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const status = useReview(store, (s) => s.status);
  const writingStage = useReview(store, (s) => s.writingStage);
  const headers = useReview(store, (s) => s.headers);
  const startFen = useReview(store, (s) => s.startFen);
  const moves = useReview(store, (s) => s.moves);
  const document = useReview(store, (s) => s.document);
  const annotatedPgn = useReview(store, (s) => s.annotatedPgn);
  const ply = useReview(store, (s) => s.ply);
  const orientation = useReview(store, (s) => s.orientation);
  const progress = useReview(store, (s) => s.progress);
  const error = useReview(store, (s) => s.error);

  const viewed = useMemo(() => viewedPosition(startFen, moves, ply), [startFen, moves, ply]);
  const title = titleFromHeaders(headers, t('review.untitled'));
  const startMoveNumber = Number(startFen.split(' ')[5] ?? '1');
  const blackFirst = startFen.split(' ')[1] === 'b';
  const qualities = useMemo(() => moves.map((m) => m.quality), [moves]);
  const showComposer = moves.length === 0 && status !== 'analyzing' && status !== 'writing';
  const canPrint = Boolean(document && (status === 'ready' || status === 'writing'));
  const progressPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  useEffect(() => {
    if (showComposer) return;
    const onKey = (e: KeyboardEvent) => {
      const nav = reviewKeyToNav(e);
      if (!nav) return;
      e.preventDefault();
      store.getState().step(nav);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, showComposer]);

  const startReview = () => {
    if (!hasKey || httpsBlocked) return;
    void store.getState().startFromPgn(pgnInput);
  };

  const currentSan = ply > 0 && moves[ply - 1]
    ? formatMoveHeading(startFen, moves[ply - 1].ply, moves[ply - 1].san, moves[ply - 1].nag)
    : t('review.startPos');

  const notes = showComposer ? (
    <div className="p-3">
      <p className="review-composer-lead">{t('review.tagline')}</p>
      {!hasKey ? (
        <div className="mb-4">
          <MissingKeyEmpty onConfigure={() => setSettingsOpen(true)} />
        </div>
      ) : null}
      {httpsBlocked ? (
        <div className="mb-4">
          <HttpsRequiredNotice />
        </div>
      ) : null}
      <label htmlFor="review-pgn" className="mb-1.5 block text-sm font-medium text-ink">
        {t('review.pgnLabel')}
      </label>
      <textarea
        id="review-pgn"
        className="field review-pgn-field selectable-text"
        rows={10}
        placeholder={t('review.pgnPlaceholder')}
        value={pgnInput}
        onChange={(e) => setPgnInput(e.target.value)}
      />
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasKey || httpsBlocked || !pgnInput.trim()}
          onClick={startReview}
        >
          {t('review.start')}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {status === 'analyzing' && progress ? (
        <div className="review-progress mb-3" role="status" aria-label={t('review.progressAria')}>
          <p className="text-sm text-muted">{t('review.analyzing', { done: progress.done, total: progress.total })}</p>
          <div className="review-progress-track" aria-hidden="true">
            <div className="review-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="review-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}
      {status === 'writing' ? (
        <p className="mb-3 text-sm text-muted" role="status">
          {t(writingStage === 'variations' ? 'review.writingKeys' : 'review.writing')}
        </p>
      ) : null}
      {error ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">{error}</p>
          {moves.length > 0 ? (
            <button type="button" className="btn btn-sm" onClick={() => void store.getState().retryWrite()}>
              {t('review.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      <ReviewBook
        startFen={startFen}
        moves={moves}
        document={document}
        ply={ply}
        orientation={orientation}
        onSelectPly={(next) => store.getState().setPly(next)}
      />
    </div>
  );

  const scorePanel = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <h2 className="mb-2 shrink-0 text-sm font-semibold text-ink">{t('explore.moves')}</h2>
      <div className="review-score min-h-0 flex-1 overflow-auto">
        <MoveList
          history={moves.map((m) => m.san)}
          startMoveNumber={startMoveNumber}
          blackFirst={blackFirst}
          selectedPly={ply}
          onSelectPly={(next) => store.getState().setPly(next)}
          qualities={status === 'analyzing' ? undefined : qualities}
        />
      </div>
      <ReviewPgnPanel pgn={annotatedPgn} />
    </div>
  );

  return (
    <>
      <TrainerLayout
        storageKey="review-v1"
        detailDefault={showComposer ? 'expanded' : 'half'}
        collapsedAction={!hasKey ? <MissingKeyEmpty compact onConfigure={() => setSettingsOpen(true)} /> : undefined}
        header={
          <header className="trainer-nav text-sm">
            <div className="trainer-nav-start">
              <NavBack to={originPath(origin)}>{originLabel(origin)}</NavBack>
            </div>
            <h1 className="trainer-nav-title">{showComposer ? t('review.title') : title}</h1>
            <div className="trainer-nav-end">
              <SessionBar
                trigger="more"
                kind="review"
                onSwitch={(id) => void switchReviewSession(id)}
                onNew={() => void newReviewSession().then(() => setPgnInput(''))}
                onSaveAs={(nextTitle) => void saveReviewSessionAs(nextTitle)}
                extra={
                  <Link
                    to="/analyses"
                    state={{ from: 'review' }}
                    className="flex min-h-11 w-full items-center px-2 text-left text-sm text-ink"
                    role="menuitem"
                  >
                    {t('home.analyses')}
                  </Link>
                }
              />
            </div>
          </header>
        }
        board={
          <div className="grid h-full min-h-0 w-full grid-rows-[minmax(0,1fr)_auto] gap-1.5 overflow-hidden">
            <div className="min-h-0 min-w-0">
              <Board
                fen={viewed.fen}
                orientation={orientation}
                interactive={false}
                annotations={null}
                hintArrow={null}
                hoverFocus={null}
                lastMove={viewed.lastMove}
                onMove={() => false}
              />
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="shrink-0">
                <EvalBar cp={viewed.evalCp} playerIsWhite={true} ends="colors" />
              </div>
              <BoardToolbar>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={ply <= 0}
                  aria-label={t('trainer.prev')}
                  title={ply <= 0 ? t('trainer.atStart') : `${t('trainer.prev')} ←`}
                  onClick={() => store.getState().setPly(navigatePly(ply, moves.length, 'back'))}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={ply >= moves.length}
                  aria-label={t('trainer.next')}
                  title={ply >= moves.length ? t('trainer.atLive') : `${t('trainer.next')} →`}
                  onClick={() => store.getState().setPly(navigatePly(ply, moves.length, 'forward'))}
                >
                  →
                </button>
                <BoardMoreMenu
                  items={[
                    {
                      id: 'flip',
                      label: t('trainer.flip'),
                      pressed: orientation === 'black',
                      onClick: () => store.getState().setOrientation(orientation === 'white' ? 'black' : 'white'),
                    },
                    {
                      id: 'print',
                      label: t('review.print'),
                      disabled: !canPrint,
                      reason: !canPrint ? t('review.noMovesYet') : undefined,
                      onClick: () => printReview(document?.title || title),
                    },
                  ]}
                />
              </BoardToolbar>
              <BoardStatus error={error}>
                {status === 'analyzing' && t('review.analyzing', { done: progress?.done ?? 0, total: progress?.total ?? 0 })}
                {status === 'writing' && t(writingStage === 'variations' ? 'review.writingKeys' : 'review.writing')}
                {status === 'ready' && currentSan}
                {showComposer && t('review.noMovesYet')}
              </BoardStatus>
            </div>
          </div>
        }
        leftPanel={
          moves.length > 0 ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden p-2">
              <h2 className="mb-2 shrink-0 text-sm font-semibold text-ink">{t('explore.moves')}</h2>
              <div className="min-h-0 flex-1 overflow-auto">
                <MoveList
                  history={moves.map((m) => m.san)}
                  startMoveNumber={startMoveNumber}
                  blackFirst={blackFirst}
                  selectedPly={ply}
                  onSelectPly={(next) => store.getState().setPly(next)}
                  qualities={status === 'analyzing' ? undefined : qualities}
                />
              </div>
            </div>
          ) : undefined
        }
        panels={[
          { id: 'notes', label: t('trainer.commentary'), disabled: !hasKey && showComposer, content: notes },
          { id: 'moves', label: t('explore.moves'), content: scorePanel },
        ]}
      />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
