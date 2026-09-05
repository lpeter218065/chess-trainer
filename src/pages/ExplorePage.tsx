import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { getExploreStore, useExplore, switchExploreSession, newExploreSession } from '../store/exploreInstance';
import { useGameSessions } from '../store/gameSessions';
import { SessionBar } from '../components/SessionBar';
import type { ExploreState } from '../store/explore';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { VariationMoveList } from '../components/MoveList';
import { AnnotationLegend } from '../components/AnnotationLegend';
import { AnnotatedCommentary } from '../components/AnnotatedCommentary';
import { EngineLinesPanel } from '../components/EngineLinesPanel';
import type { CommentaryFocus } from '../chess/commentaryMarkers';
import { useSettings } from '../store/settings';
import { annotationsFromAnalysis, annotationsFromFocus, mergeAnnotations } from '../chess/annotations';
import { AssessmentPanel } from '../components/AssessmentPanel';
import { focusFromText } from '../chess/commentaryMarkers';
import { fenAfterPlies, formatEval, navigatePly, sideToMove, uciToSan, type PlyNav } from '../chess/notation';
import { pathSans } from '../chess/moveTree';
import { scoreToCp } from '../chess/quality';
import { FollowUpChat, FollowUpComposer } from '../components/FollowUpChat';
import { exploreFollowUpThreadId } from '../llm/prompts';
import { START_FEN } from '../chess/pgn';
import { LoadingScreen } from '../components/LoadingScreen';
import { BoardToolbar, ToolToggle } from '../components/BoardToolbar';
import { TrainerLayout } from '../components/layout/TrainerLayout';
import { useHasHover } from '../platform';
import type { CommentaryFocusMode } from '../components/AnnotatedCommentary';

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

