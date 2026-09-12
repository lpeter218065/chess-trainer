// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';

const chessboardProbe = vi.hoisted(() => ({ renders: 0 }));

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options?: { id?: string } }) => {
    chessboardProbe.renders += 1;
    return createElement('button', { type: 'button', 'data-board-id': options?.id }, 'visual piece');
  },
}));

import { MiniBoard } from '../src/components/MiniBoard';

const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeEach(() => {
  chessboardProbe.renders = 0;
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 200,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 200,
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

describe('MiniBoard readonly semantics', () => {
  it('labels the orientation and makes only the visual subtree inert', () => {
    const onNext = vi.fn();
    render(
      <div>
        <MiniBoard
          fen="start"
          orientation="white"
          lastMove={null}
          boardId="mini-test"
        />
        <button type="button" onClick={onNext}>下一步</button>
      </div>,
    );

    const wrapper = screen.getByRole('img', { name: '只读小棋盘，白方视角' });
    const visual = wrapper.querySelector('[inert]') as HTMLElement | null;
    expect(visual).toBeTruthy();
    expect(visual?.classList.contains('pointer-events-none')).toBe(true);
    expect(visual?.getAttribute('aria-hidden')).toBe('true');
    expect(visual?.querySelectorAll('button')).toHaveLength(1);
    expect(chessboardProbe.renders).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('uses the black orientation in the accessible label', () => {
    render(
      <MiniBoard
        fen="start"
        orientation="black"
        lastMove={null}
        boardId="mini-black"
      />,
    );

    expect(screen.getByRole('img', { name: '只读小棋盘，黑方视角' })).toBeTruthy();
  });
});
