// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { TrainerLayout, type TrainerPanel } from '../src/components/layout/TrainerLayout';

type AnimationFrameHarness = {
  flush: () => void;
};

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function installAnimationFrameHarness(): AnimationFrameHarness {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = (callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  };
  const cancel = (id: number) => {
    callbacks.delete(id);
  };
  Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: request });
  Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: cancel });

  return {
    flush: () => {
      const next = callbacks.keys().next();
      if (next.done) return;
      const id = next.value;
      const callback = callbacks.get(id);
      callbacks.delete(id);
      callback?.(0);
    },
  };
}

function resizeTo(frames: AnimationFrameHarness, width: number, height: number): void {
  act(() => {
    setWindowSize(width, height);
    window.dispatchEvent(new Event('resize'));
    frames.flush();
  });
}

function StatefulBoard() {
  const [moves, setMoves] = useState(0);
  return (
    <button type="button" data-testid="board" onClick={() => setMoves((value) => value + 1)}>
      棋盘 {moves}
    </button>
  );
}

function StatefulPanel({ name }: { name: string }) {
  const [draft, setDraft] = useState('');
  return (
    <label>
      {name} draft
      <input
        aria-label={`${name} draft`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
}

function renderLayout({
  board = <StatefulBoard />,
  leftPanel,
  panels,
  footer,
  footerPanelId,
}: {
  board?: ReactNode;
  leftPanel?: ReactNode;
  panels: TrainerPanel[];
  footer?: ReactNode;
  footerPanelId?: string;
}) {
  return render(
    <TrainerLayout
      header={<div>Header</div>}
      board={board}
      leftPanel={leftPanel}
      panels={panels}
      footer={footer}
      footerPanelId={footerPanelId}
      storageKey="trainer-layout-interaction"
    />,
  );
}

let removeWindowBoardHandler: (() => void) | null = null;

afterEach(() => {
  cleanup();
  removeWindowBoardHandler?.();
  removeWindowBoardHandler = null;
  sessionStorage.clear();
  delete (window as unknown as { requestAnimationFrame?: typeof window.requestAnimationFrame })
    .requestAnimationFrame;
  delete (window as unknown as { cancelAnimationFrame?: typeof window.cancelAnimationFrame })
    .cancelAnimationFrame;
});

beforeEach(() => {
  sessionStorage.clear();
  setWindowSize(390, 844);
  installAnimationFrameHarness();
});

describe('TrainerLayout responsive interaction', () => {
  it('uses stacked, split, stacked, and wide modes at phone/tablet sizes', () => {
    const frames = installAnimationFrameHarness();
    const { container } = renderLayout({
      leftPanel: <div>候选着法</div>,
      panels: [{ id: 'analysis', label: '分析', content: <div>分析内容</div> }],
    });
    const shell = () => container.querySelector('.trainer-shell') as HTMLElement;

    expect(shell().getAttribute('data-vp')).toBe('compact');
    expect(shell().getAttribute('data-layout')).toBe('stacked');

    resizeTo(frames, 844, 390);
    expect(shell().getAttribute('data-vp')).toBe('medium');
    expect(shell().getAttribute('data-layout')).toBe('split');

    resizeTo(frames, 834, 1194);
    expect(shell().getAttribute('data-vp')).toBe('medium');
    expect(shell().getAttribute('data-layout')).toBe('stacked');

    resizeTo(frames, 1194, 834);
    expect(shell().getAttribute('data-vp')).toBe('wide');
    expect(shell().getAttribute('data-layout')).toBe('wide');
    expect(screen.getByText('候选着法')).toBeTruthy();
  });

  it('preserves the board DOM and local state across responsive resizes', () => {
    const frames = installAnimationFrameHarness();
    renderLayout({
      leftPanel: <div>候选着法</div>,
      panels: [{ id: 'analysis', label: '分析', content: <div>分析内容</div> }],
    });
    const board = screen.getByTestId('board');

    fireEvent.click(board);
    expect(board.textContent).toContain('棋盘 1');

    resizeTo(frames, 844, 390);
    expect(screen.getByTestId('board')).toBe(board);
    expect(screen.getByTestId('board').textContent).toContain('棋盘 1');

    resizeTo(frames, 834, 1194);
    expect(screen.getByTestId('board')).toBe(board);
    expect(screen.getByTestId('board').textContent).toContain('棋盘 1');

    resizeTo(frames, 1194, 834);
    expect(screen.getByTestId('board')).toBe(board);
    expect(screen.getByTestId('board').textContent).toContain('棋盘 1');
  });

  it('keeps panel-local state and footer draft when switching tabs', () => {
    const panels: TrainerPanel[] = [
      { id: 'analysis', label: '分析', content: <StatefulPanel name="analysis" /> },
      { id: 'history', label: '历史', content: <StatefulPanel name="history" /> },
    ];
    renderLayout({
      panels,
      footer: (
        <label>
          footer draft
          <input aria-label="footer draft" />
        </label>
      ),
      footerPanelId: "analysis",
    });
    const analysisDraft = screen.getByLabelText('analysis draft');
    const footerDraft = screen.getByLabelText('footer draft');
    fireEvent.change(analysisDraft, { target: { value: '局面问题' } });
    fireEvent.change(footerDraft, { target: { value: '继续追问' } });

    fireEvent.click(screen.getByRole('tab', { name: '历史' }));
    expect(screen.getByRole('tab', { name: '历史' }).getAttribute('aria-selected')).toBe('true');
    expect((analysisDraft as HTMLInputElement).value).toBe('局面问题');
    expect((footerDraft as HTMLInputElement).value).toBe('继续追问');

    fireEvent.click(screen.getByRole('tab', { name: '分析' }));
    expect((screen.getByLabelText('analysis draft') as HTMLInputElement).value).toBe('局面问题');
    expect((screen.getByLabelText('footer draft') as HTMLInputElement).value).toBe('继续追问');
  });

  it('moves focus and selection with tab arrows without reaching the window handler', () => {
    const windowBoardHandler = vi.fn();
    window.addEventListener('keydown', windowBoardHandler);
    removeWindowBoardHandler = () => window.removeEventListener('keydown', windowBoardHandler);
    renderLayout({
      panels: [
        { id: 'analysis', label: '分析', content: <div>分析内容</div> },
        { id: 'history', label: '历史', content: <div>历史内容</div> },
        { id: 'notes', label: '笔记', content: <div>笔记内容</div> },
      ],
    });

    const analysisTab = screen.getByRole('tab', { name: '分析' });
    const historyTab = screen.getByRole('tab', { name: '历史' });
    const historyPanelId = historyTab.getAttribute('aria-controls');
    expect(historyPanelId).toBeTruthy();
    expect(document.getElementById(historyPanelId as string)?.getAttribute('aria-labelledby')).toBe(historyTab.id);

    fireEvent.keyDown(analysisTab, { key: 'KeyA' });
    expect(windowBoardHandler).toHaveBeenCalledTimes(1);
    windowBoardHandler.mockClear();

    analysisTab.focus();
    fireEvent.keyDown(analysisTab, { key: 'ArrowRight' });
    expect(historyTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(historyTab);
    expect(windowBoardHandler).not.toHaveBeenCalled();

    fireEvent.keyDown(historyTab, { key: 'ArrowLeft' });
    expect(analysisTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(analysisTab);
    expect(windowBoardHandler).not.toHaveBeenCalled();

  });

  it('pins the follow-up footer outside the panel scroll', () => {
    const { container } = renderLayout({
      panels: [
        { id: 'analysis', label: '分析', content: <div style={{ height: 1600 }}>分析内容</div> },
        { id: 'history', label: '历史', content: <div>历史内容</div> },
      ],
      footer: <input aria-label="继续问教练" />,
      footerPanelId: 'analysis',
    });
    const input = screen.getByLabelText('继续问教练');
    const footer = container.querySelector('[data-testid="trainer-footer"]') as HTMLElement;
    const scroll = container.querySelector('.trainer-panel-scroll') as HTMLElement;

    expect(footer).toBeTruthy();
    expect(footer.contains(input)).toBe(true);
    expect(scroll.contains(footer)).toBe(false);
    expect(footer.closest('.trainer-detail')).toBeTruthy();
    expect(footer.hidden).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: '历史' }));
    expect(footer.hidden).toBe(true);
    expect((input as HTMLInputElement).isConnected).toBe(true);
  });

  it('keeps the follow-up footer on the compact candidates tab', () => {
    const { container } = renderLayout({
      leftPanel: <div>候选着法</div>,
      panels: [
        { id: 'analysis', label: '分析', content: <div>分析内容</div> },
        { id: 'import', label: '导入', content: <div>导入内容</div> },
      ],
      footer: <input aria-label="继续问教练" />,
      footerPanelId: 'analysis',
    });
    const footer = container.querySelector('[data-testid="trainer-footer"]') as HTMLElement;

    expect(screen.getByRole('tab', { name: '分析' }).getAttribute('aria-selected')).toBe('true');
    expect(footer.hidden).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: '候选' }));
    expect(screen.getByRole('tab', { name: '候选' }).getAttribute('aria-selected')).toBe('true');
    expect(footer.hidden).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: '导入' }));
    expect(footer.hidden).toBe(true);
  });

  it('collapses the stacked detail sheet on handle tap so the board can grow', () => {
    const { container } = renderLayout({
      panels: [{ id: 'analysis', label: '分析', content: <div>分析内容</div> }],
    });
    const shell = () => container.querySelector('.trainer-shell') as HTMLElement;
    expect(shell().getAttribute('data-detail')).toBe('half');
    const handle = screen.getByRole('button', { name: '折叠讲解区' });
    fireEvent.pointerDown(handle, { clientY: 500 });
    fireEvent.pointerUp(handle, { clientY: 500 });
    expect(shell().getAttribute('data-detail')).toBe('collapsed');
    expect(screen.getByRole('button', { name: '展开讲解区' })).toBeTruthy();
  });

  it('stays on the analysis tab when candidates appear', () => {
    const panels: TrainerPanel[] = [
      { id: 'analysis', label: '分析', content: <div>分析内容</div> },
    ];
    const view = render(
      <TrainerLayout
        header={<div>Header</div>}
        board={<StatefulBoard />}
        panels={panels}
        footer={<input aria-label="继续问教练" />}
        footerPanelId="analysis"
        storageKey="trainer-layout-interaction"
      />,
    );

    expect(screen.queryByRole('tab', { name: '候选' })).toBeNull();
    expect(screen.getByRole('tab', { name: '分析' }).getAttribute('aria-selected')).toBe('true');

    view.rerender(
      <TrainerLayout
        header={<div>Header</div>}
        board={<StatefulBoard />}
        leftPanel={<div>候选着法</div>}
        panels={panels}
        footer={<input aria-label="继续问教练" />}
        footerPanelId="analysis"
        storageKey="trainer-layout-interaction"
      />,
    );

    expect(screen.getByRole('tab', { name: '候选' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '分析' }).getAttribute('aria-selected')).toBe('true');
  });
});