function ExploreView({ store }: { store: StoreApi<ExploreState> }) {
  const s = useExplore(store, (x) => x);
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

  const history = useMemo(() => pathSans(s.tree, s.path), [s.tree, s.path]);
  const ply = s.viewedPly();
  const isLive = s.isLive();
  const livePly = s.path.length;
  const selectedNodeId = ply > 0 ? s.path[ply - 1] ?? null : null;
  const pathKey = s.path.join(',');

  const viewed = useMemo(
    () => fenAfterPlies(s.startFen, history, ply),
    [s.startFen, history, ply],
  );

  const boardAnnotations = useMemo(
    () => (s.analysis ? annotationsFromAnalysis(s.analysis) : null),
    [s.analysis],
  );
  const assessmentMarks = useMemo(() => {
    if (!showAssessment || !s.assessment || s.assessmentFen !== viewed.fen) return null;
    return annotationsFromFocus(focusFromText(s.assessment));
  }, [showAssessment, s.assessment, s.assessmentFen, viewed.fen]);

  const visibleAnnotations = mergeAnnotations(
    showAnnotations ? boardAnnotations : null,
    assessmentMarks,
  );

  const commentaryForPly = useMemo(() => {
    const tid = exploreFollowUpThreadId(s.path, ply);
    if (s.llmStreaming && s.commentaryPly === ply) return s.commentary;
    return s.commentaries[tid]?.text || (s.commentaryPly === ply ? s.commentary : '');
  }, [s.path, ply, s.commentaries, s.commentary, s.commentaryPly, s.llmStreaming]);

  const commentaryHistory = useMemo(() => s.commentaryHistory(), [s.commentaries]);
  const currentThreadId = exploreFollowUpThreadId(s.path, ply);

  useEffect(() => {
    setShowAnnotations(false);
    setHoverFocus(null);
    setHistoryOpen(false);
    // keep commentaryOpen if this ply already has saved commentary
    const tid = exploreFollowUpThreadId(s.path, ply);
    setCommentaryOpen(Boolean(s.commentaries[tid]?.text));
  }, [ply, livePly, pathKey, s.commentaries]);

  const showCommentary = commentaryOpen || (s.llmStreaming && !s.assessmentStreaming) || commentaryForPly.length > 0;

  useEffect(() => {
    if (!showAssessment || !hasKey) return;
    const side = s.assessmentSide ?? sideToMove(viewed.fen);
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
      s.setReviewDepth(next >= livePly ? null : next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, livePly, s]);

  const engineLines = useMemo(() => {
    if (!s.analysis) return [];
    return s.analysis.lines.slice(0, 3).map((l, i) => {
      const cp = scoreToCp(l.score);
      const whiteCp = sideToMove(s.analysis!.fen) === 'w' ? cp : -cp;
      return {
        label: `PV${i + 1}`,
        uci: l.pv.slice(0, 6),
        moves: uciToSan(s.analysis!.fen, l.pv.slice(0, 6)),
        evalText: formatEval(whiteCp),
      };
    });
  }, [s.analysis]);

  const importPgn = () => {
    if (!s.importPgn(pgnInput)) {
      setImportError('无法解析 PGN，请检查格式');
      return;
    }
    setImportError(null);
    setPgnInput('');
  };

  const loadFen = () => {
    if (!s.loadFen(fenInput)) {
      setImportError('无效的 FEN');
      return;
    }
    setImportError(null);
    setFenInput('');
  };

  const stepReview = (nav: PlyNav) => {
    const next = navigatePly(ply, livePly, nav);
    s.setReviewDepth(next >= livePly ? null : next);
  };

  const focusProps = { focusMode, activeFocus: hoverFocus };
  const showComposer = Boolean(showCommentary && commentaryForPly && !s.llmStreaming);

  const leftPanel = showCandidates ? (
    s.analysis && engineLines.length > 0 ? (
      <EngineLinesPanel baseFen={s.analysis.fen} lines={engineLines} orientation={s.orientation} />
    ) : (
      <div className="flex h-full min-h-[12rem] flex-col gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
            {s.analyzing ? `PV${n} 分析中…` : `PV${n} · 走子后会出现候选`}
          </div>
        ))}
      </div>
    )
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
                orientation={s.orientation}
                interactive
                annotations={visibleAnnotations}
                hintArrow={null}
                hoverFocus={hoverFocus}
                lastMove={viewed.lastMove}
                onMove={(f, t, p) => s.makeMove(f, t, p)}
                onBackgroundTap={() => setHoverFocus(null)}
              />
          </div>
          <div className="flex min-h-0 flex-col gap-1.5">
          {(showAnnotations || (assessmentMarks && (assessmentMarks.arrows.length > 0 || assessmentMarks.squares.length > 0))) && (
            <div className="shrink-0">
              <AnnotationLegend annotations={visibleAnnotations} showHint={false} />
            </div>
          )}
          <div className="shrink-0">
            <EvalBar cp={s.evalCp} playerIsWhite={true} />
          </div>
          <BoardToolbar>
            <ToolToggle
              pressed={showAnnotations}
              disabled={!boardAnnotations}
              title={!boardAnnotations ? (s.analyzing ? '引擎分析完成后可显示箭头' : '还没有分析') : undefined}
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
            <button type="button" className="btn btn-sm" onClick={() => s.setOrientation(s.orientation === 'white' ? 'black' : 'white')}>
              翻转
            </button>
            <button type="button" className="btn btn-sm" disabled={ply <= 0} aria-label="上一步" onClick={() => stepReview('back')}>←</button>
            <button type="button" className="btn btn-sm" disabled={isLive} aria-label="下一步" onClick={() => stepReview('forward')}>→</button>
            <span className="min-w-0 truncate text-xs text-muted">
              {s.analyzing && '引擎分析中，可继续走棋'}
              {!s.analyzing && isLive && '点子或拖子均可 · 走子后自动分析'}
              {!s.analyzing && !isLive && '回看中 · 走子将进入变着'}
              {s.error && <span className="ml-2 text-danger" role="alert">{s.error}</span>}
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
                    {s.llmStreaming && (
                      <span className="text-xs text-muted">{s.analyzing ? '等待引擎…' : '生成中…'}</span>
                    )}
                    {!!s.commentaries[currentThreadId]?.text && !s.llmStreaming && (
                      <button
                        type="button"
                        className="btn btn-sm text-muted"
                        disabled={!hasKey}
                        title="分叉无关：强制新开本局面的 GPT session"
                        onClick={() => {
                          setCommentaryOpen(true);
                          void s.requestCommentary({ forceNew: true });
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
                                s.goToCommentary(entry.threadId);
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
                      <AssessmentPanel
                        side={s.assessmentSide ?? sideToMove(viewed.fen)}
                        text={s.assessmentFen === viewed.fen ? s.assessment : ''}
                        streaming={s.assessmentStreaming}
                        error={s.assessmentStreaming ? null : s.llmError}
                        onSide={(side) => { void s.requestAssessment(side); }}
                        onFocus={setHoverFocus}
                        {...focusProps}
                      />
                    </div>
                  )}
                  {!hasKey && <p className="text-xs text-muted">请先在首页设置中配置 API Key，才能生成讲解</p>}
                  {showCommentary ? (
                    <AnnotatedCommentary
                      text={commentaryForPly}
                      streaming={s.llmStreaming && !s.assessmentStreaming && s.commentaryPly === ply}
                      placeholder=""
                      onFocus={setHoverFocus}
                      {...focusProps}
                    />
                  ) : (
                    hasKey && (
                      <div className="flex flex-col items-start gap-2">
                        <p className="text-sm text-muted">还没有这步的讲解。切回已讲过的局面会自动显示历史。</p>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={s.llmStreaming}
                          onClick={() => {
                            setCommentaryOpen(true);
                            void s.requestCommentary();
                          }}
                        >
                          {s.llmStreaming ? '生成中…' : '生成本局面讲解'}
                        </button>
                      </div>
                    )
                  )}
                  {s.llmError && <p className="mt-2 text-xs text-danger" role="alert">{s.llmError}</p>}
                  {showCommentary && commentaryForPly && !s.llmStreaming && (
                    <FollowUpChat
                      turns={s.followUps[currentThreadId] ?? []}
                      streaming={s.followUpStreaming && s.followUpThreadId === currentThreadId}
                      streamingText={s.followUpDraft}
                      disabled={!hasKey || s.llmStreaming}
                      error={s.followUpError}
                      onAsk={(q) => void s.askFollowUp(q)}
                      onFocus={setHoverFocus}
                      hideComposer
                      {...focusProps}
                    />
                  )}
                </div>
              </section>
              <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <h2 className="mb-2 shrink-0 text-sm font-semibold text-ink">着法</h2>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <VariationMoveList
                    tree={s.tree}
                    startFen={s.startFen}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={(id) => s.selectNode(id)}
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
      footer={showComposer ? (
        <FollowUpComposer
          disabled={!hasKey || s.llmStreaming || s.followUpStreaming}
          error={s.followUpError}
          onAsk={(q) => void s.askFollowUp(q)}
        />
      ) : undefined}
    />
  );
}
