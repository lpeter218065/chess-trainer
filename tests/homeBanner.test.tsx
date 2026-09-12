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
    fireEvent.click(screen.getByRole('button', { name: '去配置' }));
    expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^关闭$/ }));
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
