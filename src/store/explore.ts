import { createStore, type StoreApi } from 'zustand/vanilla';
import { Chess } from 'chess.js';
import type { EnginePort } from '../engine/engineService';
import type { Analysis } from '../engine/stockfishWorker';
import type { LlmPort } from './session';
import type { ChatMessage } from '../llm/client';
import {
  buildAssessmentMessages,
  buildAssessmentContinueUser,
  buildExploreContinueUser,
  buildExploreMessages,
  buildFollowUpMessages,
  exploreFollowUpThreadId,
  LLM_MAX_TOKENS,
  type FollowUpTurn,
} from '../llm/prompts';
import { continueThread, recordAssistant } from '../llm/chatThread';
import { classifyMove, type Quality } from '../chess/quality';
import { scoreToCp } from '../chess/quality';
import { fenAfterPlies, sideToMove, uciToSan } from '../chess/notation';
import { evalAfterFromLines } from '../chess/evalFromLines';
import { START_FEN, parseFen, parsePgn } from '../chess/pgn';
import { createDebouncer, ANALYZE_DEBOUNCE_MS, LLM_DEBOUNCE_MS } from '../utils/debounce';
import { createStreamFlusher } from '../utils/streamFlusher';
import { debugLog } from '../debug/log';
import { tl } from '../i18n';
import {
  appendChild,
  createEmptyTree,
  findChildBySan,
  pathQualities,
  pathSans,
  pathToNode,
  setNodeQuality,
  treeFromSans,
  syncMoveTreeIdsFromTree,
  type MoveNodeId,
  type MoveTree,
} from '../chess/moveTree';
import type { ExploreSnapshot, CommentaryEntry } from './gameSessions';

export interface ExploreState {
  startFen: string;
  tree: MoveTree;
  /** Active line from root to tip */
  path: MoveNodeId[];
  /** null = tip of path; else depth along path (0 = start position) */
  reviewDepth: number | null;
  analysis: Analysis | null;
  evalCp: number;
  analyzing: boolean;
  orientation: 'white' | 'black';
  error: string | null;
  commentary: string;
  commentaryPly: number | null;
  commentaries: Record<string, CommentaryEntry>;
  llmStreaming: boolean;
  llmError: string | null;
  followUps: Record<string, FollowUpTurn[]>;
  followUpStreaming: boolean;
  followUpDraft: string;
  followUpError: string | null;
  followUpThreadId: string | null;
  assessment: string;
  assessmentSide: 'w' | 'b' | null;
  assessmentFen: string | null;
  assessmentStreaming: boolean;

  /** SAN along active path (full tip line) */
  history(): string[];
  qualities(): (Quality | null)[];
  viewedPly(): number;
  isLive(): boolean;
  currentFollowUpThreadId(): string;
  commentaryHistory(): CommentaryEntry[];
  loadStart(): void;
  loadFen(fen: string): boolean;
  importPgn(pgn: string): boolean;
  makeMove(from: string, to: string, promotion?: string): Promise<boolean>;
  setReviewDepth(depth: number | null): void;
  /** @deprecated alias of setReviewDepth for callers still using ply naming */
  setReviewPly(ply: number | null): void;
  selectNode(nodeId: MoveNodeId): void;
  goToCommentary(threadId: string): void;
  setOrientation(o: 'white' | 'black'): void;
  requestCommentary(opts?: { forceNew?: boolean }): Promise<void>;
  requestAssessment(side: 'w' | 'b', opts?: { forceNew?: boolean }): Promise<void>;
  askFollowUp(question: string): Promise<void>;
  exportSnapshot(): ExploreSnapshot;
  hydrateSnapshot(snap: ExploreSnapshot): void;
}

function whiteEval(analysis: Analysis): number {
  const line = analysis.lines.find((l) => l.multipv === 1) ?? analysis.lines[0];
  const cp = scoreToCp(line.score);
  return sideToMove(analysis.fen) === 'w' ? cp : -cp;
}

function sideEval(whiteCp: number, side: 'w' | 'b'): number {
  return side === 'w' ? whiteCp : -whiteCp;
}

