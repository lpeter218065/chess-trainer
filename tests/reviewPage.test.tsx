// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { mockChessboardWithCounter, installDomPolyfills } from './helpers/renderProbe';

mockChessboardWithCounter();

import { ReviewView } from '../src/pages/ReviewPage';
import { createReviewStore } from '../src/store/review';
import { useSettings } from '../src/store/settings';
import type { EnginePort } from '../src/engine/engineService';
import type { LlmPort } from '../src/store/session';

function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 8, multipv: 1, score: { cp: 20 }, pv: [bm] }] };
    },
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

describe('ReviewView', () => {
  beforeAll(() => installDomPolyfills());
  beforeEach(() => {
    useSettings.getState().setLlm({ apiKey: 'test-key' });
  });
  afterEach(cleanup);

  it('shows the PGN composer first', () => {
    const llm: LlmPort = { async *stream() { yield ''; } };
    const store = createReviewStore(fakeEngine(), llm);
    render(
      <MemoryRouter>
        <ReviewView store={store} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('PGN')).toBeTruthy();
    expect(screen.getByRole('button', { name: '开始复盘' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打印' })).toBeNull();
  });

  it('renders the book after generating the whole review', async () => {
    const llm: LlmPort = {
      async *stream() {
        yield `{"title":"王翼进攻","overview":"本局白方抢攻王翼。"}
{"type":"move","ply":1,"san":"e4","nag":"","text":"中心一兵。"}
{"type":"move","ply":2,"san":"e5","nag":"","text":"对称应着。"}
{"type":"diagram","ply":2,"caption":"图1"}
`;
      },
    };
    const store = createReviewStore(fakeEngine(), llm);
    render(
      <MemoryRouter>
        <ReviewView store={store} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('PGN'), { target: { value: '1. e4 e5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '开始复盘' }));
    });
    expect(await screen.findByRole('heading', { level: 2, name: '王翼进攻' })).toBeTruthy();
    expect(screen.getByText('本局白方抢攻王翼。')).toBeTruthy();
    expect(screen.getByText('中心一兵。')).toBeTruthy();
    expect(screen.getByText('对称应着。')).toBeTruthy();
    expect(store.getState().document?.blocks.filter((b) => b.type === 'move')).toHaveLength(2);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '打印' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});
