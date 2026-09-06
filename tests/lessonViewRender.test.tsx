// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Chess } from 'chess.js';
import { mockChessboardWithCounter, installDomPolyfills } from './helpers/renderProbe';

const probe = mockChessboardWithCounter();

import { createSessionStore, type LlmPort } from '../src/store/session';
import type { EnginePort } from '../src/engine/engineService';
import { lessonById } from '../src/lessons';
import { difficultyById } from '../src/engine/difficulty';
import { LessonView } from '../src/pages/LessonPage';

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

/** 可控 LLM：先吐第一段，等 release() 后再吐第二段 */
function gatedLlm() {
  let release: (() => void) | null = null;
  let calls = 0;
  const port: LlmPort & { release(): void; calls(): number } = {
    async *stream() {
      calls += 1;
      if (calls === 1) { yield '开场'; return; }            // intro
      yield '第一段';
      await new Promise<void>((r) => { release = r; });
      yield '第二段';
    },
    release: () => release?.(),
    calls: () => calls,
  };
  return port;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lesson = lessonById('opening/italian-game')!;
const diff = difficultyById('medium');

describe('LessonView 流式期间的渲染', () => {
  beforeAll(() => installDomPolyfills());
  afterEach(() => cleanup());

  it('讲解流式追加文本时，棋盘组件不重渲染', async () => {
    const llm = gatedLlm();
    const store = createSessionStore({ llmDebounceMs: 0, engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();

    render(
      <MemoryRouter>
        <LessonView
          store={store}
          lesson={lesson}
          expectedLessonId={lesson.id}
          difficultyId="medium"
          onDifficulty={() => {}}
          onBack={() => {}}
        />
      </MemoryRouter>,
    );

    await act(async () => {
      await store.getState().playUserMove('d2', 'd3');
      await sleep(150); // 让第一段 flush 出来
    });
    expect(store.getState().rounds[0]?.commentary).toBe('第一段');
    const before = probe.count();

    await act(async () => {
      llm.release();
      await sleep(150);
    });
    expect(store.getState().rounds[0]?.commentary).toBe('第一段第二段');
    expect(probe.count()).toBe(before);
  });
});
