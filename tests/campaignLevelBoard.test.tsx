// @vitest-environment jsdom
import { createElement, type CSSProperties } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: { boardStyle?: CSSProperties } }) =>
    createElement('div', {
      'data-testid': 'chessboard',
      'data-side': String(
        typeof options?.boardStyle?.width === 'number' ? options.boardStyle.width : 0,
      ),
    }),
}));

import { CampaignLevelPage } from '../src/pages/CampaignLevelPage';

const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

function sizeOf(el: HTMLElement): { w: number; h: number } {
  // 390 宽的手机：page-shell clientWidth 含左右 padding，内容区只有 350。
  if (el.classList.contains('page-shell')) return { w: 390, h: 844 };
  if (el.classList.contains('campaign-board')) return { w: 350, h: 350 };
  if (el.classList.contains('campaign-board-well')) return { w: 350, h: 350 };
  if (el.classList.contains('chess-board-surface')) return { w: 350, h: 350 };
  return { w: 350, h: 100 };
}

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return sizeOf(this).w; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return sizeOf(this).h; },
  });
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

describe('campaign level board sizing', () => {
  it('sizes the board to the content box, not page-shell padding box', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/campaign/sicilian-1']}>
          <Routes>
            <Route path="/campaign/:id" element={<CampaignLevelPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const host = document.querySelector('.campaign-board');
    expect(host).toBeTruthy();
    expect(host?.querySelector('.campaign-board-well .chess-board-surface')).toBeTruthy();
    expect(host?.closest('.page-shell')).toBeTruthy();
    const stage = document.querySelector('.campaign-stage');
    expect(stage).toBeTruthy();
    expect(stage?.querySelector('.campaign-board')).toBeTruthy();
    expect(stage?.querySelector('.campaign-side')).toBeTruthy();
    expect(document.querySelector('.campaign-prompt')).toBeTruthy();

    const board = screen.getByTestId('chessboard');
    // 若按 page-shell 的 390 来量，a 线会被 overflow-x:hidden 裁掉。
    expect(board.getAttribute('data-side')).toBe('350');
  });
});