export function createExploreStore(engine: EnginePort, llm: LlmPort, opts?: { llmDebounceMs?: number }): StoreApi<ExploreState> {
  let analyzeToken = 0;
  let displayedAnalysisAbort: AbortController | null = null;
  let llmAbort: AbortController | null = null;
  let followUpAbort: AbortController | null = null;
  const analyzeDebouncer = createDebouncer(ANALYZE_DEBOUNCE_MS);
  const assessmentDebouncer = createDebouncer(opts?.llmDebounceMs ?? LLM_DEBOUNCE_MS);
  /** 按局面 threadId 保存 GPT 对话，同线续写、分叉新开 */
  let llmThreads: Record<string, ChatMessage[]> = {};
  let assessmentThread: { side: 'w' | 'b'; messages: ChatMessage[] } | null = null;

  return createStore<ExploreState>((set, get, api) => {
    const cancelPending = () => {
      analyzeDebouncer.cancel();
      displayedAnalysisAbort?.abort();
      assessmentDebouncer.cancel();
      llmAbort?.abort();
      followUpAbort?.abort();
    };

    const threadIdNow = () => {
      const s = get();
      return exploreFollowUpThreadId(s.path, s.viewedPly());
    };

    const sansLabelAt = (path: MoveNodeId[], ply: number) => {
      const sans = pathSans(get().tree, path).slice(0, ply);
      if (sans.length === 0) return tl('session.startPosition');
      return sans.map((san, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}.${san}` : san)).join(' ');
    };

    const restoreCommentaryFor = (path: MoveNodeId[], depth: number | null) => {
      const ply = depth === null ? path.length : Math.min(depth, path.length);
      const tid = exploreFollowUpThreadId(path, ply);
      const entry = get().commentaries[tid];
      return {
        commentary: entry?.text ?? '',
        commentaryPly: entry ? ply : null,
      };
    };

    const activeSans = () => pathSans(get().tree, get().path);

    const analyzeDisplayedPosition = (fen: string, token: number) => {
      displayedAnalysisAbort?.abort();
      const controller = new AbortController();
      displayedAnalysisAbort = controller;
      const pending = engine.analyze(fen, 3, { signal: controller.signal });
      void pending.then((analysis) => {
        if (token !== analyzeToken || controller.signal.aborted) return;
        set({ analysis, evalCp: whiteEval(analysis), analyzing: false });
      }, (e: unknown) => {
        if (token !== analyzeToken || controller.signal.aborted) return;
        set({ analyzing: false, error: tl('error.analyze', { msg: (e as Error).message }) });
      });
      return pending;
    };

    const analyzeAtPlyNow = async (ply: number) => {
      const token = ++analyzeToken;
      const { startFen, path, tree } = get();
      const sans = pathSans(tree, path);
      const { fen } = fenAfterPlies(startFen, sans, ply);
      set({ analyzing: true, error: null });
      // Errors are published by analyzeDisplayedPosition; callers wait for settlement.
      await analyzeDisplayedPosition(fen, token).catch(() => undefined);
    };

    const scheduleAnalyzeAtPly = (ply: number) => {
      ++analyzeToken;
      displayedAnalysisAbort?.abort();
      set({ analyzing: true, analysis: null, error: null });
      analyzeDebouncer.schedule(() => void analyzeAtPlyNow(ply));
    };

    /** 等待当前进行中的引擎分析结束（不新开分析） */
    const whenNotAnalyzing = () =>
      new Promise<void>((resolve) => {
        if (!get().analyzing) return resolve();
        const unsub = api.subscribe((st) => {
          if (!st.analyzing) {
            unsub();
            resolve();
          }
        });
      });

    /**
     * 确保 store 里的分析对应 fen。分析中则等待；防抖等待或局面已切换则立刻跑一次。
     * 返回 false 表示没等到（被更新的分析抢占或失败）。
     */
    const ensureAnalysisFor = async (fen: string, ply: number, signal: AbortSignal): Promise<boolean> => {
      await whenNotAnalyzing();
      if (signal.aborted) return false;
      if (get().analysis?.fen !== fen) {
        analyzeDebouncer.cancel();
        await analyzeAtPlyNow(ply);
      }
      const a = get().analysis;
      return !signal.aborted && !!a && a.fen === fen && !get().analyzing;
    };

    const requestCommentaryNow = async (opts?: { forceNew?: boolean }) => {
      const forceNew = opts?.forceNew === true;
      const s0 = get();
      const ply = s0.viewedPly();
      const tid = exploreFollowUpThreadId(s0.path, ply);
      if (!forceNew && s0.commentaries[tid]?.text && !s0.llmStreaming) return;
      if (s0.llmStreaming && !forceNew && s0.commentaryPly === ply && !s0.assessmentStreaming) return;
      const pathAtRequest = [...s0.path];
      const { fen } = fenAfterPlies(s0.startFen, pathSans(s0.tree, s0.path), ply);
      llmAbort?.abort();
      followUpAbort?.abort();
      const ac = new AbortController();
      llmAbort = ac;
      set((st) => {
        const followUps = { ...st.followUps };
        const commentaries = { ...st.commentaries };
        delete followUps[tid];
        delete commentaries[tid];
        return {
          llmStreaming: true,
          llmError: null,
          commentary: '',
          commentaryPly: ply,
          followUps,
          commentaries,
          followUpStreaming: false,
          followUpDraft: '',
          followUpError: null,
          followUpThreadId: null,
          assessmentStreaming: false,
        };
      });

      debugLog('info', 'explore', `commentary ply=${ply}`);
      const flusher = createStreamFlusher((text) => set({ commentary: text, commentaryPly: ply }));
      try {
        if (!(await ensureAnalysisFor(fen, ply, ac.signal))) {
          if (!ac.signal.aborted) set({ llmError: tl('error.engineNoPv') });
          return;
        }
        const s = get();
        const analysis = s.analysis!;
        const sans = pathSans(s.tree, s.path).slice(0, ply);
        const qualities = pathQualities(s.tree, s.path).slice(0, ply);
        const ctx = {
          fen: analysis.fen,
          moveHistorySan: sans,
          moveQualities: qualities,
          evalCp: s.evalCp,
          sideToMove: sideToMove(analysis.fen),
          bestLinesSan: analysis.lines.map((l) => uciToSan(analysis.fen, l.pv.slice(0, 6))),
          focusPly: ply,
        };
        const bootstrap = buildExploreMessages(ctx);
        const parentId = ply > 0 ? exploreFollowUpThreadId(pathAtRequest, ply - 1) : null;
        const parentThread = !forceNew && parentId ? llmThreads[parentId] : undefined;
        const messages = continueThread(parentThread, buildExploreContinueUser(ctx), bootstrap);

        for await (const chunk of llm.stream(messages, { temperature: 0.7, signal: ac.signal, maxTokens: LLM_MAX_TOKENS.explore })) {
          if (ac.signal.aborted) break;
          flusher.push(chunk);
        }
        const acc = ac.signal.aborted ? flusher.text : flusher.finish();
        if (!ac.signal.aborted && acc) {
          llmThreads[tid] = recordAssistant(messages, acc);
          const pathToPos = pathAtRequest.slice(0, ply);
          const entry: CommentaryEntry = {
            threadId: tid,
            path: pathToPos,
            ply,
            text: acc,
            sansLabel: sansLabelAt(pathAtRequest, ply),
            updatedAt: new Date().toISOString(),
          };
          set((st) => ({
            commentaries: { ...st.commentaries, [tid]: entry },
            commentary: acc,
            commentaryPly: ply,
          }));
        }
      } catch (e) {
        debugLog('error', 'explore', `commentary ${(e as Error).message}`);
        if (!ac.signal.aborted) set({ llmError: tl('error.commentary', { msg: (e as Error).message }) });
      } finally {
        flusher.cancel();
        debugLog('info', 'explore', `commentary done streaming=${llmAbort === ac} chars=${flusher.text.length}`);
        if (llmAbort === ac) {
          llmAbort = null;
          set({ llmStreaming: false, assessmentStreaming: false });
        }
      }
    };

    const requestAssessmentNow = async (side: 'w' | 'b', opts?: { forceNew?: boolean }) => {
      const forceNew = opts?.forceNew === true;
      const s0 = get();
      const ply = s0.viewedPly();
      const { fen } = fenAfterPlies(s0.startFen, pathSans(s0.tree, s0.path), ply);
      if (!forceNew && s0.assessmentFen === fen && s0.assessmentSide === side && s0.assessment && !s0.assessmentStreaming) return;
      llmAbort?.abort();
      followUpAbort?.abort();
      const ac = new AbortController();
      llmAbort = ac;
      set({
        llmStreaming: true,
        assessmentStreaming: true,
        llmError: null,
        assessment: '',
        assessmentSide: side,
        assessmentFen: fen,
        followUpStreaming: false,
        followUpDraft: '',
        followUpThreadId: null,
      });
      const flusher = createStreamFlusher((text) => set({ assessment: text }));
      try {
        if (!(await ensureAnalysisFor(fen, ply, ac.signal))) {
          if (!ac.signal.aborted) set({ llmError: tl('error.engineNoAssess') });
          return;
        }
        const s = get();
        const analysis = s.analysis!;
        const sans = pathSans(s.tree, s.path).slice(0, ply);
        const ctx = {
          fen: analysis.fen,
          moveHistorySan: sans,
          evalCp: s.evalCp,
          sideToMove: sideToMove(analysis.fen),
          perspective: side,
          bestLinesSan: analysis.lines.map((l) => uciToSan(analysis.fen, l.pv.slice(0, 6))),
        };
        const bootstrap = buildAssessmentMessages(ctx);
        const prev = !forceNew && assessmentThread?.side === side ? assessmentThread.messages : undefined;
        const messages = continueThread(prev, buildAssessmentContinueUser(ctx), bootstrap);
        for await (const chunk of llm.stream(messages, { temperature: 0.5, signal: ac.signal, maxTokens: LLM_MAX_TOKENS.assessment })) {
          if (ac.signal.aborted) break;
          flusher.push(chunk);
        }
        const acc = ac.signal.aborted ? flusher.text : flusher.finish();
        if (!ac.signal.aborted && acc) {
          assessmentThread = { side, messages: recordAssistant(messages, acc) };
        }
      } catch (e) {
        if (!ac.signal.aborted) set({ llmError: tl('error.assessment', { msg: (e as Error).message }) });
      } finally {
        flusher.cancel();
        if (llmAbort === ac) {
          llmAbort = null;
          set({ llmStreaming: false, assessmentStreaming: false });
        }
      }
    };

    const askFollowUpNow = async (question: string) => {
      const q = question.trim();
      const s = get();
      if (!q || !s.analysis || s.llmStreaming || s.followUpStreaming || s.analyzing) return;
      const ply = s.viewedPly();
      const tid = threadIdNow();
      const primary = s.commentaries[tid]?.text || (s.commentaryPly === ply ? s.commentary : '');
      if (!primary) return;

      const prior = s.followUps[tid] ?? [];
      const sans = pathSans(s.tree, s.path).slice(0, ply);
      const bestLinesSan = s.analysis.lines.map((l) => uciToSan(s.analysis!.fen, l.pv.slice(0, 6)));
      const messages = buildFollowUpMessages({
        fen: s.analysis.fen,
        moveHistorySan: sans,
        evalCp: s.evalCp,
        sideToMove: sideToMove(s.analysis.fen),
        bestLinesSan,
        primaryCommentary: primary,
        turns: prior,
        question: q,
      });

      followUpAbort?.abort();
      const ac = new AbortController();
      followUpAbort = ac;
      set((st) => ({
        followUps: { ...st.followUps, [tid]: [...prior, { role: 'user', content: q }] },
        followUpStreaming: true,
        followUpDraft: '',
        followUpError: null,
        followUpThreadId: tid,
      }));

      const flusher = createStreamFlusher((text) => set({ followUpDraft: text, followUpThreadId: tid }));
      try {
        for await (const chunk of llm.stream(messages, { temperature: 0.7, signal: ac.signal, maxTokens: LLM_MAX_TOKENS.followUp, quick: true })) {
          if (ac.signal.aborted) break;
          flusher.push(chunk);
        }
        if (!ac.signal.aborted) {
          const acc = flusher.finish();
          set((st) => {
            const turns = [...(st.followUps[tid] ?? [])];
            turns.push({ role: 'assistant', content: acc });
            return {
              followUps: { ...st.followUps, [tid]: turns },
              followUpDraft: '',
              followUpStreaming: false,
              followUpThreadId: null,
            };
          });
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          set({ followUpStreaming: false, followUpDraft: '', followUpError: tl('error.followUp', { msg: (e as Error).message }), followUpThreadId: null });
        }
      } finally {
        flusher.cancel();
        if (followUpAbort === ac) followUpAbort = null;
        if (get().followUpStreaming) set({ followUpStreaming: false });
      }
    };

    const resetGame = (startFen: string, moves: string[] = []) => {
      cancelPending();
      llmThreads = {};
      assessmentThread = null;
      const tree = treeFromSans(moves);
      const path = moves.length === 0 ? [] : (() => {
        const ids: MoveNodeId[] = [];
        let children = tree.rootChildren;
        while (children.length) {
          const id = children[0];
          ids.push(id);
          children = tree.nodes[id].children;
        }
        return ids;
      })();
      set({
        startFen,
        tree,
        path,
        reviewDepth: null,
        analysis: null,
        evalCp: 0,
        error: null,
        commentary: '',
        commentaryPly: null,
        commentaries: {},
        llmStreaming: false,
        llmError: null,
        followUps: {},
        followUpStreaming: false,
        followUpDraft: '',
        followUpError: null,
        followUpThreadId: null,
        assessment: '',
        assessmentSide: null,
        assessmentFen: null,
        assessmentStreaming: false,
      });
      void analyzeAtPlyNow(path.length);
    };

    return {
      startFen: START_FEN,
      tree: createEmptyTree(),
      path: [],
      reviewDepth: null,
      analysis: null,
      evalCp: 0,
      analyzing: false,
      orientation: 'white',
      error: null,
      commentary: '',
      commentaryPly: null,
      commentaries: {},
      llmStreaming: false,
      llmError: null,
      followUps: {},
      followUpStreaming: false,
      followUpDraft: '',
      followUpError: null,
      followUpThreadId: null,
      assessment: '',
      assessmentSide: null as 'w' | 'b' | null,
      assessmentFen: null as string | null,
      assessmentStreaming: false,

      history: () => activeSans(),
      qualities: () => pathQualities(get().tree, get().path),

      viewedPly: () => {
        const s = get();
        const live = s.path.length;
        return s.reviewDepth === null ? live : Math.min(s.reviewDepth, live);
      },

      isLive: () => {
        const s = get();
        return s.reviewDepth === null || s.reviewDepth >= s.path.length;
      },

      currentFollowUpThreadId: () => threadIdNow(),

      commentaryHistory: () =>
        Object.values(get().commentaries).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      loadStart: () => resetGame(START_FEN),

      loadFen(fen) {
        const parsed = parseFen(fen);
        if (!parsed) return false;
        resetGame(parsed);
        return true;
      },

      importPgn(pgn) {
        try {
          const { startFen, moves } = parsePgn(pgn);
          resetGame(startFen, moves);
          return true;
        } catch {
          return false;
        }
      },

      async makeMove(from, to, promotion) {
        const s0 = get();
        const ply = s0.viewedPly();
        const sans = pathSans(s0.tree, s0.path);
        const { fen } = fenAfterPlies(s0.startFen, sans, ply);
        const chess = new Chess(fen);
        let move;
        try {
          move = chess.move({ from, to, promotion });
        } catch {
          return false;
        }
        const userUci = move.from + move.to + (move.promotion ?? '');
        const movingSide = sideToMove(fen);
        const fenAfter = chess.fen();
        /** 走子前分析正好是这个局面才能复用，否则后台补算 */
        const analysisBefore = s0.analysis?.fen === fen ? s0.analysis : null;
        /** 立刻能断言的只有「最佳」；其余等后台评估，避免瞎标成 good */
        const instantQuality: Quality | null =
          analysisBefore && userUci === analysisBefore.bestMove ? 'best' : null;

        // 1) 立刻写树上盘，不等引擎
        const parentId: MoveNodeId | null = ply === 0 ? null : s0.path[ply - 1];
        const existing = findChildBySan(s0.tree, parentId, move.san);
        let tree = s0.tree;
        let nodeId: MoveNodeId;
        if (existing) {
          nodeId = existing;
          // 重走已有着法：旧质量先留着，别被 null 抹掉
          if (instantQuality) tree = setNodeQuality(tree, nodeId, instantQuality);
        } else {
          const appended = appendChild(tree, parentId, move.san, instantQuality);
          tree = appended.tree;
          nodeId = appended.id;
        }
        const path: MoveNodeId[] = [...s0.path.slice(0, ply), nodeId];
        let tip = nodeId;
        while (tree.nodes[tip].children.length > 0) {
          tip = tree.nodes[tip].children[0];
          path.push(tip);
        }

        analyzeDebouncer.cancel();
        const token = ++analyzeToken;
        set({ tree, path, reviewDepth: null, analysis: null, analyzing: true, error: null });

        const tipFen = fenAfterPlies(s0.startFen, pathSans(tree, path), path.length).fen;
        const displayedAnalysis = analyzeDisplayedPosition(tipFen, token);

        // Publish the current position first; historical move grades still finish in the background.
        void (async () => {
          try {
            const before = analysisBefore ?? (await engine.analyze(fen, 3, { priority: 'background' }));
            const knownCp = evalAfterFromLines(before, userUci);
            const evalAfterWhite =
              knownCp !== null
                ? sideToMove(fenAfter) === 'w'
                  ? knownCp
                  : -knownCp
                : whiteEval(await (tipFen === fenAfter
                  ? displayedAnalysis.catch(() => engine.analyze(fenAfter, 1, { priority: 'background' }))
                  : engine.analyze(fenAfter, 1, { priority: 'background' })));
            const quality = classifyMove({
              evalBefore: sideEval(whiteEval(before), movingSide),
              evalAfter: sideEval(evalAfterWhite, movingSide),
              userMoveUci: userUci,
              bestMoveUci: before.bestMove,
            });
            if (get().tree.nodes[nodeId]) {
              set((st) => ({ tree: setNodeQuality(st.tree, nodeId, quality) }));
            }
          } catch (e) {
            if (token !== analyzeToken) return;
            set({ error: tl('error.score', { msg: (e as Error).message }) });
          }
        })();
        return true;
      },

      setReviewDepth(depth) {
        const live = get().path.length;
        const next = depth === null ? null : Math.max(0, Math.min(depth, live));
        const restored = restoreCommentaryFor(get().path, next);
        llmAbort?.abort();
        followUpAbort?.abort();
        set({
          reviewDepth: next,
          commentary: restored.commentary,
          commentaryPly: restored.commentaryPly,
          llmStreaming: false,
          followUpStreaming: false,
          followUpDraft: '',
          followUpThreadId: null,
        });
        scheduleAnalyzeAtPly(get().viewedPly());
      },

      setReviewPly(ply) {
        get().setReviewDepth(ply);
      },

      selectNode(nodeId) {
        const tree = get().tree;
        const toNode = pathToNode(tree, nodeId);
        const path = [...toNode];
        let tip = nodeId;
        while (tree.nodes[tip].children.length > 0) {
          tip = tree.nodes[tip].children[0];
          path.push(tip);
        }
        const depth = toNode.length;
        const restored = restoreCommentaryFor(path, depth);
        llmAbort?.abort();
        followUpAbort?.abort();
        set({
          path,
          reviewDepth: depth,
          commentary: restored.commentary,
          commentaryPly: restored.commentaryPly,
          llmStreaming: false,
          followUpStreaming: false,
          followUpDraft: '',
          followUpThreadId: null,
        });
        scheduleAnalyzeAtPly(depth);
      },

      goToCommentary(threadId) {
        const entry = get().commentaries[threadId];
        if (!entry) return;
        if (entry.path.some((id) => !get().tree.nodes[id])) return;
        const tree = get().tree;
        // Restore path to the recorded position, then extend along main child spine to tip
        const path = [...entry.path];
        if (path.length > 0) {
          let tip = path[path.length - 1];
          while (tree.nodes[tip]?.children.length) {
            tip = tree.nodes[tip].children[0];
            path.push(tip);
          }
        } else if (tree.rootChildren[0]) {
          let tip = tree.rootChildren[0];
          path.push(tip);
          while (tree.nodes[tip]?.children.length) {
            tip = tree.nodes[tip].children[0];
            path.push(tip);
          }
        }
        llmAbort?.abort();
        followUpAbort?.abort();
        set({
          path,
          reviewDepth: entry.ply,
          commentary: entry.text,
          commentaryPly: entry.ply,
          llmStreaming: false,
          followUpStreaming: false,
          followUpDraft: '',
          followUpThreadId: null,
        });
        scheduleAnalyzeAtPly(entry.ply);
      },

      setOrientation(o) {
        set({ orientation: o });
      },

      requestCommentary: requestCommentaryNow,
      requestAssessment: (side, opts) => {
        if (opts?.forceNew) {
          assessmentDebouncer.cancel();
          return requestAssessmentNow(side, opts);
        }
        return new Promise<void>((resolve) => {
          assessmentDebouncer.schedule(
            () => { void requestAssessmentNow(side, opts).finally(resolve); },
            resolve,
          );
        });
      },
      askFollowUp: askFollowUpNow,

      exportSnapshot() {
        const s = get();
        return {
          startFen: s.startFen,
          tree: s.tree,
          path: s.path,
          reviewDepth: s.reviewDepth,
          orientation: s.orientation,
          commentary: s.commentary,
          commentaryPly: s.commentaryPly,
          commentaries: s.commentaries,
          followUps: s.followUps,
        };
      },

      hydrateSnapshot(snap) {
        cancelPending();
        syncMoveTreeIdsFromTree(snap.tree);
        let commentaries = { ...(snap.commentaries ?? {}) };
        // migrate legacy single commentary into map
        if (Object.keys(commentaries).length === 0 && snap.commentary && snap.commentaryPly != null) {
          const tid = exploreFollowUpThreadId(snap.path, snap.commentaryPly);
          commentaries = {
            [tid]: {
              threadId: tid,
              path: snap.path.slice(0, snap.commentaryPly),
              ply: snap.commentaryPly,
              text: snap.commentary,
              sansLabel: pathSans(snap.tree, snap.path).slice(0, snap.commentaryPly).join(' ') || tl('session.startPosition'),
              updatedAt: new Date().toISOString(),
            },
          };
        }
        // migrate old tip-based keys explore:a/b/c#2 → explore:a/b
        for (const [oldKey, entry] of Object.entries(commentaries)) {
          const canonical = exploreFollowUpThreadId(entry.path.length ? entry.path : snap.path, entry.ply);
          if (oldKey !== canonical && !commentaries[canonical]) {
            commentaries[canonical] = { ...entry, threadId: canonical, path: entry.path.slice(0, entry.ply) };
            delete commentaries[oldKey];
          } else if (oldKey !== canonical && commentaries[canonical]) {
            delete commentaries[oldKey];
          }
        }
        const ply = snap.reviewDepth === null ? snap.path.length : Math.min(snap.reviewDepth, snap.path.length);
        const tid = exploreFollowUpThreadId(snap.path, ply);
        const entry = commentaries[tid];
        set({
          startFen: snap.startFen,
          tree: snap.tree,
          path: snap.path,
          reviewDepth: snap.reviewDepth,
          orientation: snap.orientation,
          commentary: entry?.text ?? snap.commentary ?? '',
          commentaryPly: entry ? ply : snap.commentaryPly,
          commentaries,
          followUps: snap.followUps ?? {},
          analysis: null,
          evalCp: 0,
          analyzing: false,
          error: null,
          llmStreaming: false,
          llmError: null,
          followUpStreaming: false,
          followUpDraft: '',
          followUpError: null,
          followUpThreadId: null,
          assessment: '',
          assessmentSide: null,
          assessmentFen: null,
          assessmentStreaming: false,
        });
        void analyzeAtPlyNow(ply);
      },
    };
  });
}
