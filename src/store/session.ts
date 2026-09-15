import { createStore, type StoreApi } from 'zustand/vanilla';
import { Chess } from 'chess.js';
import type { Lesson } from '../lessons/schema';
import { PRINCIPLES, principleById, type Principle } from '../lessons/principles';
import type { EnginePort, Analysis } from '../engine/engineService';
import type { Difficulty, DifficultyId } from '../engine/difficulty';
import { difficultyById } from '../engine/difficulty';
import type { LessonSnapshot } from './gameSessions';
import type { ChatMessage } from '../llm/client';
import { chooseAngle, type Angle } from '../llm/angles';
import { buildAssessmentContinueUser, buildAssessmentMessages, buildFollowUpMessages, buildHintMessages, buildIntroMessages, buildMoveContinueUser, buildMoveMessages, buildSummaryMessages, lessonFollowUpThreadId, LLM_MAX_TOKENS, type FollowUpTurn } from '../llm/prompts';
import { continueThread, recordAssistant } from '../llm/chatThread';
import { createStreamFlusher } from '../utils/streamFlusher';
import { createDebouncer, LLM_DEBOUNCE_MS } from '../utils/debounce';
import { classifyMove, scoreToCp, type Quality } from '../chess/quality';
import { fenAfterPlies, sideToMove, toPerspective, uciToSan, uciToSquares } from '../chess/notation';
import { evalAfterFromLines } from '../chess/evalFromLines';
import { annotationsAfterMove, type BoardAnnotations } from '../chess/annotations';
import { isFinished, judgeResult, type GameResult, type Outcome } from '../chess/result';
import { extractFeatures } from '../chess/features';
import { pickBookReply } from '../chess/openingBook';
import { tl } from '../i18n';

export interface LlmStreamOptions {
  temperature: number;
  signal: AbortSignal;
  /** 输出上限 token 数 */
  maxTokens?: number;
  /** 短回答（追问 / 提示）：推理强度比配置低一档，换更快的首字 */
  quick?: boolean;
}

export interface LlmPort {
  stream(messages: ChatMessage[], opts: LlmStreamOptions): AsyncIterable<string>;
}

export interface SessionDeps {
  engine: EnginePort;
  llm: LlmPort;
  onFinished?(lessonId: string, outcome: Outcome, clean: boolean): void;
  random?(): number;
  /** 大模型防抖，测试可设 0 */
  llmDebounceMs?: number;
}

export type Phase = 'idle' | 'preparing' | 'userTurn' | 'engineThinking' | 'finished';
export type StreamKind = 'intro' | 'commentary' | 'hint' | 'summary' | 'assessment';

export interface Round {
  index: number;
  userMove: { san: string; uci: string; quality: Quality; evalBefore: number; evalAfter: number };
  engineMove: { san: string; uci: string } | null;
  bestLinesSan: string[][];
  /** UCI PVs for the position before the user move (optional for older snapshots) */
  bestLinesUci?: string[][];
  angle: Angle;
  commentary: string;
  annotations: BoardAnnotations;
  error?: string;
}

export interface SessionState {
  lesson: Lesson | null;
  difficulty: Difficulty | null;
  fen: string;
  phase: Phase;
  streaming: StreamKind | null;
  rounds: Round[];
  history: string[]; // SAN
  evalCp: number; // 用户视角，当前局面
  evalHistory: number[];
  intro: string;
  summary: string;
  hintText: string;
  hintArrow: { from: string; to: string } | null;
  hintUsed: boolean;
  analysisBefore: Analysis | null; // 当前 fen 的分析（用户走子前）
  result: { outcome: Outcome; reason: string } | null;
  engineError: string | null;
  llmError: string | null;
  usedPrincipleIds: string[];
  angleHistory: Angle[];
  liveAnnotations: BoardAnnotations | null;
  followUps: Record<string, FollowUpTurn[]>;
  followUpStreaming: boolean;
  followUpDraft: string;
  followUpError: string | null;
  followUpThreadId: string | null;
  assessment: string;
  assessmentSide: 'w' | 'b' | null;
  assessmentFen: string | null;

