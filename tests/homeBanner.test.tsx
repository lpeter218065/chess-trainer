// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/getEngine', () => ({
  getEngine: () => Promise.resolve({ dispose() {} }),
}));

import { HomePage } from '../src/pages/HomePage';
import { useSettings } from '../src/store/settings';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  useSettings.getState().setLlm({ apiKey: 'test-key' });
});

beforeEach(() => {
  sessionStorage.clear();
  useSettings.getState().setLlm({ apiKey: '' });
});

describe('HomePage API key banner', () => {
  it('shows a dismissible banner with a configure CTA', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/讲解需要 API Key/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '去配置' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('link', { name: '设置' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('link', { name: '复盘' }).getAttribute('href')).toBe('/review');
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));
    expect(screen.queryByText(/讲解需要 API Key/)).toBeNull();
  });

  it('hides the banner after a key is set', () => {
    const { rerender } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/讲解需要 API Key/)).toBeTruthy();
    useSettings.getState().setLlm({ apiKey: 'sk-test' });
    rerender(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/讲解需要 API Key/)).toBeNull();
  });
});
