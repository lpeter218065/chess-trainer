import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import { createExploreStore } from '../src/store/explore';
import type { EnginePort } from '../src/engine/engineService';
import type { LlmPort } from '../src/store/session';
import { pathSans, resetMoveTreeIds } from '../src/chess/moveTree';
import { START_FEN } from '../src/chess/pgn';

function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 12, multipv: 1, score: { cp: 20 }, pv: [bm] }] };
    },
    async opponentMove(fen) {
      return first(fen);
    },
    dispose() {},
  };
}

function capturingLlm(): LlmPort & { calls: { role: string; content: string }[][] } {
  const port = {
    calls: [] as { role: string; content: string }[][],
    async *stream(messages: { role: string; content: string }[]) {
      port.calls.push(messages.map((m) => ({ role: m.role, content: m.content })));
      yield 'ok';
    },
  };
  return port;
}

const fakeLlm: LlmPort = {
  async *stream() {
    yield 'ok';
  },
};

async function waitIdle(store: ReturnType<typeof createExploreStore>) {
  for (let i = 0; i < 50; i++) {
    if (!store.getState().analyzing) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('explore variation tree', () => {
  beforeEach(() => resetMoveTreeIds());

  it('回退后走不同着法会分叉，两条线都保留', async () => {
    const store = createExploreStore(fakeEngine(), fakeLlm);
    store.getState().loadStart();
    await waitIdle(store);

    // e2e4, e7e5, g1f3
    expect(await store.getState().makeMove('e2', 'e4')).toBe(true);
    await waitIdle(store);
    expect(await store.getState().makeMove('e7', 'e5')).toBe(true);
    await waitIdle(store);
    expect(await store.getState().makeMove('g1', 'f3')).toBe(true);
    await waitIdle(store);

    expect(pathSans(store.getState().tree, store.getState().path)).toEqual(['e4', 'e5', 'Nf3']);

    // back to after e5 (depth 2)
    store.getState().setReviewDepth(2);
    await waitIdle(store);
    expect(store.getState().isLive()).toBe(false);

    // play Bc4 instead
    expect(await store.getState().makeMove('f1', 'c4')).toBe(true);
    await waitIdle(store);

    const s = store.getState();
    expect(pathSans(s.tree, s.path)).toEqual(['e4', 'e5', 'Bc4']);
    const e5 = s.path[1];
    expect(s.tree.nodes[e5].children).toHaveLength(2);
    expect(s.tree.nodes[s.tree.nodes[e5].children[0]].san).toBe('Nf3');
    expect(s.tree.nodes[s.tree.nodes[e5].children[1]].san).toBe('Bc4');
  });

  it('在分叉点重走已有着法会切到已有分支', async () => {
    const store = createExploreStore(fakeEngine(), fakeLlm);
    store.getState().loadStart();
    await waitIdle(store);
    await store.getState().makeMove('e2', 'e4');
    await waitIdle(store);
    await store.getState().makeMove('e7', 'e5');
    await waitIdle(store);
    await store.getState().makeMove('g1', 'f3');
    await waitIdle(store);
    store.getState().setReviewDepth(2);
    await waitIdle(store);
    await store.getState().makeMove('f1', 'c4');
    await waitIdle(store);

    store.getState().setReviewDepth(2);
    await waitIdle(store);
    await store.getState().makeMove('g1', 'f3');
    await waitIdle(store);

    const s = store.getState();
    expect(pathSans(s.tree, s.path)).toEqual(['e4', 'e5', 'Nf3']);
    const e5 = s.path[1];
    expect(s.tree.nodes[e5].children).toHaveLength(2); // no third child
  });

  it('selectNode 切换到变着路径', async () => {
    const store = createExploreStore(fakeEngine(), fakeLlm);
    store.getState().loadStart();
    await waitIdle(store);
    await store.getState().makeMove('e2', 'e4');
    await waitIdle(store);
    await store.getState().makeMove('e7', 'e5');
    await waitIdle(store);
    await store.getState().makeMove('g1', 'f3');
    await waitIdle(store);
    store.getState().setReviewDepth(2);
    await waitIdle(store);
    await store.getState().makeMove('f1', 'c4');
    await waitIdle(store);

    const e5 = store.getState().path[1];
    const nf3 = store.getState().tree.nodes[e5].children[0];
    store.getState().selectNode(nf3);
    await waitIdle(store);

    const s = store.getState();
    expect(pathSans(s.tree, s.path)).toEqual(['e4', 'e5', 'Nf3']);
    expect(s.viewedPly()).toBe(3);
    expect(s.startFen).toBe(START_FEN);
  });

  it('同一条线的下一手讲解续写 GPT session，重新推理则新开', async () => {
    const llm = capturingLlm();
    const store = createExploreStore(fakeEngine(), llm);
    store.getState().loadStart();
    await waitIdle(store);

    await store.getState().requestCommentary();
    await waitIdle(store);
    for (let i = 0; i < 30 && store.getState().llmStreaming; i++) await new Promise((r) => setTimeout(r, 10));
    expect(llm.calls[0]?.[0]?.role).toBe('system');
    expect(llm.calls[0]?.some((m) => m.content.includes('自由探索'))).toBe(true);

    expect(await store.getState().makeMove('e2', 'e4')).toBe(true);
    await waitIdle(store);
    await store.getState().requestCommentary();
    for (let i = 0; i < 30 && store.getState().llmStreaming; i++) await new Promise((r) => setTimeout(r, 10));
    const second = llm.calls[1];
    expect(second.some((m) => m.content === 'ok')).toBe(true);
    expect(second.some((m) => m.content.includes('续同一条线') || m.content.includes('局面推进'))).toBe(true);

    await store.getState().requestCommentary({ forceNew: true });
    for (let i = 0; i < 30 && store.getState().llmStreaming; i++) await new Promise((r) => setTimeout(r, 10));
    const third = llm.calls[2];
    expect(third.some((m) => m.content.includes('自由探索'))).toBe(true);
    expect(third.some((m) => m.content === 'ok')).toBe(false);
  });

  it('局面判断快速连点只打一次大模型', async () => {
    const llm = capturingLlm();
    const store = createExploreStore(fakeEngine(), llm, { llmDebounceMs: 40 });
    store.getState().loadStart();
    await waitIdle(store);
    void store.getState().requestAssessment('w');
    void store.getState().requestAssessment('w');
    void store.getState().requestAssessment('w');
    expect(llm.calls.length).toBe(0);
    await new Promise((r) => setTimeout(r, 80));
    for (let i = 0; i < 30 && store.getState().llmStreaming; i++) await new Promise((r) => setTimeout(r, 10));
    expect(llm.calls.length).toBe(1);
    expect(llm.calls[0].some((m) => m.content.includes('局面判断') || m.content.includes('白方'))).toBe(true);
  });

  it('引擎分析未完成时也可以立刻走子', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let analyzes = 0;
    const engine: EnginePort = {
      async analyze(fen) {
        analyzes += 1;
        if (analyzes === 1) await gate;
        const m = new Chess(fen).moves({ verbose: true })[0];
        const bm = m.from + m.to + (m.promotion ?? '');
        return { fen, bestMove: bm, lines: [{ depth: 12, multipv: 1, score: { cp: 20 }, pv: [bm] }] };
      },
      async opponentMove(fen) {
        const m = new Chess(fen).moves({ verbose: true })[0];
        return m.from + m.to + (m.promotion ?? '');
      },
      dispose() {},
    };
    const store = createExploreStore(engine, fakeLlm);
    store.getState().loadStart();
    expect(store.getState().analyzing).toBe(true);
    expect(await store.getState().makeMove('e2', 'e4')).toBe(true);
    expect(pathSans(store.getState().tree, store.getState().path)).toEqual(['e4']);
    release();
    await waitIdle(store);
  });
});
