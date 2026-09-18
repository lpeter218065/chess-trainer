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
{"type":"variation","ply":2,"intro":"如果 1...c5","lines":[{"label":"1","moves":"c5","text":"西西里。"}]}
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
    expect(await screen.findByRole('tab', { name: '讲解' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '总结' })).toBeTruthy();
    expect(store.getState().ply).toBe(2);
    const visible = () => document.querySelector('#review-book .review-step:not([hidden])');
    expect(visible()?.textContent).toContain('对称应着。');
    expect(visible()?.textContent).not.toContain('中心一兵。');
    expect(visible()?.querySelector('[data-testid="review-var-board"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '总结' }));
    expect(screen.getByRole('heading', { level: 2, name: '王翼进攻' })).toBeTruthy();
    expect(screen.getAllByText('本局白方抢攻王翼。').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: '讲解' }));
    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(store.getState().ply).toBe(1);
    expect(visible()?.textContent).toContain('中心一兵。');
    expect(visible()?.textContent).not.toContain('对称应着。');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(store.getState().ply).toBe(2);
    expect(visible()?.textContent).toContain('对称应着。');
    expect(store.getState().document?.blocks.filter((b) => b.type === 'move')).toHaveLength(2);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '打印' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});
