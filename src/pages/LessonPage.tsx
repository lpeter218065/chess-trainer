import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { lessonById } from '../lessons';
import { bootLessonSession, newLessonSession, switchLessonSession, useSession } from '../store/sessionInstance';
import type { Phase, Round, SessionState } from '../store/session';
import type { Lesson } from '../lessons/schema';
import { useSettings } from '../store/settings';
import { useGameSessions } from '../store/gameSessions';
import { DIFFICULTIES, difficultyById, type DifficultyId } from '../engine/difficulty';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { MoveList } from '../components/MoveList';
import { SessionList } from '../components/SessionBar';
import { Sheet } from '../components/Sheet';
import { SettingsDialog } from '../components/SettingsDialog';
import { MissingKeyEmpty } from '../components/MissingKeyEmpty';
import { originFromState, originLabel, originPath } from '../components/layout/navOrigin';
import { fenAfterPlies, formatEval, navigatePly, sideToMove, sanToUci, uciToSan, type PlyNav } from '../chess/notation';
import { annotationsFromAnalysis, annotationsFromFocus, mergeAnnotations, roundIndexForPly, type BoardAnnotations } from '../chess/annotations';
import { AnnotationLegend } from '../components/AnnotationLegend';
import { focusFromText } from '../chess/commentaryMarkers';
import { EngineLinesPanel, type PvLineData } from '../components/EngineLinesPanel';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { scoreToCp } from '../chess/quality';
import type { Analysis } from '../engine/engineService';
import { LoadingScreen } from '../components/LoadingScreen';
import { BoardToolbar, BoardStatus, ToolToggle, BoardMoreMenu } from '../components/BoardToolbar';
import { TrainerLayout } from '../components/layout/TrainerLayout';
import { NavBack } from '../components/layout/NavBack';
import { LessonCommentary } from '../components/lesson/LessonCommentary';
import { LessonHint } from '../components/lesson/LessonHint';
import { LessonSummary } from '../components/lesson/LessonSummary';
import { LessonAssessment } from '../components/lesson/LessonAssessment';
import { LessonFollowUpComposer } from '../components/lesson/LessonFollowUpComposer';
import { lessonFollowUpThreadId } from '../llm/prompts';
import { useHasHover } from '../platform';
import type { CommentaryFocusMode } from '../components/AnnotatedCommentary';

export function LessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const origin = originFromState(location.state);
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
      <div className="page-shell text-sm text-ink">
        <NavBack onClick={() => navigate(originPath(origin))}>{originLabel(origin)}</NavBack>
        <p className="mt-3">找不到这节课。</p>
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
      onBack={() => navigate(originPath(origin))}
      backLabel={originLabel(origin)}
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

interface AnnotationSources {
  roundAnnotations: BoardAnnotations[];
  analysisBefore: Analysis | null;
  liveAnnotations: BoardAnnotations | null;
  phase: Phase;
  commentaryStreaming: boolean;
}

