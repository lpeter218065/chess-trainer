// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { EvalBar } from '../src/components/EvalBar';

afterEach(cleanup);

describe('EvalBar', () => {
  it('playerIsWhite=false 时「你」标注在右端、「对手」在左端', () => {
    const { container } = render(<EvalBar cp={35} playerIsWhite={false} />);
    const labels = Array.from(container.querySelectorAll('span.text-muted'));
    expect(labels).toHaveLength(2);
    expect(labels[0].textContent).toBe('对手'); // 左端（白方）
    expect(labels[1].textContent).toBe('你'); // 右端
  });

  it('playerIsWhite=true 时「你」标注在左端', () => {
    const { container } = render(<EvalBar cp={35} playerIsWhite={true} />);
    const labels = Array.from(container.querySelectorAll('span.text-muted'));
    expect(labels[0].textContent).toBe('你');
    expect(labels[1].textContent).toBe('对手');
  });

  it('aria-label 说明正为用户占优', () => {
    const { container } = render(<EvalBar cp={35} playerIsWhite={false} />);
    const root = container.querySelector('[aria-label]');
    expect(root?.getAttribute('aria-label')).toContain('正为你占优');
  });
});
