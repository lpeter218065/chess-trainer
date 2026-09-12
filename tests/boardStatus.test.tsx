// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardMoreMenu, BoardStatus, BoardToolbar } from '../src/components/BoardToolbar';

afterEach(cleanup);

describe('BoardStatus', () => {
  it('renders composed status text as a sibling outside the toolbar', () => {
    render(
      <div>
        <BoardToolbar>
          <button type="button">上一步</button>
        </BoardToolbar>
        <BoardStatus>轮到你走</BoardStatus>
      </div>,
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('轮到你走');
    expect(status.parentElement?.classList.contains('board-status')).toBe(true);
    expect(status.closest('.board-toolbar')).toBeNull();
    expect(screen.getByRole('button', { name: '上一步' }).parentElement?.contains(status)).toBe(false);
  });

  it('keeps primary tools to arrows and analysis, with extras in more', () => {
    const onCandidates = vi.fn();
    render(
      <BoardToolbar>
        <button type="button">上一步</button>
        <button type="button">下一步</button>
        <button type="button">分析</button>
        <BoardMoreMenu
          items={[
            { id: 'candidates', label: '候选', onClick: onCandidates },
            { id: 'assessment', label: '局面', disabled: true, reason: '请先配置 API Key', onClick: () => {} },
            { id: 'flip', label: '翻转', onClick: () => {} },
          ]}
        />
      </BoardToolbar>,
    );
    expect(screen.getByRole('button', { name: '更多' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '候选' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '候选' }));
    expect(onCandidates).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    expect((screen.getByRole('menuitem', { name: /局面/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('请先配置 API Key')).toBeTruthy();
  });

  it('replaces the normal status role with an alert when an error is present', () => {
    render(<BoardStatus error="引擎分析失败">轮到你走</BoardStatus>);

    expect(screen.getByRole('alert').textContent).toContain('引擎分析失败');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
