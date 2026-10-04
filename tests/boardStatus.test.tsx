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

  function renderMenu(onFlip = vi.fn()) {
    render(
      <BoardToolbar>
        <BoardMoreMenu
          items={[
            { id: 'candidates', label: '候选', onClick: () => {} },
            { id: 'flip', label: '翻转', onClick: onFlip },
          ]}
        />
      </BoardToolbar>,
    );
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    return onFlip;
  }

  it('renders the open menu in a portal outside the scrolling toolbar', () => {
    renderMenu();
    const menu = screen.getByRole('menu');
    const toolbar = document.querySelector('.board-toolbar');
    expect(document.body.contains(menu)).toBe(true);
    expect(toolbar?.contains(menu)).toBe(false);
    expect(menu.style.position).toBe('fixed');
    expect(screen.getByRole('button', { name: '更多' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('runs a menu item and closes the menu', () => {
    const onFlip = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '翻转' }));
    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open on mousedown inside the portal menu and closes on mousedown elsewhere', () => {
    renderMenu();
    fireEvent.mouseDown(screen.getByRole('menuitem', { name: '候选' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', () => {
    renderMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens upward when there is room above the button and downward otherwise', () => {
    const rect = (top: number) =>
      ({ top, bottom: top + 40, left: 0, right: 300, width: 300, height: 40, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(500));
    try {
      renderMenu();
      let menu = screen.getByRole('menu');
      expect(menu.style.bottom).toBe(`${window.innerHeight - 500 + 6}px`);
      expect(menu.style.top).toBe('');
      expect(menu.style.right).toBe(`${window.innerWidth - 300}px`);

      fireEvent.click(screen.getByRole('button', { name: '更多' }));
      spy.mockReturnValue(rect(20));
      fireEvent.click(screen.getByRole('button', { name: '更多' }));
      menu = screen.getByRole('menu');
      expect(menu.style.top).toBe(`${20 + 40 + 6}px`);
      expect(menu.style.bottom).toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('replaces the normal status role with an alert when an error is present', () => {
    render(<BoardStatus error="引擎分析失败">轮到你走</BoardStatus>);

    expect(screen.getByRole('alert').textContent).toContain('引擎分析失败');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