function resolveBoardAnnotations(src: AnnotationSources, ply: number, livePly: number, viewedFen: string): BoardAnnotations | null {
  const roundIdx = roundIndexForPly(ply);
  const viewingRound = roundIdx >= 0 && roundIdx < src.roundAnnotations.length ? src.roundAnnotations[roundIdx] : null;
  const fromAnalysis = src.analysisBefore?.fen === viewedFen ? annotationsFromAnalysis(src.analysisBefore) : null;

  if (ply < livePly) {
    if (viewingRound) return viewingRound;
    if (ply === 0 && fromAnalysis) return fromAnalysis;
    return null;
  }

  if (src.liveAnnotations) return src.liveAnnotations;

  if (viewingRound && (src.phase === 'engineThinking' || src.phase === 'preparing' || src.commentaryStreaming)) {
    return viewingRound;
  }

  if (src.phase === 'userTurn' && fromAnalysis) return fromAnalysis;

  if (viewingRound) return viewingRound;
  if (ply === 0 && fromAnalysis) return fromAnalysis;
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

interface EngineLineSources {
  analysisBefore: Analysis | null;
  lesson: Lesson | null;
  history: string[];
  roundEngineMoves: Round['engineMove'][];
  roundBestLinesSan: string[][][];
  roundBestLinesUci: (string[][] | null)[];
}

/** 当前复盘局面可用的候选招法：优先 live 分析，否则取「走子前」存在该局面上的回合 PV */
function resolveEngineLines(src: EngineLineSources, viewedFen: string): { baseFen: string; lines: PvLineData[] } | null {
  if (src.analysisBefore?.fen === viewedFen) {
    return { baseFen: viewedFen, lines: linesFromAnalysis(src.analysisBefore) };
  }
  if (!src.lesson) return null;
  let cursor = 0;
  for (let i = 0; i < src.roundEngineMoves.length; i++) {
    const fenAt = fenAfterPlies(src.lesson.startFen, src.history, cursor).fen;
    if (fenAt === viewedFen) {
      const lines: PvLineData[] = src.roundBestLinesSan[i].slice(0, 3).map((moves, j) => {
        const stored = src.roundBestLinesUci[i]?.[j];
        const uci = stored && stored.length > 0 ? stored : sanToUci(viewedFen, moves);
        return {
          label: `PV${j + 1}`,
          uci,
          moves: moves.length > 0 ? moves : uciToSan(viewedFen, uci),
        };
      });
      return lines.length > 0 ? { baseFen: viewedFen, lines } : null;
    }
    cursor += 1 + (src.roundEngineMoves[i] ? 1 : 0);
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
  backLabel = '首页',
  difficultyOptions,
  difficultyLabel = '难度',
}: {
  store: StoreApi<SessionState>;
  lesson: NonNullable<ReturnType<typeof lessonById>>;
  expectedLessonId: string;
  difficultyId: DifficultyId;
  onDifficulty(id: DifficultyId): void;
  onBack(): void;
  backLabel?: string;
  /** 开局练习等场景可传入仅两档对手 */
  difficultyOptions?: typeof DIFFICULTIES;
  difficultyLabel?: string;
}) {
  // 细粒度订阅：流式文本（intro / commentary / hint / summary / followUp）都由自订阅组件消费，
  // 页面只订阅结构性字段，讲解流式刷新时不重渲染棋盘与走子列表。
  const sessionLesson = useSession(store, (x) => x.lesson);
  const phase = useSession(store, (x) => x.phase);
  const history = useSession(store, (x) => x.history);
  const analysisBefore = useSession(store, (x) => x.analysisBefore);
  const liveAnnotations = useSession(store, (x) => x.liveAnnotations);
  const hintArrow = useSession(store, (x) => x.hintArrow);
  const evalCp = useSession(store, (x) => x.evalCp);
  const engineError = useSession(store, (x) => x.engineError);
  const followUpStreaming = useSession(store, (x) => x.followUpStreaming);
  const commentaryStreaming = useSession(store, (x) => x.streaming === 'commentary');
  const introStreaming = useSession(store, (x) => x.streaming === 'intro');
  const hasIntro = useSession(store, (x) => x.intro.length > 0);
  const hasResult = useSession(store, (x) => x.result !== null);
  // 棋盘标记需要局面判断的文本；局面判断是低频操作，接受它触发页面重渲染
  const assessmentText = useSession(store, (x) => x.assessment);
  const assessmentFen = useSession(store, (x) => x.assessmentFen);
  const roundsCount = useSession(store, (x) => x.rounds.length);
  // 从 rounds 派生、引用稳定的数组：commentary 流式写入只替换被写的 round 对象，其余字段引用不变
  const roundAnnotations = useSession(store, useShallow((x) => x.rounds.map((r) => r.annotations)));
  const roundEngineMoves = useSession(store, useShallow((x) => x.rounds.map((r) => r.engineMove)));
  const roundBestLinesSan = useSession(store, useShallow((x) => x.rounds.map((r) => r.bestLinesSan)));
  const roundBestLinesUci = useSession(store, useShallow((x) => x.rounds.map((r) => r.bestLinesUci ?? null)));

  const livePly = history.length;
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);
  const [hoverFocus, setHoverFocus] = useState<CommentaryFocus | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const focusMode: CommentaryFocusMode = useHasHover() ? 'hover' : 'tap';
  const ply = reviewPly === null ? livePly : Math.min(reviewPly, livePly);
  const isLive = reviewPly === null || reviewPly >= livePly;
  const activeRoundIndex = roundIndexForPly(ply);
  // 只订阅「有没有讲解」而不是讲解文本，流式追加不会让页面重渲染
  const hasActiveRoundCommentary = useSession(
    store,
    (x) => activeRoundIndex >= 0 && (x.rounds[activeRoundIndex]?.commentary.length ?? 0) > 0,
  );

  const viewed = useMemo(
    () => (sessionLesson ? fenAfterPlies(sessionLesson.startFen, history, ply) : { fen: '', lastMove: null }),
    [sessionLesson, history, ply],
  );

  // 轮到学员即可走：退一步后分析在后台，不必等 userTurn
  const canPlayHere =
    !!sessionLesson &&
    !!viewed.fen &&
    sideToMove(viewed.fen) === sessionLesson.playerColor &&
    phase !== 'engineThinking' &&
    !followUpStreaming;

  useEffect(() => {
    setReviewPly(null);
    setFlipped(false);
  }, [expectedLessonId]);

  useEffect(() => {
    setShowAnnotations(false);
    setHoverFocus(null);
  }, [ply, livePly, roundsCount]);

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
    () => resolveBoardAnnotations({ roundAnnotations, analysisBefore, liveAnnotations, phase, commentaryStreaming }, ply, livePly, viewed.fen),
    [roundAnnotations, analysisBefore, liveAnnotations, phase, commentaryStreaming, ply, livePly, viewed.fen],
  );

  const assessmentMarks = useMemo(() => {
    if (!showAssessment || !assessmentText || assessmentFen !== viewed.fen) return null;
    return annotationsFromFocus(focusFromText(assessmentText));
  }, [showAssessment, assessmentText, assessmentFen, viewed.fen]);

  // 关掉「显示分析」时固定传 null，避免 boardAnnotations 变化打断棋盘 memo
  const shownAnnotations = showAnnotations ? boardAnnotations : null;
  const visibleAnnotations = useMemo(
    () => mergeAnnotations(shownAnnotations, assessmentMarks),
    [shownAnnotations, assessmentMarks],
  );

  const plyAfterRounds = useMemo(() => {
    const ends: number[] = [];
    let cursor = 0;
    for (const em of roundEngineMoves) {
      cursor += 1 + (em ? 1 : 0);
      ends.push(cursor);
    }
    return ends;
  }, [roundEngineMoves]);

  const enginePv = useMemo(
    () => (viewed.fen
      ? resolveEngineLines({ analysisBefore, lesson: sessionLesson, history, roundEngineMoves, roundBestLinesSan, roundBestLinesUci }, viewed.fen)
      : null),
    [analysisBefore, sessionLesson, history, roundEngineMoves, roundBestLinesSan, roundBestLinesUci, viewed.fen],
  );

  const historyUpToPly = useMemo(() => history.slice(0, ply), [history, ply]);

  const canTakeback =
    !!sessionLesson &&
    (phase === 'userTurn' || phase === 'finished') &&
    !followUpStreaming &&
    (() => {
      for (let p = ply - 1; p >= 0; p--) {
        if (sideToMove(fenAfterPlies(sessionLesson.startFen, history, p).fen) === sessionLesson.playerColor) return true;
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

  const onBoardMove = useCallback(async (from: string, to: string, promotion?: string) => {
    if (!canPlayHere) return false;
    if (!isLive) {
      const ok = await store.getState().rewindToPly(ply);
      setReviewPly(null);
      if (!ok) return false;
    }
    return store.getState().playUserMove(from, to, promotion);
  }, [store, canPlayHere, isLive, ply]);

  const onBackgroundTap = useCallback(() => setHoverFocus(null), []);
  const onSelectPly = useCallback((p: number) => setReviewPly(p >= livePly ? null : p), [livePly]);
  const onSelectRound = useCallback((index: number) => {
    if (index < 0) {
      setReviewPly(livePly === 0 ? null : 0);
      return;
    }
    const end = plyAfterRounds[index];
    if (end == null) return;
    setReviewPly(end >= livePly ? null : end);
  }, [livePly, plyAfterRounds]);

  // start() 在父组件 useEffect 里调用，首次渲染时 session.lesson 仍是 null
  if (!sessionLesson || sessionLesson.id !== expectedLessonId) {
    return <LoadingScreen message="正在准备课程…" />;
  }
  const currentLesson = sessionLesson;
  const playerOrientation = currentLesson.playerColor === 'w' ? 'white' : 'black';
  const orientation = flipped
    ? (playerOrientation === 'white' ? 'black' : 'white')
    : playerOrientation;
  const difficultyChoices = difficultyOptions ?? DIFFICULTIES;
  const difficultyName = difficultyChoices.find((d) => d.id === difficultyId)?.label
    ?? difficultyById(difficultyId).label;
  const startMoveNumber = Number(currentLesson.startFen.split(' ')[5] ?? '1');
  const analyzing = phase === 'preparing' || phase === 'engineThinking';
  const introThread = lessonFollowUpThreadId('intro');
  const showingIntro = activeRoundIndex < 0;
  const hasActiveRound = activeRoundIndex >= 0 && activeRoundIndex < roundsCount;
  const streamingThisRound = hasActiveRound && commentaryStreaming && activeRoundIndex === roundsCount - 1;
  const showIntroFollowUp = showingIntro && hasIntro && !introStreaming;
  const showRoundFollowUp = hasActiveRound && hasActiveRoundCommentary && !streamingThisRound;
  const composerThread = showingIntro ? introThread : (hasActiveRound ? lessonFollowUpThreadId('round', activeRoundIndex) : null);
  const showComposer = Boolean((showIntroFollowUp || showRoundFollowUp) && composerThread);
  const boardHintArrow = isLive && phase === 'userTurn' ? hintArrow : null;

  const hasCandidates = showCandidates && !!enginePv && enginePv.lines.length > 0;
  const leftPanel = hasCandidates ? (
    <EngineLinesPanel baseFen={enginePv!.baseFen} lines={enginePv!.lines} orientation={orientation} />
  ) : undefined;

  return (
    <>
    <TrainerLayout
      storageKey="lesson"
      detailDefault={hasKey ? 'half' : 'collapsed'}
      collapsedAction={!hasKey ? <MissingKeyEmpty compact onConfigure={() => setSettingsOpen(true)} /> : undefined}
      header={
        <header>
          <div className="trainer-nav text-sm">
            <div className="trainer-nav-start">
              <NavBack onClick={onBack}>{backLabel}</NavBack>
            </div>
          </div>
          <h1 className="sr-only">{currentLesson.title}</h1>
          <button
            type="button"
            className="lesson-summary"
            aria-haspopup="dialog"
            aria-expanded={contextOpen}
            onClick={() => setContextOpen(true)}
          >
            <span className="lesson-summary-text">
              <span className="lesson-summary-title">{currentLesson.title}</span>
              <span className="lesson-summary-meta"> · {difficultyName}</span>
            </span>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true">
              <path fill="currentColor" d="M4.2 6.2 8 10l3.8-3.8 1.1 1.1L8 12.2 3.1 7.3l1.1-1.1Z" />
            </svg>
          </button>
          <Sheet open={contextOpen} onClose={() => setContextOpen(false)} title={currentLesson.title} titleId="lesson-setup-title">
            <p className="mb-4 text-sm leading-relaxed text-muted">{currentLesson.theme}</p>
            <h3 className="mb-2 text-sm font-semibold text-ink">{difficultyLabel}</h3>
            <div className="mb-5 flex flex-wrap gap-2">
              {difficultyChoices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`btn btn-sm ${d.id === difficultyId ? 'btn-on' : 'text-muted'}`}
                  aria-pressed={d.id === difficultyId}
                  onClick={() => onDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <h3 className="mb-2 text-sm font-semibold text-ink">会话</h3>
            <SessionList
              kind="lesson"
              onSwitch={(sid) => {
                void switchLessonSession(sid, lesson, difficultyById(difficultyId));
                setContextOpen(false);
              }}
              onNew={() => {
                void newLessonSession(lesson, difficultyById(difficultyId));
                setContextOpen(false);
              }}
              onSaveAs={(title) => {
                const gs = useGameSessions.getState();
                const from = gs.activeLessonId;
                if (!from) return;
                const snap = store.getState().exportSnapshot();
                if (snap) gs.saveLessonSnapshot(from, snap);
                const id = gs.saveAsLesson(from, title);
                if (id) void switchLessonSession(id, lesson, difficultyById(difficultyId));
                setContextOpen(false);
              }}
            />
          </Sheet>
        </header>
      }
      board={
        <div className="grid h-full min-h-0 w-full grid-rows-[minmax(0,1fr)_auto] gap-1.5 overflow-hidden">
          <div className="min-h-0 min-w-0">
              <Board
                fen={viewed.fen}
                orientation={orientation}
                interactive={canPlayHere}
                annotations={visibleAnnotations}
                hintArrow={boardHintArrow}
                hoverFocus={hoverFocus}
                lastMove={viewed.lastMove}
                onMove={onBoardMove}
                onBackgroundTap={onBackgroundTap}
              />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
          {(showAnnotations || (assessmentMarks && (assessmentMarks.arrows.length > 0 || assessmentMarks.squares.length > 0))) && (
            <div className="shrink-0">
              <AnnotationLegend annotations={visibleAnnotations} showHint={isLive && phase === 'userTurn' && !!hintArrow} />
            </div>
          )}
          <div className="shrink-0">
            <EvalBar cp={evalCp} playerIsWhite={currentLesson.playerColor === 'w'} />
          </div>
          <BoardToolbar>
            <button
              type="button"
              className="btn btn-sm"
              disabled={ply <= 0}
              aria-label="上一步"
              title={ply <= 0 ? '已经是起始局面' : '上一步'}
              onClick={() => stepReview('back')}
            >
              ←
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={isLive}
              aria-label="下一步"
              title={isLive ? '已经是最新局面' : '下一步'}
              onClick={() => stepReview('forward')}
            >
              →
            </button>
            <ToolToggle
              pressed={showAnnotations}
              disabled={!boardAnnotations}
              title={!boardAnnotations ? '还没有分析' : undefined}
              onClick={() => setShowAnnotations((v) => !v)}
            >
              分析
            </ToolToggle>
            <BoardMoreMenu
              items={[
                {
                  id: 'candidates',
                  label: '候选',
                  pressed: showCandidates,
                  onClick: () => setShowCandidates((v) => !v),
                },
                {
                  id: 'assessment',
                  label: '局面',
                  pressed: showAssessment,
                  disabled: !hasKey,
                  reason: !hasKey ? '请先配置 API Key' : undefined,
                  onClick: () => setShowAssessment((v) => !v),
                },
                {
                  id: 'flip',
                  label: '翻转',
                  pressed: flipped,
                  onClick: () => setFlipped((v) => !v),
                },
                {
                  id: 'takeback',
                  label: '退一步',
                  disabled: !canTakeback,
                  reason: !canTakeback ? '没有可退的一手' : undefined,
                  onClick: () => void onTakeback(),
                },
              ]}
            />
          </BoardToolbar>
          <BoardStatus error={engineError}>
              {!isLive && canPlayHere && '回看中 · 点子或拖子改走（之后着法将丢弃）'}
              {!isLive && !canPlayHere && '回看中 · 轮到对方'}
              {isLive && phase === 'preparing' && '引擎分析中…可继续走'}
              {isLive && phase === 'engineThinking' && '引擎思考中…'}
              {isLive && phase === 'userTurn' && '轮到你走 · 点子或拖子'}
              {isLive && phase === 'finished' && '训练结束'}
              {showCandidates && !hasCandidates && (analyzing ? ' · 候选分析中…' : ' · 这一步暂无候选')}
          </BoardStatus>
          {history.length > 0 && (
            <div className="lesson-moves max-h-28 shrink-0 overflow-y-auto">
              <MoveList
                history={history}
                startMoveNumber={startMoveNumber}
                blackFirst={sideToMove(currentLesson.startFen) === 'b'}
                selectedPly={ply}
                onSelectPly={onSelectPly}
              />
            </div>
          )}
          </div>
        </div>
      }
      leftPanel={leftPanel}
      panels={[
        {
          id: 'guide',
          label: '讲解',
          disabled: !hasKey,
          content: (
            <div className="flex min-h-0 flex-col">
              <div className="shrink-0 border-b border-line px-3 py-2">
                <h2 className="text-sm font-semibold text-ink">{currentLesson.title}</h2>
                <p className="text-xs text-muted">{currentLesson.theme}</p>
              </div>
              {phase !== 'finished' && hasKey && (
                <div className="shrink-0 border-b border-line px-3 py-2">
                  <LessonHint store={store} disabled={!isLive || phase !== 'userTurn'} />
                </div>
              )}
              {phase === 'finished' && hasResult && (
                <div className="shrink-0 border-b border-line px-3 py-2">
                  <LessonSummary
                    store={store}
                    onRestart={() => void newLessonSession(lesson, difficultyById(difficultyId))}
                    onBack={onBack}
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {!hasKey && (
                  <div className="mb-3">
                    <MissingKeyEmpty onConfigure={() => setSettingsOpen(true)} />
                  </div>
                )}
                {showAssessment && hasKey && (
                  <div className="mb-3">
                    <LessonAssessment
                      store={store}
                      viewedFen={viewed.fen}
                      historyUpToPly={historyUpToPly}
                      onFocus={setHoverFocus}
                      focusMode={focusMode}
                      activeFocus={hoverFocus}
                    />
                  </div>
                )}
                <LessonCommentary
                  store={store}
                  activeRoundIndex={activeRoundIndex}
                  onSelectRound={onSelectRound}
                  onFocus={setHoverFocus}
                  focusMode={focusMode}
                  activeFocus={hoverFocus}
                  suppressKeyError={!hasKey}
                />
              </div>
            </div>
          ),
        },
      ]}
      footer={showComposer && composerThread ? (
        <LessonFollowUpComposer store={store} threadId={composerThread} />
      ) : undefined}
    />
    {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
