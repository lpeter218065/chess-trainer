import { createStore, type StoreApi } from 'zustand/vanilla';
import { START_FEN, parsePgn } from '../chess/pgn';
import { fenAfterPlies, formatEval, navigatePly, type PlyNav } from '../chess/notation';
import type { EnginePort } from '../engine/engineService';
import type { LlmPort } from './session';
import {
  buildReviewContinueUser,
  buildReviewExpandMessages,
  buildReviewMessages,
  LLM_MAX_TOKENS,
} from '../llm/prompts';
import { createStreamFlusher } from '../utils/streamFlusher';
import { debugLog } from '../debug/log';
import { liveLocale, tl } from '../i18n';
import { annotateGame, REVIEW_MAX_PLIES, skeletonMoves } from '../review/annotate';
import {
  compactGameForPrompt,
  compactKeyPositionsForPrompt,
  ensureMoveBlocks,
  lastCoveredPly,
  mergeExpandedBlocks,
  mergeReviewDocuments,
  parseReviewOutput,
} from '../review/document';
import { buildAnnotatedPgn } from '../review/pgnExport';
import type { AnnotatedMove, ReviewDocument } from '../review/types';
import type { ReviewSnapshot } from './gameSessions';

export type ReviewStatus = 'idle' | 'analyzing' | 'writing' | 'ready' | 'error';
export type ReviewWritingStage = 'chapter' | 'variations';

export interface ReviewState {
  status: ReviewStatus;
  writingStage: ReviewWritingStage | null;
  pgn: string;
  headers: Record<string, string>;
  startFen: string;
  moves: AnnotatedMove[];
  document: ReviewDocument | null;
  annotatedPgn: string;
  draftText: string;
  ply: number;
  orientation: 'white' | 'black';
  progress: { done: number; total: number } | null;
  error: string | null;

  startFromPgn(pgn: string): Promise<void>;
  retryWrite(): Promise<void>;
  setPly(ply: number): void;
  step(nav: PlyNav): void;
  setOrientation(o: 'white' | 'black'): void;
  reset(): void;
  exportSnapshot(): ReviewSnapshot;
  hydrateSnapshot(snap: ReviewSnapshot): void;
}

const emptySnap = (): ReviewSnapshot => ({
  pgn: '',
  headers: {},
  startFen: START_FEN,
  moves: [],
  document: null,
  annotatedPgn: '',
  ply: 0,
  orientation: 'white',
});

function isAbort(e: unknown): boolean {
  return Boolean(e) && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}

