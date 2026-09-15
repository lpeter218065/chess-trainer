// @vitest-environment jsdom
import { createElement, type CSSProperties } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { CampaignLevelPage } from '../src/pages/CampaignLevelPage';

const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 350 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 350 });
});

afterEach(() => {
  cleanup();
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

describe('campaign option hover highlights the board', () => {
  it('lights the squares an option talks about, then clears on leave', async () => {
    await act(async () => {
      renderLevel();
    });

    const e5 = screen.getByRole('button', { name: /其实该走 e5/ });
    expect(e5.getAttribute('data-preview-squares')).toBe('e5');
    expect(screen.getByTestId('chessboard').getAttribute('data-hover')).toBe('');

    fireEvent.pointerEnter(e5);
    expect(screen.getByTestId('chessboard').getAttribute('data-hover')).toBe('e5');

    fireEvent.pointerLeave(e5);
    expect(screen.getByTestId('chessboard').getAttribute('data-hover')).toBe('');
  });

  it('shows the c-pawn stare on the sicilian answer', async () => {
    await act(async () => {
      renderLevel();
    });

    fireEvent.pointerEnter(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    expect(screen.getByTestId('chessboard').getAttribute('data-hover')).toBe('c5,d4');
  });

  it('highlights follow-up tap squares after the first answer', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    const a4 = screen.getByRole('button', { name: 'a4' });
    fireEvent.pointerEnter(a4);
    expect(screen.getByTestId('chessboard').getAttribute('data-hover')).toBe('a4');
  });

  it('keeps the follow-up explanation when the recognize level finishes', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    expect(screen.getByText(/盯着哪个格子/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    expect(screen.getByText(/盯 d4/)).toBeTruthy();
    expect(screen.getAllByText(/思路卡/).length).toBeGreaterThan(0);
  });

  it('restarts a finished recognize level from 再打一次', async () => {
    await act(async () => {
      renderLevel();
    });
    fireEvent.click(screen.getByRole('button', { name: /用 c 兵盯 d4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    fireEvent.click(screen.getByRole('button', { name: '再打一次' }));
    expect(screen.getByText(/西西里为什么回 c5/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /用 c 兵盯 d4/ })).toBeTruthy();
  });
});
