// @vitest-environment jsdom
import { createElement, type CSSProperties } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../src/store/settings';

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: { squareStyles?: Record<string, CSSProperties> } }) =>
    createElement('div', {
      'data-testid': 'chessboard',
      'data-hover': Object.entries(options?.squareStyles ?? {})
        .filter(([, style]) => style.backgroundColor === 'rgba(61, 41, 30, 0.38)')
        .map(([square]) => square)
        .sort()
        .join(','),
    }),
}));

const { stream } = vi.hoisted(() => ({
  stream: vi.fn((_messages: unknown, _opts?: unknown) => {
    async function* chunks() {
      yield '对，再看中心。\n';
      yield '• {{d4}} c 兵盯这里。';
    }
    return chunks();
  }),
}));

vi.mock('../src/llm/port', () => ({
  settingsLlmPort: {
    stream: (messages: unknown, opts: unknown) => stream(messages, opts),
  },
}));

import { CampaignLevelPage } from '../src/pages/CampaignLevelPage';

const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 350 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 350 });
  stream.mockClear();
  useSettings.getState().setLlm({ apiKey: 'test-key' });
});

afterEach(() => {
  cleanup();
  useSettings.getState().setLlm({ apiKey: 'test-key' });
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: originalResizeObserver });
  } else {
    delete (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  }
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  else delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth;
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  else delete (HTMLElement.prototype as unknown as { clientHeight?: number }).clientHeight;
});

function renderLevel(id = 'sicilian-1') {
  return render(
    <MemoryRouter initialEntries={[`/campaign/${id}`]}>
      <Routes>
        <Route path="/campaign/:id" element={<CampaignLevelPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('campaign ask the coach', () => {
  it('shows campaign question chips on a phone without focusing the composer', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    expect(screen.getByRole('button', { name: '再讲细一点' })).toBeTruthy();
  });

  it('does not show the ask box before the canned question is answered', async () => {
    await act(async () => {
      renderLevel();
    });
    expect(screen.queryByRole('button', { name: '再讲细一点' })).toBeNull();
    expect(screen.getByText(/西西里为什么回 c5/)).toBeTruthy();
  });

  it('hides the ask box while a canned follow-up is still open', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    expect(screen.getByText(/盯着哪个格子/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '再讲细一点' })).toBeNull();
  });

  it('lets a kid ask after the teaching beat, and streams an explanation', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    expect(screen.getByRole('button', { name: '再讲细一点' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '对方的计划是什么？' })).toBeNull();
    expect(document.querySelector('.campaign-dock')).toBeTruthy();
    expect(document.querySelector('.page-shell.campaign-level-docked')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '再讲细一点' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/c 兵盯这里/)).toBeTruthy();
    });
    expect(stream).toHaveBeenCalled();
    const messages = stream.mock.calls[0][0] as { content: string }[];
    expect(messages.some((m) => m.content.includes('再讲细一点'))).toBe(true);
    expect(messages.some((m) => m.content.includes('不对称地抢中心'))).toBe(true);
  });

  it('keeps prior turns when the kid asks a second question', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '再讲细一点' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/c 兵盯这里/)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '他想干什么？' }));
    });
    await waitFor(() => {
      expect(stream).toHaveBeenCalledTimes(2);
    });
    const second = stream.mock.calls[1][0] as { role: string; content: string }[];
    expect(second.some((m) => m.role === 'user' && m.content === '再讲细一点')).toBe(true);
    expect(second.some((m) => m.role === 'assistant' && m.content.includes('{{d4}}'))).toBe(true);
    expect(second.at(-1)).toEqual({ role: 'user', content: '他想干什么？' });
    expect(screen.getAllByText('再讲细一点').length).toBeGreaterThan(1);
    expect(screen.getAllByText('他想干什么？').length).toBeGreaterThan(1);
  });

  it('lights board squares mentioned in the coach reply', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '再讲细一点' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/c 兵盯这里/)).toBeTruthy();
    });
    fireEvent.mouseEnter(screen.getByText(/c 兵盯这里/));
    expect(screen.getByTestId('chessboard').getAttribute('data-hover')).toContain('d4');
  });

  it('sends a question the kid typed', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    const input = screen.getByPlaceholderText('问教练…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '走 e5 为什么不行？' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送' }));
    });
    await waitFor(() => {
      expect(stream).toHaveBeenCalled();
    });
    const messages = stream.mock.calls[0][0] as { content: string }[];
    expect(messages.at(-1)?.content).toBe('走 e5 为什么不行？');
    expect(screen.getByText('走 e5 为什么不行？')).toBeTruthy();
  });

  it('clears the thread when the level is replayed', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '再讲细一点' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/c 兵盯这里/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: '再打一次' }));
    expect(screen.queryByText(/c 兵盯这里/)).toBeNull();
    expect(screen.queryByRole('button', { name: '再讲细一点' })).toBeNull();
  });

  it('points to settings when there is no key', async () => {
    useSettings.getState().setLlm({ apiKey: '' });
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    expect(screen.getByText(/打开讲解后可以问教练/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '去配置' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '再讲细一点' })).toBeNull();
  });
});
