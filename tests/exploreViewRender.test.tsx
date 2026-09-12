// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Chess } from 'chess.js';
import { mockChessboardWithCounter, installDomPolyfills } from './helpers/renderProbe';

const probe = mockChessboardWithCounter();

import { createExploreStore } from '../src/store/explore';
import type { EnginePort } from '../src/engine/engineService';
import type { LlmPort } from '../src/store/session';
import { resetMoveTreeIds } from '../src/chess/moveTree';
import { useSettings } from '../src/store/settings';
import { ExploreView } from '../src/pages/ExplorePage';

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
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

/** 可控 LLM：先吐第一段，等 release() 后再吐第二段 */
function gatedLlm() {
  let release: (() => void) | null = null;
  const port: LlmPort & { release(): void } = {
    async *stream() {
      yield '第一段';
      await new Promise<void>((r) => { release = r; });
      yield '第二段';
    },
    release: () => release?.(),
  };
  return port;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitIdle(store: ReturnType<typeof createExploreStore>) {
  for (let i = 0; i < 50; i++) {
    if (!store.getState().analyzing) return;
    await sleep(10);
  }
}

describe('ExploreView 流式期间的渲染', () => {
  beforeAll(() => installDomPolyfills());
  beforeEach(() => { resetMoveTreeIds(); useSettings.getState().setLlm({ apiKey: 'test-key' }); });
  afterEach(() => cleanup());

  it('讲解流式追加文本时，棋盘组件不重渲染', async () => {
    const llm = gatedLlm();
    const store = createExploreStore(fakeEngine(), llm, { llmDebounceMs: 0 });
    store.getState().loadStart();
    await waitIdle(store);

    render(<MemoryRouter><ExploreView store={store} /></MemoryRouter>);

    await act(async () => {
      const p = store.getState().requestCommentary();
      await sleep(150);
      void p;
    });
    expect(store.getState().commentary).toBe('第一段');
    const before = probe.count();
    expect(before).toBeGreaterThan(0);

    await act(async () => {
      llm.release();
      await sleep(150);
    });
    expect(store.getState().commentary).toBe('第一段第二段');
    expect(probe.count()).toBe(before);
  });

  it('places the follow-up composer in the pinned footer after commentary', async () => {
    const llm: LlmPort = {
      async *stream() {
        yield '中心争夺';
      },
    };
    const store = createExploreStore(fakeEngine(), llm, { llmDebounceMs: 0 });
    store.getState().loadStart();
    await waitIdle(store);

    const { container } = render(
      <MemoryRouter>
        <ExploreView store={store} />
      </MemoryRouter>,
    );

    await act(async () => {
      await store.getState().requestCommentary();
    });

    const input = screen.getByPlaceholderText('继续问教练…');
    const footer = container.querySelector('[data-testid="trainer-footer"]');
    expect(footer).toBeTruthy();
    expect(footer?.contains(input)).toBe(true);
    expect(container.querySelector('.trainer-panel-scroll')?.contains(footer as Node)).toBe(false);
  });
});
