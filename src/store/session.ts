import { createStore, type StoreApi } from 'zustand/vanilla';
import { Chess } from 'chess.js';
import type { Lesson } from '../lessons/schema';
import { PRINCIPLES, principleById, type Principle } from '../lessons/principles';
import type { EnginePort, Analysis } from '../engine/engineService';
import type { Difficulty } from '../engine/difficulty';
import type { ChatMessage } from '../llm/client';
import { chooseAngle, type Angle } from '../llm/angles';
import { buildHintMessages, buildIntroMessages, buildMoveMessages, buildSummaryMessages } from '../llm/prompts';
import { classifyMove, scoreToCp, type Quality } from '../chess/quality';
import { sideToMove, toPerspective, uciToSan, uciToSquares } from '../chess/notation';
import { isFinished, judgeResult, type GameResult, type Outcome } from '../chess/result';
import { extractFeatures } from '../chess/features';

export interface LlmPort {
  stream(messages: ChatMessage[], opts: { temperature: number; signal: AbortSignal }): AsyncIterable<string>;
}

export interface SessionDeps {
  engine: EnginePort;
  llm: LlmPort;
  onFinished?(lessonId: string, outcome: Outcome, clean: boolean): void;
  random?(): number;
}

export type Phase = 'idle' | 'preparing' | 'userTurn' | 'engineThinking' | 'finished';
export type StreamKind = 'intro' | 'commentary' | 'hint' | 'summary';

export interface Round {
  index: number;
  userMove: { san: string; uci: string; quality: Quality; evalBefore: number; evalAfter: number };
  engineMove: { san: string; uci: string } | null;
  bestLinesSan: string[][];
  angle: Angle;
  commentary: string;
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

  start(lesson: Lesson, difficulty: Difficulty): Promise<void>;
  playUserMove(from: string, to: string, promotion?: string): Promise<boolean>;
  requestHint(level: 1 | 2): Promise<void>;
  restart(): Promise<void>;
  whenIdle(): Promise<void>;
  dispose(): void;
}

