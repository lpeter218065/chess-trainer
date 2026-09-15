// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/getEngine', () => ({ getEngine: () => Promise.resolve({ dispose() {} }) }));
import { CampaignMapPage } from '../src/pages/CampaignMapPage';
import { HomePage } from '../src/pages/HomePage';
import { useSettings } from '../src/store/settings';

afterEach(() => {
  cleanup();
  useSettings.getState().setLlm({ apiKey: 'test-key' });
});

function renderMap(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/campaign" element={<CampaignMapPage />} />
        <Route path="/campaign/:id" element={<CampaignMapPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('campaign entry', () => {
  it('shows both islands on the home page', () => {
    useSettings.getState().setLlm({ apiKey: 'x' });
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    const sicilian = screen.getByRole('link', { name: /西西里群岛/ });
    const queenPawn = screen.getByRole('link', { name: /后兵群岛/ });
    expect(sicilian).toBeTruthy();
    expect(queenPawn).toBeTruthy();
    expect(sicilian.textContent).toMatch(/沿着 c5/);
    expect(sicilian.textContent?.split('你是黑棋').length).toBe(2);
  });

  it('lists islands on the campaign hub', () => {
    renderMap('/campaign');
    expect(screen.getByRole('link', { name: /西西里群岛/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /后兵群岛/ })).toBeTruthy();
  });

  it('locks later sicilian levels until the first is starred', () => {
    renderMap('/campaign/open-najdorf');
    expect(screen.getByRole('link', { name: /为什么走 c5/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /第一脚：c5/ })).toBeNull();
    expect(screen.getAllByText('先过上一关').length).toBeGreaterThan(0);
  });

  it('opens the first queen-pawn level and locks the rest', () => {
    renderMap('/campaign/queen-pawn');
    expect(screen.getByRole('link', { name: /为什么走 d4/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /第一脚：d4/ })).toBeNull();
    expect(screen.getAllByText('先过上一关').length).toBeGreaterThan(0);
  });
});
