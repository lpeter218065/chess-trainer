import { Chess } from 'chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MID = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 6';

function tapInputsSlow(fen) {
  const chess = new Chess(fen);
  const turn = chess.turn();
  const legalMoves = chess.moves({ verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
  }));
  const ownPieceSquares = new Set();
  for (const file of 'abcdefgh') {
    for (const rank of '12345678') {
      const sq = `${file}${rank}`;
      const p = chess.get(sq);
      if (p && p.color === turn) ownPieceSquares.add(sq);
    }
  }
  return { legalMoves, ownPieceSquares };
}

function tapInputsFast(fen) {
  const chess = new Chess(fen);
  const turn = chess.turn();
  const legalMoves = chess.moves({ verbose: true }).map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
  }));
  const ownPieceSquares = new Set();
  for (const row of chess.board()) {
    for (const p of row) {
      if (p && p.color === turn) ownPieceSquares.add(p.square);
    }
  }
  return { legalMoves, ownPieceSquares };
}

function bench(fn, fen, n = 8000) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(fen);
  return performance.now() - t0;
}

for (const fen of [START, MID]) {
  const slow = bench(tapInputsSlow, fen);
  const fast = bench(tapInputsFast, fen);
  console.log(JSON.stringify({ fen: fen.slice(0, 20), slowMs: slow, fastMs: fast, deltaPct: Math.round(((slow - fast) / slow) * 100) }));
}
