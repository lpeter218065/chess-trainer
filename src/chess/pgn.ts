import { Chess } from 'chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function parsePgn(pgn: string): {
  startFen: string;
  moves: string[];
  headers: Record<string, string>;
} {
  const chess = new Chess();
  chess.loadPgn(pgn.trim(), { strict: false });
  const headers = chess.getHeaders();
  const moves = chess.history();
  const fromHeader = headers.FEN ? parseFen(headers.FEN) : null;
  return { startFen: fromHeader ?? START, moves, headers };
}

export function parseFen(fen: string): string | null {
  try {
    return new Chess(fen.trim()).fen();
  } catch {
    return null;
  }
}

export { START as START_FEN };
