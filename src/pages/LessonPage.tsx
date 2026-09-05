import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { lessonById } from '../lessons';
import { bootLessonSession, newLessonSession, switchLessonSession, useSession } from '../store/sessionInstance';
import type { SessionState } from '../store/session';
import { useSettings } from '../store/settings';
import { useGameSessions } from '../store/gameSessions';
import { DIFFICULTIES, difficultyById, type DifficultyId } from '../engine/difficulty';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { CommentaryPanel } from '../components/CommentaryPanel';
import { MoveList } from '../components/MoveList';
import { HintButton } from '../components/HintButton';
import { SummaryCard } from '../components/SummaryCard';
import { SessionBar } from '../components/SessionBar';
import { fenAfterPlies, formatEval, navigatePly, sideToMove, sanToUci, uciToSan, type PlyNav } from '../chess/notation';
import { annotationsFromAnalysis, annotationsFromFocus, mergeAnnotations, roundIndexForPly } from '../chess/annotations';
import { AnnotationLegend } from '../components/AnnotationLegend';
import { AssessmentPanel } from '../components/AssessmentPanel';
import { focusFromText } from '../chess/commentaryMarkers';
import { EngineLinesPanel, type PvLineData } from '../components/EngineLinesPanel';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { scoreToCp } from '../chess/quality';
import type { Analysis } from '../engine/engineService';
import { LoadingScreen } from '../components/LoadingScreen';
import { BoardToolbar, ToolToggle } from '../components/BoardToolbar';
import { TrainerLayout } from '../components/layout/TrainerLayout';
import { FollowUpComposer } from '../components/FollowUpChat';
import { lessonFollowUpThreadId } from '../llm/prompts';
import { useHasHover } from '../platform';
import type { CommentaryFocusMode } from '../components/AnnotatedCommentary';

