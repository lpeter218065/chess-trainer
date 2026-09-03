import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { createSessionStore, type LlmPort } from '../src/store/session';
import type { EnginePort } from '../src/engine/engineService';
import { lessonById } from '../src/lessons';
import { difficultyById } from '../src/engine/difficulty';

/** 假引擎：最佳着法 = 第一个合法着法；评估恒为 +20（行棋方视角） */
function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 16, multipv: 1, score: { cp: 20 }, pv: [bm] }] };
    },
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

function fakeLlm(chunks = ['讲', '解']): LlmPort & { calls: number } {
  const port = {
    calls: 0,
    async *stream() { port.calls++; for (const c of chunks) yield c; },
  };
  return port;
}

const lesson = lessonById('opening/italian-game')!;
const diff = difficultyById('medium');

describe('session store', () => {
  it('start 后进入 userTurn，intro 流式写入', async () => {
    const llm = fakeLlm();
    const store = createSessionStore({ engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    const s = store.getState();
    expect(s.phase).toBe('userTurn');
    expect(s.intro).toBe('讲解');
    expect(s.fen).toBe(lesson.startFen);
    expect(s.analysisBefore?.fen).toBe(lesson.startFen);
  });

  it('非法着法被拒绝', async () => {
    const store = createSessionStore({ engine: fakeEngine(), llm: fakeLlm() });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    expect(await store.getState().playUserMove('e1', 'e5')).toBe(false);
    expect(store.getState().rounds.length).toBe(0);
  });

  it('合法着法：引擎应手、质量分级、讲解流式写入 round', async () => {
    const llm = fakeLlm();
    const store = createSessionStore({ engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    const ok = await store.getState().playUserMove('d2', 'd3');
    expect(ok).toBe(true);
    await store.getState().whenIdle();
    const s = store.getState();
    expect(s.rounds.length).toBe(1);
    expect(s.rounds[0].userMove.san).toBe('d3');
    expect(s.rounds[0].engineMove?.san).toBeTruthy();
    expect(s.history.length).toBe(2);
    expect(['best', 'good', 'inaccuracy', 'mistake', 'blunder']).toContain(s.rounds[0].userMove.quality);
    expect(s.rounds[0].commentary).toBe('讲解');
    expect(s.phase).toBe('userTurn');
    expect(llm.calls).toBe(2); // intro + 1 次讲解
  });

  it('走满 plies 后 finished 并产出总结与结果', async () => {
    let finished: { id: string; outcome: string } | null = null;
    const store = createSessionStore({ engine: fakeEngine(), llm: fakeLlm(), onFinished: (id, outcome) => { finished = { id, outcome }; } });
    const short = { ...lesson, stop: { kind: 'plies', count: 2 } as const };
    await store.getState().start(short, diff);
    await store.getState().whenIdle();
    for (let i = 0; i < 2; i++) {
      const s = store.getState();
      const m = new Chess(s.fen).moves({ verbose: true }).find((x) => x.piece === 'p')!;
      expect(await s.playUserMove(m.from, m.to)).toBe(true);
      await store.getState().whenIdle();
    }
    const s = store.getState();
    expect(s.phase).toBe('finished');
    expect(s.result).not.toBeNull();
    expect(s.summary).toBe('讲解');
    expect(finished!.id).toBe(short.id);
  });

  it('hint 一级出文字、二级出箭头并标记 hintUsed', async () => {
    const store = createSessionStore({ engine: fakeEngine(), llm: fakeLlm(['提', '示']) });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    await store.getState().requestHint(1);
    await store.getState().whenIdle();
    expect(store.getState().hintText).toBe('提示');
    await store.getState().requestHint(2);
    const best = store.getState().analysisBefore!.bestMove;
    expect(store.getState().hintArrow).toEqual({ from: best.slice(0, 2), to: best.slice(2, 4) });
    expect(store.getState().hintUsed).toBe(true);
  });

  it('LLM 出错时记录 error，对弈继续', async () => {
    const llm: LlmPort = { async *stream() { throw new Error('boom'); } };
    const store = createSessionStore({ engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    expect(store.getState().llmError).toContain('boom');
    expect(store.getState().phase).toBe('userTurn');
  });
});
