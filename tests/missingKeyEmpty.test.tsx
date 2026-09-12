// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissingKeyEmpty } from '../src/components/MissingKeyEmpty';

afterEach(cleanup);

describe('MissingKeyEmpty', () => {
  it('offers a configure-key CTA and keeps the explanation', () => {
    const onConfigure = vi.fn();
    render(<MissingKeyEmpty onConfigure={onConfigure} />);
    expect(screen.getByText(/填入 API Key 后/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '去配置 Key' }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });

  it('compact mode keeps a one-line CTA for the collapsed sheet', () => {
    render(<MissingKeyEmpty compact onConfigure={() => {}} />);
    expect(screen.getByRole('button', { name: '去配置 Key' })).toBeTruthy();
    expect(screen.getByText('填入 API Key 后可讲解')).toBeTruthy();
  });
});
