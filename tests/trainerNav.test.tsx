// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { mockChessboardWithCounter, installDomPolyfills } from './helpers/renderProbe';

mockChessboardWithCounter();

import { createSessionStore, type LlmPort } from '../src/store/session';
import { createExploreStore } from '../src/store/explore';
import type { EnginePort } from '../src/engine/engineService';
import { lessonById } from '../src/lessons';
import { difficultyById } from '../src/engine/difficulty';
import { LessonView } from '../src/pages/LessonPage';
import { ExploreView } from '../src/pages/ExplorePage';
import { useSettings } from '../src/store/settings';
import { resetMoveTreeIds } from '../src/chess/moveTree';

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

const silentLlm: LlmPort = {
  async *stream() {
    yield '讲解';
  },
};

const lesson = lessonById('opening/italian-game')!;
const diff = difficultyById('medium');

describe('trainer nav and toolbar', () => {
  beforeAll(() => installDomPolyfills());
  beforeEach(() => {
    resetMoveTreeIds();
    useSettings.getState().setLlm({ apiKey: 'test-key' });
  });
  afterEach(cleanup);

  it('puts lesson name and difficulty into a tappable summary, not the nav trailing', async () => {
    const store = createSessionStore({ llmDebounceMs: 0, engine: fakeEngine(), llm: silentLlm });
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

    expect(screen.getByRole('button', { name: /意大利开局：慢速 c3-d3 体系 · 中级/ })).toBeTruthy();
    expect(document.querySelector('.trainer-nav-title')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: '意大利开局：慢速 c3-d3 体系' }).classList.contains('sr-only')).toBe(true);
    expect(screen.queryByRole('combobox', { name: '难度' })).toBeNull();
    expect(screen.getByRole('button', { name: '更多' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '候选' })).toBeNull();
    expect(screen.queryByRole('button', { name: '退一步' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /意大利开局：慢速 c3-d3 体系 · 中级/ }));
    expect(screen.getByRole('dialog', { name: '意大利开局：慢速 c3-d3 体系' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '中级' })).toBeTruthy();
  });

  it('keeps a single session entry on explore and stashes 我的分析 in the sheet', async () => {
    const store = createExploreStore(fakeEngine(), silentLlm, { llmDebounceMs: 0 });
    store.getState().loadStart();
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        if (!store.getState().analyzing) break;
        await new Promise((r) => setTimeout(r, 10));
      }
    });

    render(
      <MemoryRouter>
        <ExploreView store={store} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: '我的分析' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '会话' }));
    expect(screen.getByRole('dialog', { name: '会话' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '我的分析' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '更多' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '翻转' })).toBeNull();
  });

  it('shows a configure-key CTA in explore commentary when no key is set', async () => {
    useSettings.getState().setLlm({ apiKey: '' });
    const store = createExploreStore(fakeEngine(), silentLlm, { llmDebounceMs: 0 });
    store.getState().loadStart();
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        if (!store.getState().analyzing) break;
        await new Promise((r) => setTimeout(r, 10));
      }
    });

    render(
      <MemoryRouter>
        <ExploreView store={store} />
      </MemoryRouter>,
    );

    const cta = screen.getAllByRole('button', { name: '去配置 Key' });
    expect(cta.length).toBeGreaterThan(0);
    expect(cta.some((btn) => btn.className.includes('btn-primary'))).toBe(true);
    const explain = screen.getByRole('tab', { name: '讲解' });
    expect(explain.getAttribute('aria-disabled')).toBe('true');
    expect(explain.className).toContain('is-disabled');
    expect(explain.className).not.toContain('is-active');
    fireEvent.click(cta[0]);
    expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy();
  });

  it('无 Key 时课程页不把讲解当主按钮，只留去配置 Key', async () => {
    useSettings.getState().setLlm({ apiKey: '' });
    const store = createSessionStore({ llmDebounceMs: 0, engine: fakeEngine(), llm: silentLlm });
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

    expect(screen.queryByRole('tab', { name: '讲解' })).toBeNull();
    const cta = screen.getByRole('button', { name: '去配置 Key' });
    expect(cta.className).toContain('btn-primary');
    expect(screen.queryByRole('button', { name: '提示思路' })).toBeNull();
  });
});
