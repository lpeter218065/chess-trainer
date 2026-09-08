import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { getExploreStore, useExplore, switchExploreSession, newExploreSession } from '../store/exploreInstance';
import { useGameSessions } from '../store/gameSessions';
import { SessionBar } from '../components/SessionBar';
import type { ExploreState } from '../store/explore';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { VariationMoveList } from '../components/MoveList';
import { AnnotationLegend } from '../components/AnnotationLegend';
import { EngineLinesPanel } from '../components/EngineLinesPanel';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { useSettings } from '../store/settings';
import { annotationsFromAnalysis, annotationsFromFocus, mergeAnnotations } from '../chess/annotations';
import { focusFromText } from '../chess/commentaryMarkers';
import { fenAfterPlies, formatEval, navigatePly, sideToMove, uciToSan, type PlyNav } from '../chess/notation';
import { pathSans, type MoveNodeId } from '../chess/moveTree';
import { scoreToCp } from '../chess/quality';
import { exploreFollowUpThreadId } from '../llm/prompts';
import { START_FEN } from '../chess/pgn';
import { LoadingScreen } from '../components/LoadingScreen';
import { BoardToolbar, ToolToggle } from '../components/BoardToolbar';
import { TrainerLayout } from '../components/layout/TrainerLayout';
import { useHasHover } from '../platform';
import type { CommentaryFocusMode } from '../components/AnnotatedCommentary';
import { ExploreCommentary, useExploreCommentaryPresence } from '../components/explore/ExploreCommentary';
import { ExploreAssessment } from '../components/explore/ExploreAssessment';
import { ExploreFollowUpComposer } from '../components/explore/ExploreFollowUpComposer';

function keyToNav(key: string): PlyNav | null {
  if (key === 'ArrowLeft') return 'back';
  if (key === 'ArrowRight') return 'forward';
  if (key === 'ArrowUp' || key === 'Home') return 'start';
  if (key === 'ArrowDown' || key === 'End') return 'end';
  return null;
}

