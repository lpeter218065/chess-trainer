import { describe, it, expect } from 'vitest';
import { classifyViewport } from '../src/platform';

describe('classifyViewport', () => {
  it('699 为 compact', () => {
    expect(classifyViewport(699)).toBe('compact');
  });

  it('700 与 1023 为 medium', () => {
    expect(classifyViewport(700)).toBe('medium');
    expect(classifyViewport(1023)).toBe('medium');
  });

  it('1024 为 wide', () => {
    expect(classifyViewport(1024)).toBe('wide');
  });
});
