import { Chess } from 'chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function parsePgn(pgn: string): { startFen: string; moves: string[] } {
  const chess = new Chess();
  chess.loadPgn(pgn.trim(), { strict: false });
  const moves = chess.history();
  chess.reset();
  return { startFen: chess.fen(), moves };
}

export function parseFen(fen: string): string | null {
  try {
    return new Chess(fen.trim()).fen();
  } catch {
    return null;
  }
}

export { START as START_FEN };
