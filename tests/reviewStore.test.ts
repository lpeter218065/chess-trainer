import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { createReviewStore } from '../src/store/review';
import type { EnginePort } from '../src/engine/engineService';
import type { LlmPort } from '../src/store/session';

function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    if (!m) return 'e2e4';
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 8, multipv: 1, score: { cp: 15 }, pv: [bm] }] };
    },
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

function ndjsonFor(pgnMoves: string[]): string {
  const lines = [`{"title":"测试复盘","overview":"开局简述。"}`];
  pgnMoves.forEach((san, i) => {
    lines.push(JSON.stringify({ type: 'move', ply: i + 1, san, nag: '', text: `${san} 的短评。` }));
  });
  return lines.join('\n');
}

describe('createReviewStore', () => {
  it('writes the whole review after scoring, not per clicked ply', async () => {
    const sans = ['e4', 'e5', 'Nf3'];
    const llm: LlmPort = {
      async *stream() {
        yield ndjsonFor(sans);
      },
    };
    const store = createReviewStore(fakeEngine(), llm);
    await store.getState().startFromPgn('1. e4 e5 2. Nf3');
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.moves).toHaveLength(3);
    const moveBlocks = s.document?.blocks.filter((b) => b.type === 'move') ?? [];
    expect(moveBlocks).toHaveLength(3);
    expect(moveBlocks.map((b) => b.type === 'move' ? b.ply : 0)).toEqual([1, 2, 3]);
    s.setPly(1);
    expect(store.getState().document?.blocks.filter((b) => b.type === 'move')).toHaveLength(3);
    expect(store.getState().annotatedPgn).toContain('1. e4');
    expect(store.getState().annotatedPgn).toContain('2. Nf3');
  });

  it('expands KEY variations in a second LLM call and writes them into the PGN', async () => {
    const calls: string[] = [];
    const llm: LlmPort = {
      async *stream(messages) {
        calls.push(messages[messages.length - 1]?.content.slice(0, 40) ?? '');
        if (calls.length === 1) {
          yield `{"title":"t","overview":"o"}\n{"type":"move","ply":1,"san":"e4","text":"中心。"}\n{"type":"move","ply":2,"san":"e5","text":"对称。"}`;
          return;
        }
        yield `{"type":"variation","ply":1,"intro":"如果1.d4","lines":[{"label":"1","moves":"d4 d5","text":"后兵。"}]}`;
      },
    };
    const store = createReviewStore(fakeEngine(), llm);
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    store.getState().hydrateSnapshot({
      pgn: '1. e4 e5',
      headers: { Result: '*' },
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [
        {
          ply: 1, san: 'e4', uci: 'e2e4', from: 'e2', to: 'e4',
          fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          fenAfter: afterE4, side: 'w', evalBefore: 30, evalAfter: -80,
          quality: 'blunder', bestSan: 'd4', bestUci: 'd2d4',
          pvSans: [['d4', 'd5'], ['c4', 'e5']], key: true, nag: '??',
        },
        {
          ply: 2, san: 'e5', uci: 'e7e5', from: 'e7', to: 'e5',
          fenBefore: afterE4, fenAfter: afterE4, side: 'b',
          evalBefore: 20, evalAfter: 20, quality: 'good', bestSan: 'e5', bestUci: 'e7e5',
          pvSans: [['e5']], key: false, nag: '',
        },
      ],
      document: { title: 'old', overview: 'old', blocks: [] },
      ply: 2,
      orientation: 'white',
    });
    await store.getState().retryWrite();
    expect(calls.length).toBe(2);
    expect(calls[1]).toContain('KEY');
    const vars = store.getState().document?.blocks.filter((b) => b.type === 'variation') ?? [];
    expect(vars.length).toBeGreaterThan(0);
    expect(store.getState().annotatedPgn).toContain('(1. d4');
  });

  it('rejects empty PGN', async () => {
    const llm: LlmPort = { async *stream() { yield ''; } };
    const store = createReviewStore(fakeEngine(), llm);
    await store.getState().startFromPgn('   ');
    expect(store.getState().status).toBe('error');
  });
});