const initial = {
  lesson: null, difficulty: null, fen: '', phase: 'idle' as Phase, streaming: null, rounds: [], history: [],
  evalCp: 0, evalHistory: [], intro: '', summary: '', hintText: '', hintArrow: null, hintUsed: false,
  analysisBefore: null, result: null, engineError: null, llmError: null, usedPrincipleIds: [], angleHistory: [],
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

  const track = <T,>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    // 用 then(onOk, onErr) 而不是 finally，避免产生新的未处理 rejection
    p.then(() => pending.delete(p), () => pending.delete(p));
    return p;
  };

  return createStore<SessionState>((set, get) => {
    /** 流式写入：onChunk 追加文本；出错写 llmError */
    const stream = (kind: StreamKind, messages: ChatMessage[], temperature: number, onChunk: (text: string) => void, onDone?: () => void) => {
      streamAbort?.abort();
      const ac = new AbortController();
      streamAbort = ac;
      set({ streaming: kind, llmError: null });
      const run = (async () => {
        let acc = '';
        try {
          for await (const d of deps.llm.stream(messages, { temperature, signal: ac.signal })) {
            if (ac.signal.aborted) break;
            acc += d;
            onChunk(acc);
          }
        } catch (e) {
          if (!ac.signal.aborted) set({ llmError: `讲解失败：${(e as Error).message}` });
        } finally {
          if (streamAbort === ac) { streamAbort = null; set({ streaming: null }); }
          onDone?.();
        }
      })();
      return track(run);
    };

    const prepareTurn = async () => {
      const { lesson, fen } = get();
      if (!lesson) return;
      set({ phase: 'preparing', hintArrow: null, hintText: '' });
      try {
        const analysis = await deps.engine.analyze(fen, 3);
        if (get().fen !== fen) return; // 已重开
        set({ analysisBefore: analysis, evalCp: playerCp(analysis, lesson), phase: 'userTurn', engineError: null });
      } catch (e) {
        set({ engineError: `引擎分析失败：${(e as Error).message}`, phase: 'userTurn' });
      }
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
        set({ ...initial, lesson, difficulty, fen: lesson.startFen, phase: 'preparing' });
        const principles = lesson.principleIds.map(principleById);
        void stream('intro', buildIntroMessages(lesson, principles), 0.7, (text) => set({ intro: text }));
        await track(prepareTurn());
      },

      async playUserMove(from, to, promotion) {
        const s = get();
        const lesson = s.lesson;
        if (!lesson || s.phase !== 'userTurn' || !s.analysisBefore || s.analysisBefore.fen !== s.fen) return false;
        const chess = new Chess(s.fen);
        let move;
        try {
          move = chess.move({ from, to, promotion });
        } catch {
          return false;
        }
        if (s.streaming === 'commentary' || s.streaming === 'hint' || s.streaming === 'intro') streamAbort?.abort();

        const analysisBefore = s.analysisBefore;
        const evalBefore = playerCp(analysisBefore, lesson);
        const bestLinesSan = analysisBefore.lines.map((l) => uciToSan(s.fen, l.pv.slice(0, 6)));
        const userUci = move.from + move.to + (move.promotion ?? '');
        const fenAfterUser = chess.fen();
        set({ phase: 'engineThinking', hintArrow: null, hintText: '' });

        let evalAfter = evalBefore;
        let engineMove: Round['engineMove'] = null;
        const afterUserOver = chess.isGameOver();
        if (!afterUserOver) {
          try {
            const [analysisAfter, engineUci] = await Promise.all([
              deps.engine.analyze(fenAfterUser, 1),
              deps.engine.opponentMove(fenAfterUser, s.difficulty!),
            ]);
            evalAfter = playerCp(analysisAfter, lesson);
            const em = chess.move(uciToSquares(engineUci));
            engineMove = { san: em.san, uci: engineUci };
          } catch (e) {
            set({ engineError: `引擎出错：${(e as Error).message}`, phase: 'userTurn' });
            return false;
          }
        } else {
          const gr = gameResultOf(chess, lesson);
          evalAfter = gr === 'playerWin' ? 10000 : gr === 'draw' ? 0 : -10000;
        }

        const quality = classifyMove({ evalBefore, evalAfter, userMoveUci: userUci, bestMoveUci: analysisBefore.bestMove });
        const angle = chooseAngle({ quality, evalSwing: evalAfter - evalBefore, history: get().angleHistory, random: deps.random });
        const principles = pickPrinciples(lesson, chess.fen(), get().usedPrincipleIds);
        const round: Round = {
          index: get().rounds.length, userMove: { san: move.san, uci: userUci, quality, evalBefore, evalAfter },
          engineMove, bestLinesSan, angle, commentary: '',
        };
        const history = [...get().history, move.san, ...(engineMove ? [engineMove.san] : [])];
        set({
          fen: chess.fen(), history, rounds: [...get().rounds, round], evalHistory: [...get().evalHistory, evalAfter],
          evalCp: evalAfter, angleHistory: [...get().angleHistory, angle],
          usedPrincipleIds: [...get().usedPrincipleIds, ...principles.map((p) => p.id)],
        });

        const recent = get().rounds.slice(-4, -1).map((r) => r.commentary.slice(0, 80)).filter(Boolean);
        const done = isFinished(lesson, get().rounds.length, history.length, chess.isGameOver());
        const idx = round.index;
        const writeCommentary = (text: string) =>
          set((st) => ({ rounds: st.rounds.map((r) => (r.index === idx ? { ...r, commentary: text } : r)) }));

        const commentaryMessages = buildMoveMessages({
          lesson, fen: chess.fen(), moveHistorySan: history, userMoveSan: move.san, quality, evalBefore, evalAfter,
          bestLinesSan, engineReplySan: engineMove?.san ?? null, angle, principles, recentCommentary: recent,
        });

        if (done) {
          // 先讲这一回合，再总结
          await stream('commentary', commentaryMessages, 0.8, writeCommentary);
          await track(finish(chess));
        } else {
          void stream('commentary', commentaryMessages, 0.8, writeCommentary);
          await track(prepareTurn());
        }
        return true;
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

      async whenIdle() {
        while (pending.size > 0) await Promise.allSettled([...pending]);
      },

      dispose() {
        streamAbort?.abort();
        deps.engine.dispose();
      },
    };
  });
}