  start(lesson: Lesson, difficulty: Difficulty): Promise<void>;
  playUserMove(from: string, to: string, promotion?: string): Promise<boolean>;
  /** 截断到指定 ply（之后的着法/回合丢弃），并重新分析该局面；用于回看后改走 */
  rewindToPly(ply: number): Promise<boolean>;
  /** 退到上一手轮到自己的局面并截断，便于改走 */
  takeback(fromPly?: number): Promise<boolean>;
  requestHint(level: 1 | 2): Promise<void>;
  requestAssessment(side: 'w' | 'b', view?: { fen: string; history: string[] }): Promise<void>;
  askFollowUp(threadId: string, question: string): Promise<void>;
  restart(): Promise<void>;
  /** 重跑最近一次失败的讲解 / 判断等 LLM 流（用保存的同一批消息与写入回调） */
  retryLastLlm(): void;
  whenIdle(): Promise<void>;
  dispose(): void;
  exportSnapshot(): LessonSnapshot | null;
  hydrateSnapshot(snap: LessonSnapshot, lesson: Lesson): Promise<void>;
}

const initial = {
  lesson: null, difficulty: null, fen: '', phase: 'idle' as Phase, streaming: null, rounds: [], history: [],
  evalCp: 0, evalHistory: [], intro: '', summary: '', hintText: '', hintArrow: null, hintUsed: false,
  analysisBefore: null, result: null, engineError: null, llmError: null, usedPrincipleIds: [], angleHistory: [],
  liveAnnotations: null,
  followUps: {} as Record<string, FollowUpTurn[]>,
  followUpStreaming: false,
  followUpDraft: '',
  followUpError: null as string | null,
  followUpThreadId: null as string | null,
  assessment: '',
  assessmentSide: null as 'w' | 'b' | null,
  assessmentFen: null as string | null,
};

function playerCp(analysis: Analysis, lesson: Lesson): number {
  const line = analysis.lines.find((l) => l.multipv === 1) ?? analysis.lines[0];
  return toPerspective(scoreToCp(line.score), sideToMove(analysis.fen), lesson.playerColor);
}

function gameResultOf(chess: Chess, lesson: Lesson): GameResult {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return chess.turn() === lesson.playerColor ? 'playerLoss' : 'playerWin';
  return 'draw';
}

/** 挑选本回合可引用的棋理：课程指定的优先，其次由局面特征触发；尽量不重复用过的 */
function pickPrinciples(lesson: Lesson, fen: string, used: string[]): Principle[] {
  const features = extractFeatures(fen, lesson.playerColor);
  const triggered = PRINCIPLES.filter((p) => p.triggers.some((t) => features.includes(t)) && !lesson.principleIds.includes(p.id));
  const lessonPs = lesson.principleIds.map(principleById);
  const fresh = [...lessonPs, ...triggered].filter((p) => !used.includes(p.id));
  const pool = fresh.length > 0 ? fresh : [...lessonPs, ...triggered];
  return pool.slice(0, 2);
}

