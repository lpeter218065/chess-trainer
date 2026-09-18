// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysesPage } from '../src/pages/AnalysesPage';
import { useGameSessions } from '../src/store/gameSessions';

beforeEach(() => {
  useGameSessions.setState({
    metas: {
      explore1: {
        id: 'explore1',
        kind: 'explore',
        title: '当前局面',
        updatedAt: '2026-09-08T00:00:00.000Z',
        summary: '空分析',
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
  vi.restoreAllMocks();
});

describe('AnalysesPage list actions', () => {
  it('toggles the overflow menu closed when the trigger is pressed again', () => {
    render(
      <MemoryRouter>
        <AnalysesPage />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: '更多操作 当前局面' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menuitem', { name: '删除' })).toBeNull();
  });

  it('keeps the current marker and moves delete into the overflow menu', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <AnalysesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重命名' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '更多操作 当前局面' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(useGameSessions.getState().metas.explore1).toBeUndefined();
  });

  it('探索与课程都有活动项时只标一条为当前', () => {
    useGameSessions.setState({
      metas: {
        explore1: {
          id: 'explore1',
          kind: 'explore',
          title: '探索 · 14:06',
          updatedAt: '2026-09-10T15:21:00.000Z',
          summary: '起始局面',
        },
        lesson1: {
          id: 'lesson1',
          kind: 'lesson',
          title: '伦敦中局：Ne5 前哨进攻',
          updatedAt: '2026-09-10T14:07:00.000Z',
          lessonId: 'middlegame/london-ne5',
          summary: '未开始',
        },
      },
      activeExploreId: 'explore1',
      activeLessonId: 'lesson1',
      currentSessionId: 'explore1',
    });
    render(
      <MemoryRouter>
        <AnalysesPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('当前')).toHaveLength(1);
    expect(screen.getByText('探索 · 14:06').closest('button')?.textContent).toContain('当前');
    expect(screen.getByText('伦敦中局：Ne5 前哨进攻').closest('button')?.textContent).not.toContain('当前');
  });

  it('进页时搜索框不自动聚焦', () => {
    render(
      <MemoryRouter>
        <AnalysesPage />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText('搜索标题…');
    expect(document.activeElement).not.toBe(input);
  });
});
