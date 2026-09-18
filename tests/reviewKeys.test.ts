/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { reviewKeyToNav } from '../src/review/keys';

function key(name: string, target?: EventTarget | null): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('reviewKeyToNav', () => {
  it('maps arrows and letter keys', () => {
    expect(reviewKeyToNav(key('ArrowLeft'))).toBe('back');
    expect(reviewKeyToNav(key('j'))).toBe('back');
    expect(reviewKeyToNav(key('ArrowRight'))).toBe('forward');
    expect(reviewKeyToNav(key('l'))).toBe('forward');
    expect(reviewKeyToNav(key(' '))).toBe('forward');
    expect(reviewKeyToNav(key('Home'))).toBe('start');
    expect(reviewKeyToNav(key('End'))).toBe('end');
  });

  it('does not steal keys from editable fields', () => {
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    expect(reviewKeyToNav(key('ArrowLeft', input))).toBeNull();
    expect(reviewKeyToNav(key('ArrowRight', area))).toBeNull();
  });

  it('keeps arrows in a read-only PGN box', () => {
    const area = document.createElement('textarea');
    area.readOnly = true;
    expect(reviewKeyToNav(key('ArrowLeft', area))).toBe('back');
  });
});