export function createSessionStore(deps: SessionDeps): StoreApi<SessionState> {
  const pending = new Set<Promise<unknown>>();
  let streamAbort: AbortController | null = null;
  let followUpAbort: AbortController | null = null;
  let llmThread: ChatMessage[] | null = null;
  let assessmentThread: { side: 'w' | 'b'; messages: ChatMessage[] } | null = null;
  const llmDebounceMs = deps.llmDebounceMs ?? LLM_DEBOUNCE_MS;
  const commentaryDebouncer = createDebouncer(llmDebounceMs);
  const assessmentDebouncer = createDebouncer(llmDebounceMs);

  const scheduleLlm = (debouncer: ReturnType<typeof createDebouncer>, run: () => Promise<unknown>) => {
    const p = new Promise<void>((resolve) => {
      debouncer.schedule(
        () => { void Promise.resolve(run()).finally(resolve); },
        resolve,
      );
    });
    return track(p);
  };

  const track = <T,>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    // 用 then(onOk, onErr) 而不是 finally，避免产生新的未处理 rejection
    p.then(() => pending.delete(p), () => pending.delete(p));
    return p;
  };

  return createStore<SessionState>((set, get) => {
    /** 最近一次 stream() 的参数，供 retryLastLlm 原样重放 */
    let lastStream: { kind: StreamKind; messages: ChatMessage[]; temperature: number; onChunk: (text: string) => void; onDone?: () => void } | null = null;
    /** 流式写入：onChunk 追加文本；出错写 llmError */
    const stream = (kind: StreamKind, messages: ChatMessage[], temperature: number, onChunk: (text: string) => void, onDone?: () => void) => {
      lastStream = { kind, messages, temperature, onChunk, onDone };
      streamAbort?.abort();
      followUpAbort?.abort();
      const ac = new AbortController();
      streamAbort = ac;
      set({ streaming: kind, llmError: null, followUpStreaming: false, followUpDraft: '', followUpThreadId: null });
      const run = (async () => {
        const flusher = createStreamFlusher(onChunk);
        try {
          // 提示是一句话，用低一档推理换更快首字；其余按配置
          const opts = { temperature, signal: ac.signal, maxTokens: LLM_MAX_TOKENS[kind], quick: kind === 'hint' };
          for await (const d of deps.llm.stream(messages, opts)) {
            if (ac.signal.aborted) break;
            flusher.push(d);
          }
          if (!ac.signal.aborted) flusher.finish();
        } catch (e) {
          if (!ac.signal.aborted) set({ llmError: tl('error.commentary', { msg: (e as Error).message }) });
        } finally {
          flusher.cancel();
          if (streamAbort === ac) { streamAbort = null; set({ streaming: null }); }
          onDone?.();
        }
      })();
      return track(run);
    };

    const prepareTurn = async () => {
      const { lesson, fen } = get();
      if (!lesson) return;
      const playerToMove = sideToMove(fen) === lesson.playerColor;
      set({
        phase: playerToMove ? 'userTurn' : 'preparing',
        hintArrow: null,
        hintText: '',
      });
      try {
        const analysis = await deps.engine.analyze(fen, 3);
        if (get().fen !== fen) return; // 已重开
        set({ analysisBefore: analysis, evalCp: playerCp(analysis, lesson), engineError: null, phase: playerToMove ? 'userTurn' : get().phase });
      } catch (e) {
        if (get().fen !== fen) return;
        set({ engineError: tl('error.engineAnalyze', { msg: (e as Error).message }), phase: playerToMove ? 'userTurn' : get().phase });
      }
    };

    /** 开局练习优先走开局书；不在书中或普通课程则问引擎 */
    const applyOpponentMove = async (chess: Chess, difficulty: Difficulty) => {
      const book = get().lesson?.opponentBook;
      const bookSan = book ? pickBookReply(chess.fen(), book) : null;
      if (bookSan) {
        const m = chess.move(bookSan);
        if (m) return m;
      }
      const uci = await deps.engine.opponentMove(chess.fen(), difficulty);
      return chess.move(uciToSquares(uci));
    };

    /** 若开局局面轮到对手（如执黑从起始局面），先走出对手着法再进入用户回合 */
    const playUntilPlayerToMove = async (opts?: { deferAnalyze?: boolean }) => {
      const lesson = get().lesson;
      const difficulty = get().difficulty;
      if (!lesson || !difficulty) return;
      const chess = new Chess(get().fen);
      const history = [...get().history];
      try {
        while (chess.turn() !== lesson.playerColor && !chess.isGameOver()) {
          set({ phase: 'engineThinking' });
          const m = await applyOpponentMove(chess, difficulty);
          if (get().lesson?.id !== lesson.id) return; // 已重开
          history.push(m.san);
          set({ fen: chess.fen(), history: [...history] });
        }
      } catch (e) {
        set({ engineError: tl('error.engine', { msg: (e as Error).message }), phase: 'userTurn' });
        return;
      }
      if (chess.isGameOver()) {
        await finish(chess);
        return;
      }
      if (opts?.deferAnalyze) {
        set({ phase: 'userTurn' });
        void track(prepareTurn());
        return;
      }
      await prepareTurn();
    };

    const finish = async (chess: Chess) => {
      const s = get();
      const lesson = s.lesson!;
      const gameResult = gameResultOf(chess, lesson);
      let finalEvalCp = s.evalHistory[s.evalHistory.length - 1] ?? s.evalCp;
      if (gameResult === 'playerWin') finalEvalCp = 10000;
      else if (gameResult === 'playerLoss') finalEvalCp = -10000;
      else if (gameResult === 'draw') finalEvalCp = 0;
      else {
        try { finalEvalCp = playerCp(await deps.engine.analyze(chess.fen(), 1), lesson); } catch { /* 用上一回合评估 */ }
      }
      const result = judgeResult({
        lesson, finalFen: chess.fen(), finalEvalCp, evalHistory: s.evalHistory,
        qualities: s.rounds.map((r) => r.userMove.quality), gameResult,
      });
      set({ phase: 'finished', result, evalCp: finalEvalCp });
      deps.onFinished?.(lesson.id, result.outcome, !get().hintUsed);
      const principles = lesson.principleIds.map(principleById);
      void stream('summary', buildSummaryMessages({
        lesson, moveHistorySan: get().history, qualities: get().rounds.map((r) => r.userMove.quality),
        evalHistory: get().evalHistory, outcome: result.outcome, reason: result.reason, principles, hintUsed: get().hintUsed,
      }), 0.5, (text) => set({ summary: text }));
    };

    return {
      ...initial,

      async start(lesson, difficulty) {
        streamAbort?.abort();
        followUpAbort?.abort();
        llmThread = null;
        assessmentThread = null;
        commentaryDebouncer.cancel();
        assessmentDebouncer.cancel();
        set({ ...initial, lesson, difficulty, fen: lesson.startFen, phase: 'preparing' });
        const principles = lesson.principleIds.map(principleById);
        const introMsgs = buildIntroMessages(lesson, principles);
        void stream('intro', introMsgs, 0.7, (text) => set({ intro: text }), () => {
          if (get().intro) llmThread = recordAssistant(introMsgs, get().intro);
        });
        // 执黑从起始局面等：若当前不是用户行棋，先让引擎走出对手着法
        await track(playUntilPlayerToMove());
      },

      async playUserMove(from, to, promotion) {
        const s = get();
        const lesson = s.lesson;
        if (!lesson) return false;
        if (s.phase === 'engineThinking') return false;
        if (s.followUpStreaming) return false;
        if (sideToMove(s.fen) !== lesson.playerColor) return false;
        if (s.phase !== 'userTurn' && s.phase !== 'preparing' && s.phase !== 'finished') return false;
        const analysisReady = Boolean(s.analysisBefore && s.analysisBefore.fen === s.fen);
        const chess = new Chess(s.fen);
        let move;
        try {
          move = chess.move({ from, to, promotion });
        } catch {
          return false;
        }
        if (s.streaming === 'commentary' || s.streaming === 'hint' || s.streaming === 'intro' || s.streaming === 'assessment') streamAbort?.abort();

        const analysisBefore = analysisReady ? s.analysisBefore : null;
        const evalBefore = analysisBefore ? playerCp(analysisBefore, lesson) : 0;
        const bestLinesSan = analysisBefore ? analysisBefore.lines.map((l) => uciToSan(s.fen, l.pv.slice(0, 6))) : [];
        const bestLinesUci = analysisBefore ? analysisBefore.lines.map((l) => l.pv.slice(0, 6)) : [];
        const userUci = move.from + move.to + (move.promotion ?? '');
        const fenAfterUser = chess.fen();
        const provisionalQuality = analysisBefore && userUci === analysisBefore.bestMove ? 'best' as Quality : 'inaccuracy';
        set({
          phase: 'engineThinking',
          hintArrow: null,
          hintText: '',
          liveAnnotations: analysisBefore ? annotationsAfterMove(analysisBefore, userUci, provisionalQuality) : null,
        });

        let evalAfter = evalBefore;
        let engineMove: Round['engineMove'] = null;
        const afterUserOver = chess.isGameOver();
        if (!afterUserOver) {
          try {
            const knownCp = analysisBefore ? evalAfterFromLines(analysisBefore, userUci) : null;
            const [evalAfterCp, em] = await Promise.all([
              knownCp !== null
                ? Promise.resolve(toPerspective(knownCp, sideToMove(fenAfterUser), lesson.playerColor))
                : deps.engine.analyze(fenAfterUser, 1).then((a) => playerCp(a, lesson)),
              applyOpponentMove(chess, s.difficulty!),
            ]);
            evalAfter = evalAfterCp;
            engineMove = { san: em.san, uci: em.from + em.to + (em.promotion ?? '') };
          } catch (e) {
            set({ engineError: tl('error.engine', { msg: (e as Error).message }), phase: 'userTurn', liveAnnotations: null });
            return false;
          }
        } else {
          const gr = gameResultOf(chess, lesson);
          evalAfter = gr === 'playerWin' ? 10000 : gr === 'draw' ? 0 : -10000;
        }

        const quality = classifyMove({ evalBefore, evalAfter, userMoveUci: userUci, bestMoveUci: analysisBefore?.bestMove ?? '' });
        const angle = chooseAngle({ quality, evalSwing: evalAfter - evalBefore, history: get().angleHistory, random: deps.random });
        const principles = pickPrinciples(lesson, chess.fen(), get().usedPrincipleIds);
        const round: Round = {
          index: get().rounds.length, userMove: { san: move.san, uci: userUci, quality, evalBefore, evalAfter },
          engineMove, bestLinesSan, bestLinesUci, angle, commentary: '',
          annotations: analysisBefore ? annotationsAfterMove(analysisBefore, userUci, quality) : { arrows: [], squares: [] },
        };
        const history = [...get().history, move.san, ...(engineMove ? [engineMove.san] : [])];
        set({
          fen: chess.fen(), history, rounds: [...get().rounds, round], evalHistory: [...get().evalHistory, evalAfter],
          evalCp: evalAfter, angleHistory: [...get().angleHistory, angle],
          usedPrincipleIds: [...get().usedPrincipleIds, ...principles.map((p) => p.id)],
          liveAnnotations: null,
        });

        const recent = get().rounds.slice(-4, -1).map((r) => r.commentary.slice(0, 80)).filter(Boolean);
        const done = isFinished(lesson, get().rounds.length, history.length, chess.isGameOver());
        const idx = round.index;
        const writeCommentary = (text: string) =>
          set((st) => ({ rounds: st.rounds.map((r) => (r.index === idx ? { ...r, commentary: text } : r)) }));

        const moveCtx = {
          lesson, fen: chess.fen(), moveHistorySan: history, userMoveSan: move.san, quality, evalBefore, evalAfter,
          bestLinesSan, engineReplySan: engineMove?.san ?? null, angle, principles, recentCommentary: recent,
        };
        const bootstrap = buildMoveMessages(moveCtx);
        const commentaryMessages = continueThread(llmThread ?? undefined, buildMoveContinueUser(moveCtx), bootstrap);

        // 新回合讲解开始时清空该回合追问线程
        const roundThread = lessonFollowUpThreadId('round', idx);
        set((st) => {
          const followUps = { ...st.followUps };
          delete followUps[roundThread];
          return { followUps };
        });

        const remember = () => {
          const text = get().rounds.find((r) => r.index === idx)?.commentary ?? '';
          if (text) llmThread = recordAssistant(commentaryMessages, text);
        };
        if (done) {
          commentaryDebouncer.cancel();
          await stream('commentary', commentaryMessages, 0.8, writeCommentary, remember);
          await track(finish(chess));
        } else {
          scheduleLlm(commentaryDebouncer, () => stream('commentary', commentaryMessages, 0.8, writeCommentary, remember));
          await track(prepareTurn());
        }
        return true;
      },

      async rewindToPly(ply) {
        const s = get();
        const lesson = s.lesson;
        if (!lesson) return false;
        if (s.phase === 'engineThinking') return false;
        const target = Math.max(0, Math.min(ply, s.history.length));
        if (target === s.history.length && s.phase === 'userTurn' && s.fen === fenAfterPlies(lesson.startFen, s.history, target).fen) {
          return true;
        }

        streamAbort?.abort();
        followUpAbort?.abort();
        commentaryDebouncer.cancel();
        assessmentDebouncer.cancel();
        llmThread = null;
        assessmentThread = null;

        const roundPlies = s.rounds.reduce((n, r) => n + 1 + (r.engineMove ? 1 : 0), 0);
        const prefixLen = Math.max(0, s.history.length - roundPlies);

        let cursor = Math.min(prefixLen, target);
        const keptRounds: Round[] = [];
        if (target >= prefixLen) {
          cursor = prefixLen;
          for (const r of s.rounds) {
            const n = 1 + (r.engineMove ? 1 : 0);
            if (cursor + n <= target) {
              keptRounds.push({ ...r, index: keptRounds.length });
              cursor += n;
            } else break;
          }
        }
        // 回合中间（用户已走、引擎未应手）：整回合丢弃，停在该回合开始
        const history = s.history.slice(0, cursor);
        const fen = fenAfterPlies(lesson.startFen, history, history.length).fen;
        const evalHistory = s.evalHistory.slice(0, keptRounds.length);
        const evalCp = evalHistory.length > 0 ? evalHistory[evalHistory.length - 1]! : 0;

        const keptThreadIds = new Set<string>([
          lessonFollowUpThreadId('intro'),
          ...keptRounds.map((r) => lessonFollowUpThreadId('round', r.index)),
        ]);
        const followUps: Record<string, FollowUpTurn[]> = {};
        for (const [tid, turns] of Object.entries(s.followUps)) {
          if (keptThreadIds.has(tid)) followUps[tid] = turns;
        }

        set({
          history,
          rounds: keptRounds,
          fen,
          evalHistory,
          evalCp,
          angleHistory: s.angleHistory.slice(0, keptRounds.length),
          usedPrincipleIds: keptRounds.length === 0 ? [] : s.usedPrincipleIds,
          analysisBefore: null,
          liveAnnotations: null,
          hintArrow: null,
          hintText: '',
          result: null,
          summary: '',
          followUps,
          followUpStreaming: false,
          followUpDraft: '',
          followUpError: null,
          followUpThreadId: null,
          streaming: null,
          llmError: null,
          phase: 'preparing',
          assessment: '',
          assessmentSide: null,
          assessmentFen: null,
        });
        // 执黑截断到起始局面时，补回对手先手；分析放到后台，避免卡住改走
        await track(playUntilPlayerToMove({ deferAnalyze: true }));
        return get().phase === 'userTurn' || get().phase === 'finished';
      },

      async takeback(fromPly) {
        const s = get();
        const lesson = s.lesson;
        if (!lesson) return false;
        const from = Math.max(0, Math.min(fromPly ?? s.history.length, s.history.length));
        let target: number | null = null;
        for (let p = from - 1; p >= 0; p--) {
          const fen = fenAfterPlies(lesson.startFen, s.history, p).fen;
          if (sideToMove(fen) === lesson.playerColor) {
            target = p;
            break;
          }
        }
        if (target == null) return false;
        return get().rewindToPly(target);
      },

      async askFollowUp(threadId, question) {
        const q = question.trim();
        const s = get();
        if (!q || !s.lesson || s.followUpStreaming || s.streaming) return;

        const isIntro = threadId === lessonFollowUpThreadId('intro');
        const roundMatch = /^lesson:round:(\d+)$/.exec(threadId);
        const roundIdx = roundMatch ? Number(roundMatch[1]) : -1;
        const primary = isIntro ? s.intro : (s.rounds[roundIdx]?.commentary ?? '');
        if (!primary) return;

        const prior = s.followUps[threadId] ?? [];
        let moveHistorySan: string[] = [];
        let fen = s.lesson.startFen;
        let bestLinesSan: string[][] = [];
        if (isIntro) {
          bestLinesSan = s.analysisBefore
            ? s.analysisBefore.lines.map((l) => uciToSan(s.lesson!.startFen, l.pv.slice(0, 6)))
            : [];
        } else {
          let plyCount = 0;
          for (let i = 0; i <= roundIdx; i++) {
            plyCount += 1;
            if (s.rounds[i]?.engineMove) plyCount += 1;
          }
          moveHistorySan = s.history.slice(0, plyCount);
          fen = fenAfterPlies(s.lesson.startFen, moveHistorySan, moveHistorySan.length).fen;
          bestLinesSan = s.rounds[roundIdx]?.bestLinesSan ?? [];
        }
        const messages = buildFollowUpMessages({
          fen,
          moveHistorySan,
          evalCp: isIntro ? s.evalCp : (s.rounds[roundIdx]?.userMove.evalAfter ?? s.evalCp),
          sideToMove: sideToMove(fen),
          bestLinesSan,
          primaryCommentary: primary,
          turns: prior,
          question: q,
        });

        followUpAbort?.abort();
        const ac = new AbortController();
        followUpAbort = ac;
        set((st) => ({
          followUps: { ...st.followUps, [threadId]: [...prior, { role: 'user' as const, content: q }] },
          followUpStreaming: true,
          followUpDraft: '',
          followUpError: null,
          followUpThreadId: threadId,
        }));

        const run = (async () => {
          const flusher = createStreamFlusher((text) => set({ followUpDraft: text, followUpThreadId: threadId }));
          try {
            for await (const d of deps.llm.stream(messages, { temperature: 0.7, signal: ac.signal, maxTokens: LLM_MAX_TOKENS.followUp, quick: true })) {
              if (ac.signal.aborted) break;
              flusher.push(d);
            }
            if (!ac.signal.aborted) {
              const acc = flusher.finish();
              set((st) => {
                const turns = [...(st.followUps[threadId] ?? [])];
                turns.push({ role: 'assistant', content: acc });
                return {
                  followUps: { ...st.followUps, [threadId]: turns },
                  followUpDraft: '',
                  followUpStreaming: false,
                  followUpThreadId: null,
                };
              });
            }
          } catch (e) {
            if (!ac.signal.aborted) {
              set({
                followUpStreaming: false,
                followUpDraft: '',
                followUpError: tl('error.followUp', { msg: (e as Error).message }),
                followUpThreadId: null,
              });
            }
          } finally {
            flusher.cancel();
            if (followUpAbort === ac) followUpAbort = null;
            if (get().followUpStreaming) set({ followUpStreaming: false });
          }
        })();
        await track(run);
      },

      async requestAssessment(side, view) {
        const lesson = get().lesson;
        if (!lesson) return;
        const fen = view?.fen ?? get().fen;
        const history = view?.history ?? get().history;
        if (get().assessmentFen === fen && get().assessmentSide === side && get().assessment && get().streaming !== 'assessment') return;
        await scheduleLlm(assessmentDebouncer, async () => {
          if (get().assessmentFen === fen && get().assessmentSide === side && get().assessment && get().streaming !== 'assessment') return;
          set({ assessment: '', assessmentSide: side, assessmentFen: fen, llmError: null });
          let analysis = get().analysisBefore?.fen === fen ? get().analysisBefore : null;
          if (!analysis) {
            try {
              analysis = await deps.engine.analyze(fen, 3);
              if (get().assessmentFen !== fen) return;
            } catch (e) {
              set({ llmError: tl('error.assessment', { msg: (e as Error).message }) });
              return;
            }
          }
          const top = analysis.lines.find((l) => l.multipv === 1) ?? analysis.lines[0];
          if (!top) {
            set({ llmError: tl('error.assessmentNoLines') });
            return;
          }
          const stm = sideToMove(fen);
          const whiteCp = stm === 'w' ? scoreToCp(top.score) : -scoreToCp(top.score);
          const ctx = {
            fen,
            moveHistorySan: history,
            evalCp: whiteCp,
            sideToMove: stm,
            perspective: side,
            bestLinesSan: analysis.lines.map((l) => uciToSan(fen, l.pv.slice(0, 6))),
          };
          const bootstrap = buildAssessmentMessages(ctx);
          const prev = assessmentThread?.side === side ? assessmentThread.messages : undefined;
          const messages = continueThread(prev, buildAssessmentContinueUser(ctx), bootstrap);
          await stream('assessment', messages, 0.5, (t) => set({ assessment: t }), () => {
            if (get().assessment) assessmentThread = { side, messages: recordAssistant(messages, get().assessment) };
          });
        });
      },

      async requestHint(level) {
        const s = get();
        if (!s.lesson || s.phase !== 'userTurn' || !s.analysisBefore) return;
        set({ hintUsed: true });
        const best = s.analysisBefore.bestMove;
        if (level === 2) {
          const sq = uciToSquares(best);
          set({ hintArrow: { from: sq.from, to: sq.to } });
          return;
        }
        const bestLinesSan = s.analysisBefore.lines.map((l) => uciToSan(s.fen, l.pv.slice(0, 4)));
        const principles = pickPrinciples(s.lesson, s.fen, []);
        await stream('hint', buildHintMessages({ lesson: s.lesson, fen: s.fen, moveHistorySan: s.history, bestLinesSan, principles }), 0.5, (t) => set({ hintText: t }));
      },

      async restart() {
        const { lesson, difficulty } = get();
        if (lesson && difficulty) await get().start(lesson, difficulty);
      },

      retryLastLlm() {
        if (lastStream) void stream(lastStream.kind, lastStream.messages, lastStream.temperature, lastStream.onChunk, lastStream.onDone);
      },

      async whenIdle() {
        while (pending.size > 0) await Promise.allSettled([...pending]);
      },

      dispose() {
        streamAbort?.abort();
        followUpAbort?.abort();
        commentaryDebouncer.cancel();
        assessmentDebouncer.cancel();
        deps.engine.dispose();
      },

      exportSnapshot() {
        const s = get();
        if (!s.lesson || !s.difficulty) return null;
        return {
          lessonId: s.lesson.id,
          difficultyId: s.difficulty.id as DifficultyId,
          fen: s.fen,
          history: s.history,
          rounds: s.rounds,
          evalHistory: s.evalHistory,
          evalCp: s.evalCp,
          intro: s.intro,
          summary: s.summary,
          hintUsed: s.hintUsed,
          usedPrincipleIds: s.usedPrincipleIds,
          angleHistory: s.angleHistory,
          followUps: s.followUps,
          phase: s.phase === 'engineThinking' || s.phase === 'preparing' ? 'userTurn' : s.phase,
          result: s.result,
        };
      },

      async hydrateSnapshot(snap, lesson) {
        streamAbort?.abort();
        followUpAbort?.abort();
        const difficulty = difficultyById(snap.difficultyId);
        set({
          ...initial,
          lesson,
          difficulty,
          fen: snap.fen,
          history: snap.history,
          rounds: snap.rounds,
          evalHistory: snap.evalHistory,
          evalCp: snap.evalCp,
          intro: snap.intro,
          summary: snap.summary,
          hintUsed: snap.hintUsed,
          usedPrincipleIds: snap.usedPrincipleIds,
          angleHistory: snap.angleHistory,
          followUps: snap.followUps,
          phase: snap.phase === 'idle' ? 'userTurn' : snap.phase,
          result: snap.result,
          streaming: null,
          analysisBefore: null,
          liveAnnotations: null,
          hintText: '',
          hintArrow: null,
          engineError: null,
          llmError: null,
        });
        if (get().phase !== 'finished') {
          await track(prepareTurn());
        }
      },
    };
  });
}
