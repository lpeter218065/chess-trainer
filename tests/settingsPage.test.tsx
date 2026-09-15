// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/getEngine', () => ({ getEngine: () => Promise.resolve({ dispose() {} }) }));
vi.mock('react-chessboard', () => ({
  Chessboard: () => null,
  defaultPieces: {},
}));

import { SettingsPage } from '../src/pages/SettingsPage';
import { useSettings } from '../src/store/settings';

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
});

afterEach(() => {
  cleanup();
  useSettings.getState().setPieceSet('classic');
  useSettings.getState().setBoardTheme('walnut');
  useSettings.getState().setPieceColor('standard');
  useSettings.getState().setLocalePref('system');
});

describe('SettingsPage piece set', () => {
  it('lets the user pick a piece style', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '设置' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /字母棋/ }));
    expect(useSettings.getState().pieceSet).toBe('letter');
  });

  it('switches chrome to English and back', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(useSettings.getState().localePref).toBe('en');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '中文' }));
    expect(useSettings.getState().localePref).toBe('zh');
    expect(screen.getByRole('heading', { name: '设置' })).toBeTruthy();
  });

  it('lets the user pick board and piece colors', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '绒布绿' }));
    expect(useSettings.getState().boardTheme).toBe('baize');
    fireEvent.click(screen.getByRole('button', { name: '黄铜' }));
    expect(useSettings.getState().pieceColor).toBe('brass');
  });
});
