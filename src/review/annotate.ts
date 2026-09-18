import { Chess } from 'chess.js';
import type { EnginePort } from '../engine/engineService';
import type { Analysis } from '../engine/stockfishWorker';
import { classifyMove, scoreToCp } from '../chess/quality';
import { MATE_CP, sideToMove, uciToSan } from '../chess/notation';
import { parsePgn } from '../chess/pgn';
import { markKeyMoves, nagFromQuality } from './moments';
import type { AnnotatedGame, AnnotatedMove, AnnotateProgress } from './types';

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('The operation was aborted', 'AbortError');
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

export const REVIEW_ANALYSIS_DEPTH = 12;
export const REVIEW_ANALYSIS_MOVETIME_MS = 300;
export const REVIEW_MULTI_PV = 3;
export const REVIEW_PV_PLIES = 10;
export const REVIEW_KEY_MULTI_PV = 4;
export const REVIEW_KEY_DEPTH = 14;
export const REVIEW_KEY_MOVETIME_MS = 700;
export const REVIEW_MAX_PLIES = 160;

function whiteCpFromAnalysis(analysis: Analysis | null, fen: string): number {
  if (!analysis) return 0;
  const line = analysis.lines.find((l) => l.multipv === 1) ?? analysis.lines[0];
  if (!line) return 0;
  const cp = scoreToCp(line.score);
  return sideToMove(analysis.fen || fen) === 'w' ? cp : -cp;
}

function terminalWhiteCp(fen: string): number | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isGameOver()) return null;
    if (chess.isCheckmate()) return sideToMove(fen) === 'w' ? -MATE_CP : MATE_CP;
    return 0;
  } catch {
    return 0;
  }
}

async function analyzePosition(
  engine: EnginePort,
  fen: string,
  signal: AbortSignal | undefined,
  limits?: { multiPv?: number; depth?: number; moveTimeMs?: number },
): Promise<Analysis | null> {
  const terminal = terminalWhiteCp(fen);
  if (terminal !== null) return null;
  try {
    return await engine.analyze(fen, limits?.multiPv ?? REVIEW_MULTI_PV, {
      depth: limits?.depth ?? REVIEW_ANALYSIS_DEPTH,
      moveTimeMs: limits?.moveTimeMs ?? REVIEW_ANALYSIS_MOVETIME_MS,
      signal,
    });
  } catch {
    if (signal?.aborted) throw abortError();
    return null;
  }
}

function pvSansFrom(fen: string, analysis: Analysis | null, maxLines = REVIEW_MULTI_PV): string[][] {
  if (!analysis) return [];
  return analysis.lines
    .slice(0, maxLines)
    .map((line) => uciToSan(fen, line.pv.slice(0, REVIEW_PV_PLIES)))
    .filter((line) => line.length > 0);
}

export function skeletonMoves(startFen: string, sans: string[]): AnnotatedMove[] {
  const chess = new Chess(startFen);
  const out: AnnotatedMove[] = [];
  for (let i = 0; i < sans.length; i++) {
    const side = chess.turn();
    const fenBefore = chess.fen();
    const move = chess.move(sans[i]);
    const uci = move.from + move.to + (move.promotion ?? '');
    out.push({
      ply: i + 1,
      san: move.san,
      uci,
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
      fenBefore,
      fenAfter: chess.fen(),
      side,
      evalBefore: 0,
      evalAfter: 0,
      quality: 'good',
      bestSan: '',
      bestUci: '',
      pvSans: [],
      key: false,
      nag: '',
    });
  }
  return out;
}

export async function annotateGame(
  engine: EnginePort,
  pgn: string,
  opts: {
    signal?: AbortSignal;
    onProgress?: (progress: AnnotateProgress) => void;
  } = {},
): Promise<AnnotatedGame> {
  const parsed = parsePgn(pgn);
  const sans = parsed.moves.slice(0, REVIEW_MAX_PLIES);
  if (sans.length === 0) {
    return { pgn, headers: parsed.headers, startFen: parsed.startFen, moves: [] };
  }

  const chess = new Chess(parsed.startFen);
  const fens = [parsed.startFen];
  const played: { san: string; uci: string; from: string; to: string; promotion?: string; side: 'w' | 'b' }[] = [];
  for (const san of sans) {
    const side = chess.turn();
    const move = chess.move(san);
    const uci = move.from + move.to + (move.promotion ?? '');
    played.push({
      san: move.san,
      uci,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      side,
    });
    fens.push(chess.fen());
  }

  const total = fens.length;
  const analyses: (Analysis | null)[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (opts.signal?.aborted) throw abortError();
    opts.onProgress?.({ done: i, total });
    analyses.push(await analyzePosition(engine, fens[i], opts.signal));
    opts.onProgress?.({ done: i + 1, total });
  }

  let moves: AnnotatedMove[] = played.map((item, index) => {
    const fenBefore = fens[index];
    const fenAfter = fens[index + 1];
    const before = analyses[index];
    const evalBefore = whiteCpFromAnalysis(before, fenBefore);
    const evalAfter = terminalWhiteCp(fenAfter) ?? whiteCpFromAnalysis(analyses[index + 1], fenAfter);
    const bestUci = before?.bestMove ?? '';
    const bestSan = bestUci ? (uciToSan(fenBefore, [bestUci])[0] ?? '') : '';
    const sideEvalBefore = item.side === 'w' ? evalBefore : -evalBefore;
    const sideEvalAfter = item.side === 'w' ? evalAfter : -evalAfter;
    const quality = classifyMove({
      evalBefore: sideEvalBefore,
      evalAfter: sideEvalAfter,
      userMoveUci: item.uci,
      bestMoveUci: bestUci || item.uci,
    });
    return {
      ply: index + 1,
      san: item.san,
      uci: item.uci,
      from: item.from,
      to: item.to,
      ...(item.promotion ? { promotion: item.promotion } : {}),
      fenBefore,
      fenAfter,
      side: item.side,
      evalBefore,
      evalAfter,
      quality,
      bestSan,
      bestUci,
      pvSans: pvSansFrom(fenBefore, before),
      key: false,
      nag: nagFromQuality(quality),
    };
  });

  moves = markKeyMoves(moves);
  for (let i = 0; i < moves.length; i++) {
    if (!moves[i].key) continue;
    if (opts.signal?.aborted) throw abortError();
    const deeper = await analyzePosition(engine, moves[i].fenBefore, opts.signal, {
      multiPv: REVIEW_KEY_MULTI_PV,
      depth: REVIEW_KEY_DEPTH,
      moveTimeMs: REVIEW_KEY_MOVETIME_MS,
    });
    if (!deeper) continue;
    const bestUci = deeper.bestMove || moves[i].bestUci;
    const bestSan = bestUci ? (uciToSan(moves[i].fenBefore, [bestUci])[0] ?? moves[i].bestSan) : moves[i].bestSan;
    const pvSans = pvSansFrom(moves[i].fenBefore, deeper, REVIEW_KEY_MULTI_PV);
    moves[i] = {
      ...moves[i],
      bestUci,
      bestSan,
      pvSans: pvSans.length ? pvSans : moves[i].pvSans,
    };
  }

  return {
    pgn,
    headers: parsed.headers,
    startFen: parsed.startFen,
    moves,
  };
}