export function ExplorePage() {
  const [store, setStore] = useState<StoreApi<ExploreState> | null>(null);
  const [status, setStatus] = useState('正在加载引擎…');
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gs = useGameSessions.getState();
        let s: StoreApi<ExploreState>;
        if (sessionParam && gs.metas[sessionParam]?.kind === 'explore') {
          s = await switchExploreSession(sessionParam);
          if (!cancelled) setSearchParams({}, { replace: true });
        } else {
          s = await getExploreStore();
        }
        if (!cancelled) setStore(s);
      } catch (e) {
        if (!cancelled) setStatus(`引擎加载失败：${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionParam, setSearchParams]);

  if (!store) return <LoadingScreen message={status} />;
  return <ExploreView store={store} />;
}

export function ExploreView({ store }: { store: StoreApi<ExploreState> }) {
  // 细粒度订阅：讲解 / 追问 / 局面判断的流式文本都由自订阅组件消费，
  // 页面只订阅结构性字段，流式刷新时不重渲染棋盘、候选与着法列表。
  const tree = useExplore(store, (x) => x.tree);
  const path = useExplore(store, (x) => x.path);
  const startFen = useExplore(store, (x) => x.startFen);
  const reviewDepth = useExplore(store, (x) => x.reviewDepth);
  const analysis = useExplore(store, (x) => x.analysis);
  const evalCp = useExplore(store, (x) => x.evalCp);
  const analyzing = useExplore(store, (x) => x.analyzing);
  const orientation = useExplore(store, (x) => x.orientation);
  const error = useExplore(store, (x) => x.error);
  const llmStreaming = useExplore(store, (x) => x.llmStreaming);
  const assessmentStreaming = useExplore(store, (x) => x.assessmentStreaming);
  // 棋盘标记需要局面判断的文本；局面判断是低频操作，接受它触发页面重渲染
  const assessment = useExplore(store, (x) => x.assessment);
  const assessmentFen = useExplore(store, (x) => x.assessmentFen);
  const llmError = useExplore(store, (x) => x.llmError);
  const commentaryHistory = useExplore(store, useShallow((x) => x.commentaryHistory()));

  const [showAnnotations, setShowAnnotations] = useState(false);
  const [pgnInput, setPgnInput] = useState('');
  const [fenInput, setFenInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [hoverFocus, setHoverFocus] = useState<CommentaryFocus | null>(null);
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const focusMode: CommentaryFocusMode = useHasHover() ? 'hover' : 'tap';
  const hasKey = useSettings((st) => Boolean(st.llm.apiKey));

  const history = useMemo(() => pathSans(tree, path), [tree, path]);
  // 与 store 的 viewedPly() / isLive() 同义，改为本地计算以免订阅整个 store
  const livePly = path.length;
  const ply = reviewDepth === null ? livePly : Math.min(reviewDepth, livePly);
  const isLive = reviewDepth === null || reviewDepth >= livePly;
  const selectedNodeId = ply > 0 ? path[ply - 1] ?? null : null;
  const pathKey = path.join(',');

  // 只订阅「本步有没有讲解」而不是讲解正文，流式追加不会让页面重渲染
  const hasCommentaryAtPly = useExploreCommentaryPresence(store, ply);
  const hasSavedCommentaryAtPly = useExplore(store, (x) =>
    Boolean(x.commentaries[exploreFollowUpThreadId(x.path, x.viewedPly())]?.text),
  );

  const viewed = useMemo(
    () => fenAfterPlies(startFen, history, ply),
    [startFen, history, ply],
  );

  const boardAnnotations = useMemo(
    () => (analysis ? annotationsFromAnalysis(analysis) : null),
    [analysis],
  );
  const assessmentMarks = useMemo(() => {
    if (!showAssessment || !assessment || assessmentFen !== viewed.fen) return null;
    return annotationsFromFocus(focusFromText(assessment));
  }, [showAssessment, assessment, assessmentFen, viewed.fen]);

  // 关掉「显示分析」时固定传 null，避免 boardAnnotations 变化打断棋盘 memo
  const shownAnnotations = showAnnotations ? boardAnnotations : null;
  const visibleAnnotations = useMemo(
    () => mergeAnnotations(shownAnnotations, assessmentMarks),
    [shownAnnotations, assessmentMarks],
  );

  const currentThreadId = exploreFollowUpThreadId(path, ply);

  useEffect(() => {
    setShowAnnotations(false);
    setHoverFocus(null);
    setHistoryOpen(false);
    // keep commentaryOpen if this ply already has saved commentary
    setCommentaryOpen(hasSavedCommentaryAtPly);
  }, [ply, livePly, pathKey, hasSavedCommentaryAtPly]);

  const showCommentary = hasCommentaryAtPly || commentaryOpen || (llmStreaming && !assessmentStreaming);

  useEffect(() => {
    if (!showAssessment || !hasKey) return;
    const side = store.getState().assessmentSide ?? sideToMove(viewed.fen);
    void store.getState().requestAssessment(side);
  }, [showAssessment, viewed.fen, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const nav = keyToNav(e.key);
      if (!nav) return;
      e.preventDefault();
      const next = navigatePly(ply, livePly, nav);
      store.getState().setReviewDepth(next >= livePly ? null : next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, livePly, store]);

  const engineLines = useMemo(() => {
    if (!analysis) return [];
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
  }, [analysis]);

  const importPgn = () => {
    if (!store.getState().importPgn(pgnInput)) {
      setImportError('无法解析 PGN，请检查格式');
      return;
    }
    setImportError(null);
    setPgnInput('');
  };

  const loadFen = () => {
    if (!store.getState().loadFen(fenInput)) {
      setImportError('无效的 FEN');
      return;
    }
    setImportError(null);
    setFenInput('');
  };

  const stepReview = (nav: PlyNav) => {
    const next = navigatePly(ply, livePly, nav);
    store.getState().setReviewDepth(next >= livePly ? null : next);
  };

  const onBoardMove = useCallback(
    (from: string, to: string, promotion?: string) => store.getState().makeMove(from, to, promotion),
    [store],
  );
  const onBackgroundTap = useCallback(() => setHoverFocus(null), []);
  const onSelectNode = useCallback((id: MoveNodeId) => store.getState().selectNode(id), [store]);

  const showComposer = Boolean(showCommentary && hasCommentaryAtPly && !llmStreaming);

  const leftPanel = showCandidates ? (
    <EngineLinesPanel
      baseFen={analysis?.fen ?? viewed.fen}
      lines={engineLines}
      orientation={orientation}
      analyzing={analyzing}
    />
  ) : undefined;

  return (
    <TrainerLayout
      storageKey="explore-v2"
      footerPanelId="analysis"
      header={
        <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link className="inline-flex min-h-11 items-center text-felt underline-offset-4 hover:underline" to="/">← 返回</Link>
          <span className="font-display font-semibold text-ink">自由探索</span>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/analyses" className="btn text-xs">我的分析</Link>
            <SessionBar
              kind="explore"
              onSwitch={(id) => void switchExploreSession(id)}
              onNew={() => void newExploreSession()}
              onSaveAs={(title) => {
                const gs = useGameSessions.getState();
                const from = gs.activeExploreId;
                if (!from) return;
                gs.saveExploreSnapshot(from, store.getState().exportSnapshot());
                const id = gs.saveAsExplore(from, title);
                if (id) void switchExploreSession(id);
              }}
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
                interactive
                annotations={visibleAnnotations}
                hintArrow={null}
                hoverFocus={hoverFocus}
                lastMove={viewed.lastMove}
                onMove={onBoardMove}
                onBackgroundTap={onBackgroundTap}
              />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
          {(showAnnotations || (assessmentMarks && (assessmentMarks.arrows.length > 0 || assessmentMarks.squares.length > 0))) && (
            <div className="shrink-0">
              <AnnotationLegend annotations={visibleAnnotations} showHint={false} />
            </div>
          )}
          <div className="shrink-0">
            <EvalBar cp={evalCp} playerIsWhite={true} />
          </div>
          <BoardToolbar>
            <button type="button" className="btn btn-sm" disabled={ply <= 0} aria-label="上一步" onClick={() => stepReview('back')}>←</button>
            <button type="button" className="btn btn-sm" disabled={isLive} aria-label="下一步" onClick={() => stepReview('forward')}>→</button>
            <ToolToggle
              pressed={showAnnotations}
              disabled={!boardAnnotations}
              title={!boardAnnotations ? (analyzing ? '引擎分析完成后可显示箭头' : '还没有分析') : undefined}
              onClick={() => setShowAnnotations((v) => !v)}
            >
              {showAnnotations ? '隐藏分析' : '显示分析'}
            </ToolToggle>
            <ToolToggle
              pressed={showCandidates}
              onClick={() => setShowCandidates((v) => !v)}
            >
              候选招法
            </ToolToggle>
            <ToolToggle
              pressed={showAssessment}
              disabled={!hasKey}
              title={!hasKey ? '请先在设置中配置 API Key' : undefined}
              onClick={() => setShowAssessment((v) => !v)}
            >
              局面判断
            </ToolToggle>
            <button type="button" className="btn btn-sm" onClick={() => store.getState().setOrientation(orientation === 'white' ? 'black' : 'white')}>
              翻转
            </button>
            <span className="min-w-0 truncate text-xs text-muted">
              {analyzing && '引擎分析中，可继续走棋'}
              {!analyzing && isLive && '点子或拖子均可 · 走子后自动分析'}
              {!analyzing && !isLive && '回看中 · 走子将进入变着'}
              {error && <span className="ml-2 text-danger" role="alert">{error}</span>}
            </span>
          </BoardToolbar>
          </div>
        </div>
      }
      leftPanel={leftPanel}
      panels={[
        {
          id: 'analysis',
          label: '讲解与着法',
          content: (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <section className="flex min-h-0 flex-[1.2] flex-col overflow-hidden border-b border-line p-3">
                <div className="relative mb-2 flex shrink-0 items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">局面讲解</h2>
                  <div className="flex items-center gap-1">
                    {commentaryHistory.length > 1 && (
                      <button
                        type="button"
                        className={`btn btn-sm ${historyOpen ? 'btn-on' : ''}`}
                        aria-expanded={historyOpen}
                        onClick={() => setHistoryOpen((v) => !v)}
                      >
                        历史 {commentaryHistory.length}
                      </button>
                    )}
                    {llmStreaming && (
                      <span className="text-xs text-muted">{analyzing ? '等待引擎…' : '生成中…'}</span>
                    )}
                    {hasSavedCommentaryAtPly && !llmStreaming && (
                      <button
                        type="button"
                        className="btn btn-sm text-muted"
                        disabled={!hasKey}
                        title="分叉无关：强制新开本局面的 GPT session"
                        onClick={() => {
                          setCommentaryOpen(true);
                          void store.getState().requestCommentary({ forceNew: true });
                        }}
                      >
                        重新推理
                      </button>
                    )}
                  </div>
                  {historyOpen && commentaryHistory.length > 1 && (
                    <ul className="menu absolute left-0 right-0 top-full z-10 mt-1.5 max-h-36 py-1">
                      {commentaryHistory.map((entry) => {
                        const active = entry.threadId === currentThreadId;
                        return (
                          <li key={entry.threadId}>
                            <button
                              type="button"
                              className={`w-full px-3 py-2 text-left text-xs ${active ? 'bg-felt-fg' : 'hover:bg-cream/40'}`}
                              onClick={() => {
                                store.getState().goToCommentary(entry.threadId);
                                setHistoryOpen(false);
                              }}
                            >
                              <span className="block truncate font-mono text-ink">{entry.sansLabel}</span>
                              <span className="line-clamp-1 text-muted">{entry.text.replace(/\n/g, ' ').slice(0, 80)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {showAssessment && (
                    <div className="mb-3">
                      <ExploreAssessment
                        store={store}
                        viewedFen={viewed.fen}
                        onFocus={setHoverFocus}
                        focusMode={focusMode}
                        activeFocus={hoverFocus}
                      />
                    </div>
                  )}
                  {!hasKey && <p className="text-xs text-muted">请先在首页设置中配置 API Key，才能生成讲解</p>}
                  {showCommentary ? (
                    <ExploreCommentary
                      store={store}
                      ply={ply}
                      hasKey={hasKey}
                      onFocus={setHoverFocus}
                      focusMode={focusMode}
                      activeFocus={hoverFocus}
                    />
                  ) : (
                    <>
                      {hasKey && (
                        <div className="flex flex-col items-start gap-2">
                          <p className="text-sm text-muted">还没有这步的讲解。切回已讲过的局面会自动显示历史。</p>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={llmStreaming}
                            onClick={() => {
                              setCommentaryOpen(true);
                              void store.getState().requestCommentary();
                            }}
                          >
                            {llmStreaming ? '生成中…' : '生成本局面讲解'}
                          </button>
                        </div>
                      )}
                      {llmError && <p className="mt-2 text-xs text-danger" role="alert">{llmError}</p>}
                    </>
                  )}
                </div>
              </section>
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <h2 className="mb-2 shrink-0 text-sm font-semibold text-ink">着法</h2>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <VariationMoveList
                    tree={tree}
                    startFen={startFen}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={onSelectNode}
                  />
                </div>
                <p className="mt-2 shrink-0 text-[11px] text-muted">← → 回退/前进 · 回退后可走变着</p>
              </section>
            </div>
          ),
        },
        {
          id: 'import',
          label: '导入',
          content: (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
              <label htmlFor="pgn-input" className="text-sm font-medium text-ink">PGN</label>
              <textarea
                id="pgn-input"
                className="field min-h-32 flex-1 resize-none font-mono text-xs"
                placeholder={'粘贴 PGN，例如：\n1. e4 e5 2. Nf3 Nc6 3. Bb5'}
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
              />
              <button type="button" className="btn btn-primary shrink-0" onClick={importPgn}>
                导入 PGN
              </button>
              <label htmlFor="fen-input" className="mt-2 text-sm font-medium text-ink">FEN</label>
              <input
                id="fen-input"
                className="field font-mono text-xs"
                placeholder={START_FEN}
                value={fenInput}
                onChange={(e) => setFenInput(e.target.value)}
              />
              <button type="button" className="btn shrink-0" onClick={loadFen}>
                加载 FEN
              </button>
              {importError && <p className="text-xs text-danger" role="alert">{importError}</p>}
            </div>
          ),
        },
      ]}
      footer={showComposer ? <ExploreFollowUpComposer store={store} hasKey={hasKey} /> : undefined}
    />
  );
}
