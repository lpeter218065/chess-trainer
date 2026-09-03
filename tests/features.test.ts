import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../src/chess/features';

describe('extractFeatures', () => {
  it('初始局面：开局阶段、双方未易位', () => {
    const f = extractFeatures('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w');
    expect(f).toContain('opening-phase');
    expect(f).toContain('own-king-uncastled');
    expect(f).toContain('opp-king-uncastled');
    expect(f).not.toContain('open-file');
  });
  it('IQP 局面：己方孤兵 + 开放线 + 中局', () => {
    const f = extractFeatures('r1bq1rk1/pp2bppp/2n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10', 'w');
    expect(f).toContain('own-isolated-pawn');
    expect(f).toContain('open-file'); // c 线
    expect(f).toContain('middlegame-phase');
    expect(f).not.toContain('own-king-uncastled');
  });
  it('异侧易位', () => {
    const f = extractFeatures('2rq1rk1/pp1bppbp/3p1np1/4n3/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 0 12', 'w');
    expect(f).toContain('opposite-castling');
  });
  it('车残局 + 通路兵 + 后已交换', () => {
    const f = extractFeatures('1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1', 'w');
    expect(f).toContain('rook-endgame');
    expect(f).toContain('endgame-phase');
    expect(f).toContain('own-passed-pawn');
    expect(f).toContain('queens-off');
  });
  it('兵残局', () => {
    expect(extractFeatures('8/4k3/8/3K4/4P3/8/8/8 w - - 0 1', 'w')).toContain('pawn-endgame');
  });
  it('物质差', () => {
    expect(extractFeatures('8/8/8/4k3/8/4K3/8/R7 w - - 0 1', 'w')).toContain('material-up');
    expect(extractFeatures('8/8/8/4k3/8/4K3/8/R7 w - - 0 1', 'b')).toContain('material-down');
  });
});
