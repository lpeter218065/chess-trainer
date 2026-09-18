import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { Board } from '../components/Board';
import { MoveList } from '../components/MoveList';
import { NavBack } from '../components/layout/NavBack';
import { originFromState, originLabel, originPath } from '../components/layout/navOrigin';
import { MissingKeyEmpty } from '../components/MissingKeyEmpty';
import { HttpsRequiredNotice } from '../components/SettingsFields';
import { ReviewBook } from '../components/review/ReviewBook';
import { ReviewPgnPanel } from '../components/review/ReviewPgnPanel';
import { SettingsDialog } from '../components/SettingsDialog';
import { LoadingScreen } from '../components/LoadingScreen';
import { formatEval, navigatePly, type PlyNav } from '../chess/notation';
import { nativeLlmUrlIssue } from '../llm/client';
import { isNative } from '../platform';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';
import { getReviewStore, newReviewSession, switchReviewSession, useReview } from '../store/reviewInstance';
import { viewedPosition, type ReviewState } from '../store/review';
import { titleFromHeaders } from '../review/document';
import { printReview } from '../review/print';
import { useGameSessions } from '../store/gameSessions';

function keyToNav(key: string): PlyNav | null {
  if (key === 'ArrowLeft') return 'back';
  if (key === 'ArrowRight') return 'forward';
  if (key === 'ArrowUp' || key === 'Home') return 'start';
  if (key === 'ArrowDown' || key === 'End') return 'end';
  return null;
}

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

function GameEvalBar({ cp }: { cp: number }) {
  const t = useT();
  const clamped = Math.max(-1000, Math.min(1000, cp));
  const whitePct = 50 + (clamped / 1000) * 50;
  return (
    <div className="flex items-center gap-2" aria-label={t('review.evalAria', { eval: formatEval(cp) })}>
      <span className="w-8 shrink-0 text-xs text-muted">{t('assess.white')}</span>
      <div className="eval-track" aria-hidden="true">
        <div className="eval-fill" style={{ width: `${whitePct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs text-muted">{t('assess.black')}</span>
      <span className="w-16 text-right font-mono text-sm tabular-nums text-ink">{formatEval(cp)}</span>
    </div>
  );
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
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const nav = keyToNav(e.key);
      if (!nav) return;
      e.preventDefault();
      store.getState().step(nav);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const startReview = () => {
    if (!hasKey || httpsBlocked) return;
    void store.getState().startFromPgn(pgnInput);
  };

  return (
    <div className="page-shell review-shell">
      <header className="review-header">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="no-print">
            <NavBack to={originPath(origin)}>{originLabel(origin)}</NavBack>
          </span>
          <div className="flex flex-wrap items-center gap-2 no-print">
            {canPrint ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => printReview(document?.title || title)}
              >
                {t('review.print')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void newReviewSession().then(() => setPgnInput(''))}
            >
              {t('review.new')}
            </button>
            <Link to="/analyses" state={{ from: 'review' }} className="btn btn-sm">
              {t('home.analyses')}
            </Link>
          </div>
        </div>
        <div className="mt-3">
          <p className="campaign-kicker no-print">{t('review.title')}</p>
          <h1 className="page-title text-2xl">{showComposer ? t('review.title') : title}</h1>
          {!showComposer && headers.Result ? (
            <p className="mt-1 text-sm text-muted">{headers.Result}{headers.Event ? ` · ${headers.Event}` : ''}</p>
          ) : null}
        </div>
      </header>

      {showComposer ? (
        <section className="review-composer">
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
            rows={12}
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
        </section>
      ) : (
        <div className="review-workspace">
          <section className="review-board-col no-print">
            <div className="review-board-frame">
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
            <div className="mt-2">
              <GameEvalBar cp={viewed.evalCp} />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-sm"
                disabled={ply <= 0}
                aria-label={t('trainer.prev')}
                onClick={() => store.getState().setPly(navigatePly(ply, moves.length, 'back'))}
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={ply >= moves.length}
                aria-label={t('trainer.next')}
                onClick={() => store.getState().setPly(navigatePly(ply, moves.length, 'forward'))}
              >
                →
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => store.getState().setOrientation(orientation === 'white' ? 'black' : 'white')}
              >
                {t('trainer.flip')}
              </button>
            </div>
            <div className="review-score mt-3">
              <MoveList
                history={moves.map((m) => m.san)}
                startMoveNumber={startMoveNumber}
                blackFirst={blackFirst}
                selectedPly={ply}
                onSelectPly={(next) => store.getState().setPly(next)}
                qualities={status === 'analyzing' ? undefined : qualities}
              />
            </div>
          </section>
          <section className="review-book-col">
            {status === 'analyzing' && progress ? (
              <div className="review-progress no-print" role="status" aria-label={t('review.progressAria')}>
                <p className="text-sm text-muted">{t('review.analyzing', { done: progress.done, total: progress.total })}</p>
                <div className="review-progress-track" aria-hidden="true">
                  <div className="review-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            ) : null}
            {status === 'writing' ? (
              <p className="review-progress-note no-print" role="status">
                {t(writingStage === 'variations' ? 'review.writingKeys' : 'review.writing')}
              </p>
            ) : null}
            {error ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
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
            <ReviewPgnPanel pgn={annotatedPgn} />
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="no-print">
          <SettingsDialog onClose={() => setSettingsOpen(false)} />
        </div>
      )}
    </div>
  );
}
