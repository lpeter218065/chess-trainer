// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/platform/native', () => ({
  isNative: () => true,
}));

import { SettingsFields } from '../src/components/SettingsFields';
import { useSettings } from '../src/store/settings';

afterEach(() => {
  cleanup();
  useSettings.getState().setLlm({ baseUrl: 'https://api.openai.com/v1', apiKey: '' });
});

describe('SettingsFields HTTPS notice on native', () => {
  it('shows an iPad/iPhone warning as soon as the URL is http', () => {
    useSettings.getState().setLlm({ baseUrl: 'http://43.164.135.40/openai/v1' });
    render(
      <MemoryRouter>
        <SettingsFields showLanguage={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/iPad/);
    expect(screen.getByRole('alert').textContent).toMatch(/HTTPS/);
    expect(screen.getByPlaceholderText('https://api.openai.com/v1').getAttribute('aria-invalid')).toBe('true');
  });

  it('does not warn when the URL is https', () => {
    useSettings.getState().setLlm({ baseUrl: 'https://api.openai.com/v1' });
    render(
      <MemoryRouter>
        <SettingsFields showLanguage={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