export function createReviewStore(engine: EnginePort, llm: LlmPort): StoreApi<ReviewState> {
  let runToken = 0;
  let abort: AbortController | null = null;

  return createStore<ReviewState>((set, get) => {
    const cancelRun = () => {
      runToken += 1;
      abort?.abort();
      abort = null;
    };

    const writeDocument = async (token: number, ac: AbortController, gamePgn: string, startFen: string, moves: AnnotatedMove[], headers: Record<string, string>) => {
      const locale = liveLocale();
      const game = { pgn: gamePgn, headers, startFen, moves };
      set({
        status: 'writing',
        writingStage: 'chapter',
        draftText: '',
        error: null,
        document: { title: '', overview: '', blocks: [] },
      });
      const flusher = createStreamFlusher((text) => {
        if (token !== runToken) return;
        set({
          draftText: text,
          document: ensureMoveBlocks(parseReviewOutput(text), [], locale),
        });
      });
      try {
        const messages = buildReviewMessages(compactGameForPrompt(game));
        for await (const chunk of llm.stream(messages, {
          temperature: 0.7,
          signal: ac.signal,
          maxTokens: LLM_MAX_TOKENS.review,
        })) {
          if (ac.signal.aborted || token !== runToken) break;
          flusher.push(chunk);
        }
        let raw = ac.signal.aborted ? flusher.text : flusher.finish();
        if (ac.signal.aborted || token !== runToken) return;
        let doc = ensureMoveBlocks(parseReviewOutput(raw), moves, locale);
        let covered = lastCoveredPly(doc);
        let extra = 0;
        while (covered < moves.length && extra < 2 && !ac.signal.aborted) {
          extra += 1;
          const contFlusher = createStreamFlusher((text) => {
            if (token !== runToken) return;
            const merged = mergeReviewDocuments(doc, parseReviewOutput(text));
            set({ document: ensureMoveBlocks(merged, moves, locale) });
          });
          try {
            const contMessages = [...messages, { role: 'assistant' as const, content: raw }, buildReviewContinueUser(covered + 1, moves.length)];
            for await (const chunk of llm.stream(contMessages, {
              temperature: 0.7,
              signal: ac.signal,
              maxTokens: LLM_MAX_TOKENS.review,
            })) {
              if (ac.signal.aborted || token !== runToken) break;
              contFlusher.push(chunk);
            }
            const more = ac.signal.aborted ? contFlusher.text : contFlusher.finish();
            if (ac.signal.aborted || token !== runToken) return;
            doc = ensureMoveBlocks(mergeReviewDocuments(doc, parseReviewOutput(more)), moves, locale);
            const nextCovered = lastCoveredPly(doc);
            if (nextCovered <= covered) break;
            covered = nextCovered;
            raw = `${raw}\n${more}`;
          } finally {
            contFlusher.cancel();
          }
        }
        const keysBody = compactKeyPositionsForPrompt(game);
        if (keysBody && !ac.signal.aborted && token === runToken) {
          set({ writingStage: 'variations' });
          const expandFlusher = createStreamFlusher((text) => {
            if (token !== runToken) return;
            set({ document: mergeExpandedBlocks(doc, parseReviewOutput(text)) });
          });
          try {
            const expandMessages = buildReviewExpandMessages(keysBody);
            for await (const chunk of llm.stream(expandMessages, {
              temperature: 0.7,
              signal: ac.signal,
              maxTokens: LLM_MAX_TOKENS.reviewExpand,
            })) {
              if (ac.signal.aborted || token !== runToken) break;
              expandFlusher.push(chunk);
            }
            const expanded = ac.signal.aborted ? expandFlusher.text : expandFlusher.finish();
            if (!ac.signal.aborted && token === runToken && expanded.trim()) {
              doc = mergeExpandedBlocks(doc, parseReviewOutput(expanded));
              raw = `${raw}\n${expanded}`;
            }
          } finally {
            expandFlusher.cancel();
          }
        }
        if (token !== runToken || ac.signal.aborted) return;
        const annotatedPgn = buildAnnotatedPgn(game, doc);
        set({
          status: 'ready',
          writingStage: null,
          document: doc,
          annotatedPgn,
          draftText: raw,
          error: null,
        });
      } catch (e) {
        if (isAbort(e) || token !== runToken) return;
        debugLog('error', 'review', `write ${(e as Error).message}`);
        set({ status: 'error', writingStage: null, error: tl('error.reviewWrite', { msg: (e as Error).message }) });
      } finally {
        flusher.cancel();
      }
    };

    return {
      status: 'idle',
      writingStage: null,
      pgn: '',
      headers: {},
      startFen: START_FEN,
      moves: [],
      document: null,
      annotatedPgn: '',
      draftText: '',
      ply: 0,
      orientation: 'white',
      progress: null,
      error: null,

      async startFromPgn(rawPgn) {
        cancelRun();
        const token = ++runToken;
        const ac = new AbortController();
        abort = ac;
        let parsed;
        try {
          parsed = parsePgn(rawPgn);
        } catch {
          set({ status: 'error', writingStage: null, error: tl('explore.pgnFail'), pgn: rawPgn, moves: [], document: null, annotatedPgn: '' });
          return;
        }
        if (parsed.moves.length === 0) {
          set({ status: 'error', writingStage: null, error: tl('review.noMoves'), pgn: rawPgn, headers: parsed.headers, startFen: parsed.startFen, moves: [], document: null, annotatedPgn: '' });
          return;
        }
        set({
          status: 'analyzing',
          pgn: rawPgn,
          headers: parsed.headers,
          startFen: parsed.startFen,
          moves: skeletonMoves(parsed.startFen, parsed.moves.slice(0, REVIEW_MAX_PLIES)),
          document: null,
          annotatedPgn: '',
          draftText: '',
          ply: Math.min(parsed.moves.length, REVIEW_MAX_PLIES),
          error: null,
          progress: { done: 0, total: Math.min(parsed.moves.length, REVIEW_MAX_PLIES) + 1 },
        });
        debugLog('info', 'review', `annotate plies=${parsed.moves.length}`);
        try {
          const game = await annotateGame(engine, rawPgn, {
            signal: ac.signal,
            onProgress: (progress) => {
              if (token !== runToken) return;
              set({ progress });
            },
          });
          if (token !== runToken || ac.signal.aborted) return;
          set({
            moves: game.moves,
            headers: game.headers,
            startFen: game.startFen,
            ply: game.moves.length,
            progress: null,
          });
          await writeDocument(token, ac, rawPgn, game.startFen, game.moves, game.headers);
        } catch (e) {
          if (isAbort(e) || token !== runToken) return;
          debugLog('error', 'review', `annotate ${(e as Error).message}`);
          set({ status: 'error', writingStage: null, error: tl('error.reviewAnalyze', { msg: (e as Error).message }), progress: null });
        }
      },

      async retryWrite() {
        const s = get();
        if (s.moves.length === 0) return;
        cancelRun();
        const token = ++runToken;
        const ac = new AbortController();
        abort = ac;
        await writeDocument(token, ac, s.pgn, s.startFen, s.moves, s.headers);
      },

      setPly(ply) {
        const max = get().moves.length;
        set({ ply: Math.max(0, Math.min(max, ply)) });
      },

      step(nav) {
        const s = get();
        set({ ply: navigatePly(s.ply, s.moves.length, nav) });
      },

      setOrientation(o) {
        set({ orientation: o });
      },

      reset() {
        cancelRun();
        set({
          status: 'idle',
          writingStage: null,
          pgn: '',
          headers: {},
          startFen: START_FEN,
          moves: [],
          document: null,
          annotatedPgn: '',
          draftText: '',
          ply: 0,
          orientation: 'white',
          progress: null,
          error: null,
        });
      },

      exportSnapshot() {
        const s = get();
        return {
          pgn: s.pgn,
          headers: s.headers,
          startFen: s.startFen,
          moves: s.moves,
          document: s.document,
          annotatedPgn: s.annotatedPgn,
          ply: s.ply,
          orientation: s.orientation,
        };
      },

      hydrateSnapshot(snap) {
        cancelRun();
        const ply = Math.max(0, Math.min(snap.ply, snap.moves.length));
        const ready = Boolean(snap.document && snap.moves.length > 0);
        set({
          status: ready ? 'ready' : snap.moves.length > 0 ? 'error' : 'idle',
          writingStage: null,
          pgn: snap.pgn,
          headers: snap.headers ?? {},
          startFen: snap.startFen || START_FEN,
          moves: snap.moves ?? [],
          document: snap.document,
          annotatedPgn: snap.annotatedPgn
            ?? (snap.document && snap.moves?.length
              ? buildAnnotatedPgn({
                pgn: snap.pgn,
                headers: snap.headers ?? {},
                startFen: snap.startFen || START_FEN,
                moves: snap.moves,
              }, snap.document)
              : ''),
          draftText: '',
          ply,
          orientation: snap.orientation ?? 'white',
          progress: null,
          error: ready || snap.moves.length === 0 ? null : tl('review.resumeWrite'),
        });
      },
    };
  });
}

export function viewedPosition(startFen: string, moves: AnnotatedMove[], ply: number) {
  const sans = moves.map((m) => m.san);
  const { fen, lastMove } = fenAfterPlies(startFen, sans, ply);
  const current = ply > 0 ? moves[ply - 1] : null;
  const evalCp = current?.evalAfter ?? (ply === 0 && moves[0] ? moves[0].evalBefore : 0);
  return { fen, lastMove, evalCp, evalLabel: formatEval(evalCp) };
}

export { emptySnap as emptyReviewSnapshot };