export function LessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const lesson = lessonById(decodeURIComponent(id ?? ''));
  const defaultDifficulty = useSettings((s) => s.difficultyId);
  const [difficultyId, setDifficultyId] = useState<DifficultyId>(defaultDifficulty);
  const [store, setStore] = useState<StoreApi<SessionState> | null>(null);
  const [engineStatus, setEngineStatus] = useState('正在加载引擎…');

  useEffect(() => {
    if (!lesson) return;
    let cancelled = false;
    (async () => {
      try {
        const gs = useGameSessions.getState();
        const difficulty = difficultyById(defaultDifficulty);
        if (sessionParam) {
          const meta = gs.metas[sessionParam];
          if (meta?.kind === 'lesson' && meta.lessonId === lesson.id) {
            gs.setActiveLesson(sessionParam);
          }
        }
        const s = await bootLessonSession(lesson, difficulty);
        if (sessionParam) setSearchParams({}, { replace: true });
        if (cancelled) return;
        setStore(s);
        const d = s.getState().difficulty?.id;
        if (d) setDifficultyId(d);
      } catch (e) {
        if (!cancelled) setEngineStatus(`引擎加载失败：${String(e)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [lesson?.id, sessionParam, defaultDifficulty, setSearchParams]);

  if (!lesson) {
    return (
      <div className="p-8 text-sm text-ink">
        找不到课程。
        <button type="button" className="ml-2 text-felt underline-offset-4 hover:underline" onClick={() => navigate('/')}>返回</button>
      </div>
    );
  }
  if (!store) return <LoadingScreen message={engineStatus} />;
  return (
    <LessonView
      store={store}
      lesson={lesson}
      expectedLessonId={lesson.id}
      difficultyId={difficultyId}
      onDifficulty={(did) => {
        setDifficultyId(did);
        void store.getState().start(lesson, difficultyById(did)).then(() => {
          const snap = store.getState().exportSnapshot();
          const gs = useGameSessions.getState();
          if (snap && gs.activeLessonId) gs.saveLessonSnapshot(gs.activeLessonId, snap);
        });
      }}
      onBack={() => navigate('/')}
    />
  );
}

function keyToNav(key: string): PlyNav | null {
  if (key === 'ArrowLeft') return 'back';
  if (key === 'ArrowRight') return 'forward';
  if (key === 'ArrowUp' || key === 'Home') return 'start';
  if (key === 'ArrowDown' || key === 'End') return 'end';
  return null;
}

function resolveBoardAnnotations(s: SessionState, ply: number, livePly: number, viewedFen: string) {
  const roundIdx = roundIndexForPly(ply);
  const viewingRound = roundIdx >= 0 && roundIdx < s.rounds.length ? s.rounds[roundIdx] : null;

  if (ply < livePly) {
    if (viewingRound) return viewingRound.annotations;
    if (ply === 0 && s.analysisBefore?.fen === viewedFen) return annotationsFromAnalysis(s.analysisBefore);
    return null;
  }

  if (s.liveAnnotations) return s.liveAnnotations;

  if (viewingRound && (s.phase === 'engineThinking' || s.phase === 'preparing' || s.streaming === 'commentary')) {
    return viewingRound.annotations;
  }

  if (s.phase === 'userTurn' && s.analysisBefore?.fen === viewedFen) {
    return annotationsFromAnalysis(s.analysisBefore);
  }

  if (viewingRound) return viewingRound.annotations;
  if (ply === 0 && s.analysisBefore?.fen === viewedFen) return annotationsFromAnalysis(s.analysisBefore);
  return null;
}

function linesFromAnalysis(analysis: Analysis): PvLineData[] {
  return analysis.lines.slice(0, 3).map((l, i) => {
    const cp = scoreToCp(l.score);
    const whiteCp = sideToMove(analysis.fen) === 'w' ? cp : -cp;
    return {
      label: `PV${i + 1}`,
      uci: l.pv.slice(0, 6),
      moves: uciToSan(analysis.fen, l.pv.slice(0, 6)),
      evalText: formatEval(whiteCp),
    };
  });
}

/** 当前复盘局面可用的候选招法：优先 live 分析，否则取「走子前」存在该局面上的回合 PV */
function resolveEngineLines(s: SessionState, viewedFen: string): { baseFen: string; lines: PvLineData[] } | null {
  if (s.analysisBefore?.fen === viewedFen) {
    return { baseFen: viewedFen, lines: linesFromAnalysis(s.analysisBefore) };
  }
  if (!s.lesson) return null;
  let cursor = 0;
  for (const r of s.rounds) {
    const fenAt = fenAfterPlies(s.lesson.startFen, s.history, cursor).fen;
    if (fenAt === viewedFen) {
      const lines: PvLineData[] = r.bestLinesSan.slice(0, 3).map((moves, i) => {
        const stored = r.bestLinesUci?.[i];
        const uci = stored && stored.length > 0 ? stored : sanToUci(viewedFen, moves);
        return {
          label: `PV${i + 1}`,
          uci,
          moves: moves.length > 0 ? moves : uciToSan(viewedFen, uci),
        };
      });
      return lines.length > 0 ? { baseFen: viewedFen, lines } : null;
    }
    cursor += 1 + (r.engineMove ? 1 : 0);
  }
  return null;
}

export function LessonView({
  store,
  lesson,
  expectedLessonId,
  difficultyId,
  onDifficulty,
  onBack,
  difficultyOptions,
  difficultyLabel = '难度',
}: {
  store: StoreApi<SessionState>;
  lesson: NonNullable<ReturnType<typeof lessonById>>;
  expectedLessonId: string;
  difficultyId: DifficultyId;
  onDifficulty(id: DifficultyId): void;
  onBack(): void;
  /** 开局练习等场景可传入仅两档对手 */
  difficultyOptions?: typeof DIFFICULTIES;
  difficultyLabel?: string;
}) {
  const s = useSession(store, (x) => x);
  const livePly = s.history.length;
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);
  const [hoverFocus, setHoverFocus] = useState<CommentaryFocus | null>(null);
  const focusMode: CommentaryFocusMode = useHasHover() ? 'hover' : 'tap';
  const ply = reviewPly === null ? livePly : Math.min(reviewPly, livePly);
  const isLive = reviewPly === null || reviewPly >= livePly;

  const viewed = useMemo(
    () => (s.lesson ? fenAfterPlies(s.lesson.startFen, s.history, ply) : { fen: '', lastMove: null }),
    [s.lesson, s.history, ply],
  );

  // 轮到学员即可走：退一步后分析在后台，不必等 userTurn
  const canPlayHere =
    !!s.lesson &&
    !!viewed.fen &&
    sideToMove(viewed.fen) === s.lesson.playerColor &&
    s.phase !== 'engineThinking' &&
    !s.followUpStreaming;

  useEffect(() => {
    setReviewPly(null);
  }, [expectedLessonId]);

  useEffect(() => {
    setShowAnnotations(false);
    setHoverFocus(null);
  }, [ply, livePly, s.rounds.length]);

  useEffect(() => {
    if (!showAssessment || !viewed.fen) return;
    const side = store.getState().assessmentSide ?? sideToMove(viewed.fen);
    void store.getState().requestAssessment(side, {
      fen: viewed.fen,
      history: store.getState().history.slice(0, ply),
    });
  }, [showAssessment, viewed.fen, ply, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const nav = keyToNav(e.key);
      if (!nav) return;
      e.preventDefault();
      if (!store.getState().lesson) return;
      setReviewPly((cur) => {
        const current = cur === null ? livePly : Math.min(cur, livePly);
        const next = navigatePly(current, livePly, nav);
        return next >= livePly ? null : next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [livePly, store]);

  const boardAnnotations = useMemo(
    () => resolveBoardAnnotations(s, ply, livePly, viewed.fen),
    [s, ply, livePly, viewed.fen],
  );

  const assessmentMarks = useMemo(() => {
    if (!showAssessment || !s.assessment || s.assessmentFen !== viewed.fen) return null;
    return annotationsFromFocus(focusFromText(s.assessment));
  }, [showAssessment, s.assessment, s.assessmentFen, viewed.fen]);

  const visibleAnnotations = mergeAnnotations(
    showAnnotations ? boardAnnotations : null,
    assessmentMarks,
  );

  const activeRoundIndex = roundIndexForPly(ply);
  const plyAfterRounds = useMemo(() => {
    const ends: number[] = [];
    let cursor = 0;
    for (const r of s.rounds) {
      cursor += 1 + (r.engineMove ? 1 : 0);
      ends.push(cursor);
    }
    return ends;
  }, [s.rounds]);

  const enginePv = useMemo(
    () => (viewed.fen ? resolveEngineLines(s, viewed.fen) : null),
    [s, viewed.fen],
  );

  const canTakeback =
    !!s.lesson &&
    (s.phase === 'userTurn' || s.phase === 'finished') &&
    !s.followUpStreaming &&
    (() => {
      for (let p = ply - 1; p >= 0; p--) {
        if (sideToMove(fenAfterPlies(s.lesson!.startFen, s.history, p).fen) === s.lesson!.playerColor) return true;
      }
      return false;
    })();

  const stepReview = (nav: PlyNav) => {
    setReviewPly((cur) => {
      const current = cur === null ? livePly : Math.min(cur, livePly);
      const next = navigatePly(current, livePly, nav);
      return next >= livePly ? null : next;
    });
  };

  const onTakeback = async () => {
    const ok = await store.getState().takeback(ply);
    if (ok) setReviewPly(null);
  };

  const onBoardMove = async (from: string, to: string, promotion?: string) => {
    if (!canPlayHere) return false;
    if (!isLive) {
      const ok = await store.getState().rewindToPly(ply);
      setReviewPly(null);
      if (!ok) return false;
    }
    return store.getState().playUserMove(from, to, promotion);
  };

  // start() 在父组件 useEffect 里调用，首次渲染时 session.lesson 仍是 null
  if (!s.lesson || s.lesson.id !== expectedLessonId) {
    return <LoadingScreen message="正在准备课程…" />;
  }
  const currentLesson = s.lesson;
  const orientation = currentLesson.playerColor === 'w' ? 'white' : 'black';
  const startMoveNumber = Number(currentLesson.startFen.split(' ')[5] ?? '1');
  const analyzing = s.phase === 'preparing' || s.phase === 'engineThinking';
  const introThread = lessonFollowUpThreadId('intro');
  const showingIntro = activeRoundIndex < 0;
  const activeRound = activeRoundIndex >= 0 ? s.rounds[activeRoundIndex] : undefined;
  const streamingThisRound = !!activeRound && s.streaming === 'commentary' && activeRound.index === s.rounds.length - 1;
  const showIntroFollowUp = showingIntro && s.intro.length > 0 && s.streaming !== 'intro';
  const showRoundFollowUp = !!activeRound && activeRound.commentary.length > 0 && !streamingThisRound;
  const composerThread = showingIntro ? introThread : (activeRound ? lessonFollowUpThreadId('round', activeRound.index) : null);
  const showComposer = Boolean((showIntroFollowUp || showRoundFollowUp) && composerThread);
  const focusProps = { focusMode, activeFocus: hoverFocus };

  const leftPanel = showCandidates ? (
    enginePv && enginePv.lines.length > 0 ? (
      <EngineLinesPanel baseFen={enginePv.baseFen} lines={enginePv.lines} orientation={orientation} />
    ) : (
      <div className="flex h-full min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
        {analyzing ? '候选分析中…' : '这一步还没有候选招法'}
      </div>
    )
  ) : undefined;

  return (
    <TrainerLayout
      storageKey="lesson"
      header={
        <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" className="inline-flex min-h-11 items-center text-felt underline-offset-4 hover:underline" onClick={onBack}>← 课程列表</button>
          <span className="font-display font-semibold text-ink">{currentLesson.title}</span>
          <div className="flex flex-wrap items-center gap-2">
            <SessionBar
              kind="lesson"
              onSwitch={(sid) => void switchLessonSession(sid, lesson, difficultyById(difficultyId))}
              onNew={() => void newLessonSession(lesson, difficultyById(difficultyId))}
              onSaveAs={(title) => {
                const gs = useGameSessions.getState();
                const from = gs.activeLessonId;
                if (!from) return;
                const snap = store.getState().exportSnapshot();
                if (snap) gs.saveLessonSnapshot(from, snap);
                const id = gs.saveAsLesson(from, title);
                if (id) void switchLessonSession(id, lesson, difficultyById(difficultyId));
              }}
            />
            <label className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted">
              {difficultyLabel}
              <select className="field min-h-11 w-auto py-0 text-sm" value={difficultyId} onChange={(e) => onDifficulty(e.target.value as DifficultyId)}>
                {(difficultyOptions ?? DIFFICULTIES).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          </div>
        </header>
      }
      board={
        <div className="grid h-full min-h-0 w-full grid-rows-[minmax(0,1fr)_auto] gap-1.5 overflow-hidden">
          <div className="min-h-0 min-w-0">
              <Board
                key={s.fen}
                fen={viewed.fen}
                orientation={orientation}
                interactive={canPlayHere}
                annotations={visibleAnnotations}
                hintArrow={isLive && s.phase === 'userTurn' ? s.hintArrow : null}
                hoverFocus={hoverFocus}
                lastMove={viewed.lastMove}
                onMove={onBoardMove}
                onBackgroundTap={() => setHoverFocus(null)}
              />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
          {(showAnnotations || (assessmentMarks && (assessmentMarks.arrows.length > 0 || assessmentMarks.squares.length > 0))) && (
            <div className="shrink-0">
              <AnnotationLegend annotations={visibleAnnotations} showHint={isLive && s.phase === 'userTurn' && !!s.hintArrow} />
            </div>
          )}
          <div className="shrink-0">
            <EvalBar cp={s.evalCp} playerIsWhite={currentLesson.playerColor === 'w'} />
          </div>
          <BoardToolbar>
            <ToolToggle
              pressed={showAnnotations}
              disabled={!boardAnnotations}
              title={!boardAnnotations ? '还没有分析' : undefined}
              onClick={() => setShowAnnotations((v) => !v)}
            >
              {showAnnotations ? '隐藏分析' : '显示分析'}
            </ToolToggle>
            <ToolToggle pressed={showCandidates} onClick={() => setShowCandidates((v) => !v)}>
              候选招法
            </ToolToggle>
            <ToolToggle pressed={showAssessment} onClick={() => setShowAssessment((v) => !v)}>
              局面判断
            </ToolToggle>
            <button type="button" className="btn btn-sm" disabled={ply <= 0} aria-label="上一步" onClick={() => stepReview('back')}>←</button>
            <button type="button" className="btn btn-sm" disabled={isLive} aria-label="下一步" onClick={() => stepReview('forward')}>→</button>
            <button type="button" className="btn btn-sm" disabled={!canTakeback} title={!canTakeback ? '没有可退的一步' : '撤销你的上一手，之后着法会丢掉'} onClick={() => void onTakeback()}>退一步</button>
            <span className="min-w-0 truncate text-xs text-muted">
              {!isLive && canPlayHere && '回看中 · 点子或拖子改走（之后着法将丢弃）'}
              {!isLive && !canPlayHere && '回看中 · 轮到对方'}
              {isLive && s.phase === 'preparing' && '引擎分析中…可继续走'}
              {isLive && s.phase === 'engineThinking' && '引擎思考中…'}
              {isLive && s.phase === 'userTurn' && '轮到你走 · 点子或拖子'}
              {isLive && s.phase === 'finished' && '训练结束'}
              {s.engineError && <span className="ml-2 text-danger" role="alert">{s.engineError}</span>}
            </span>
          </BoardToolbar>
          <div className="max-h-28 min-h-16 shrink-0 overflow-y-auto">
            <MoveList
              history={s.history}
              startMoveNumber={startMoveNumber}
              blackFirst={sideToMove(currentLesson.startFen) === 'b'}
              selectedPly={ply}
              onSelectPly={(p) => setReviewPly(p >= livePly ? null : p)}
            />
          </div>
          </div>
        </div>
      }
      leftPanel={leftPanel}
      panels={[
        {
          id: 'guide',
          label: '讲解',
          content: (
            <div className="flex min-h-0 flex-col">
              <div className="shrink-0 border-b border-line px-3 py-2">
                <h2 className="text-sm font-semibold text-ink">{currentLesson.title}</h2>
                <p className="text-xs text-muted">{currentLesson.theme}</p>
              </div>
              {s.phase !== 'finished' && (
                <div className="shrink-0 border-b border-line px-3 py-2">
                  <HintButton disabled={!isLive || s.phase !== 'userTurn'} hintText={s.hintText} streaming={s.streaming === 'hint'} onHint={(lv) => void s.requestHint(lv)} />
                </div>
              )}
              {s.phase === 'finished' && s.result && (
                <div className="shrink-0 border-b border-line px-3 py-2">
                  <SummaryCard outcome={s.result.outcome} reason={s.result.reason} summary={s.summary} streaming={s.streaming === 'summary'} onRestart={() => void newLessonSession(lesson, difficultyById(difficultyId))} onBack={onBack} />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {showAssessment && (
                  <div className="mb-3">
                    <AssessmentPanel
                      side={s.assessmentSide ?? sideToMove(viewed.fen)}
                      text={s.assessmentFen === viewed.fen ? s.assessment : ''}
                      streaming={s.streaming === 'assessment'}
                      error={s.streaming === 'assessment' ? null : s.llmError}
                      onSide={(side) => {
                        void store.getState().requestAssessment(side, { fen: viewed.fen, history: s.history.slice(0, ply) });
                      }}
                      onFocus={setHoverFocus}
                      {...focusProps}
                    />
                  </div>
                )}
                <CommentaryPanel
                  intro={s.intro}
                  rounds={s.rounds}
                  activeRoundIndex={activeRoundIndex}
                  streaming={s.streaming}
                  llmError={s.llmError}
                  followUps={s.followUps}
                  followUpStreaming={s.followUpStreaming}
                  followUpDraft={s.followUpDraft}
                  followUpError={s.followUpError}
                  followUpThreadId={s.followUpThreadId}
                  onAskFollowUp={(tid, q) => void s.askFollowUp(tid, q)}
                  onSelectRound={(index) => {
                    if (index < 0) {
                      setReviewPly(livePly === 0 ? null : 0);
                      return;
                    }
                    const end = plyAfterRounds[index];
                    if (end == null) return;
                    setReviewPly(end >= livePly ? null : end);
                  }}
                  onFocus={setHoverFocus}
                  hideComposer
                  {...focusProps}
                />
              </div>
            </div>
          ),
        },
      ]}
      footer={showComposer && composerThread ? (
        <FollowUpComposer
          disabled={s.streaming !== null || s.followUpStreaming}
          error={s.followUpError}
          onAsk={(q) => void s.askFollowUp(composerThread, q)}
        />
      ) : undefined}
    />
  );
}
