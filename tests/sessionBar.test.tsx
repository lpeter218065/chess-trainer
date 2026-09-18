// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionBar } from '../src/components/SessionBar';
import { useGameSessions } from '../src/store/gameSessions';

type KeyOptions = {
  isComposing?: boolean;
  keyCode?: number;
};

function dispatchEnter(input: HTMLInputElement, options: KeyOptions = {}): void {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
  });
  if (options.isComposing !== undefined) {
    Object.defineProperty(event, 'isComposing', { configurable: true, value: options.isComposing });
  }
  if (options.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { configurable: true, value: options.keyCode });
  }
  input.dispatchEvent(event);
}

function openSaveAs(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: '当前局面' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '另存为…' }));
  return screen.getByLabelText('名称') as HTMLInputElement;
}

beforeEach(() => {
  useGameSessions.setState({
    metas: {
      explore1: {
        id: 'explore1',
        kind: 'explore',
        title: '当前局面',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
    },
    activeExploreId: 'explore1',
    activeLessonId: null,
    activeReviewId: null,
    currentSessionId: 'explore1',
  });
});

afterEach(() => {
  cleanup();
  useGameSessions.setState({ metas: {}, activeExploreId: null, activeLessonId: null, activeReviewId: null, currentSessionId: null });
});

describe('SessionBar save-as input', () => {
  it('opens a sheet dialog instead of a nav dropdown', () => {
    render(
      <SessionBar
        kind="explore"
        onSwitch={() => {}}
        onNew={() => {}}
        onSaveAs={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '当前局面' }));
    expect(screen.getByRole('dialog', { name: '会话' })).toBeTruthy();
    expect(screen.getByText('当前')).toBeTruthy();
  });

  it('more trigger keeps the title pill out of the nav', () => {
    render(
      <SessionBar
        trigger="more"
        kind="explore"
        onSwitch={() => {}}
        onNew={() => {}}
        onSaveAs={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: '当前局面' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '会话' }));
    expect(screen.getByRole('dialog', { name: '会话' })).toBeTruthy();
  });

  it('课程才是当前时，探索列表不标当前', () => {
    useGameSessions.setState({
      metas: {
        explore1: {
          id: 'explore1',
          kind: 'explore',
          title: '当前局面',
          updatedAt: '2026-09-08T00:00:00.000Z',
        },
        lesson1: {
          id: 'lesson1',
          kind: 'lesson',
          title: '伦敦中局',
          updatedAt: '2026-09-10T14:07:00.000Z',
          lessonId: 'middlegame/london-ne5',
        },
      },
      activeExploreId: 'explore1',
      activeLessonId: 'lesson1',
      currentSessionId: 'lesson1',
    });
    render(
      <SessionBar
        kind="explore"
        onSwitch={() => {}}
        onNew={() => {}}
        onSaveAs={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '当前局面' }));
    expect(screen.queryByText('当前')).toBeNull();
  });

  it('ignores IME Enter and saves once on normal Enter', () => {
    const onSaveAs = vi.fn();
    render(
      <SessionBar
        kind="explore"
        onSwitch={() => {}}
        onNew={() => {}}
        onSaveAs={onSaveAs}
      />,
    );
    const input = openSaveAs();
    fireEvent.change(input, { target: { value: '新的标题' } });

    act(() => dispatchEnter(input, { isComposing: true, keyCode: 13 }));
    act(() => dispatchEnter(input, { keyCode: 229 }));
    expect(onSaveAs).not.toHaveBeenCalled();
    expect(screen.getByLabelText('名称')).toBeTruthy();

    act(() => dispatchEnter(input, { keyCode: 13 }));
    expect(onSaveAs).toHaveBeenCalledTimes(1);
    expect(onSaveAs).toHaveBeenCalledWith('新的标题');
    expect(screen.queryByLabelText('名称')).toBeNull();
  });
});
