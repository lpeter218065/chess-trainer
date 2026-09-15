import { describe, expect, it } from 'vitest';
import { parseAppRoute } from '../src/platform/appRoute';

describe('parseAppRoute', () => {
  it('reads hash routes from custom scheme URLs', () => {
    expect(parseAppRoute('chesstrainer://app#/explore')).toBe('/explore');
    expect(parseAppRoute('chesstrainer://localhost#/settings')).toBe('/settings');
  });

  it('reads pathname when present', () => {
    expect(parseAppRoute('chesstrainer:///campaign/opening')).toBe('/campaign/opening');
  });

  it('maps host slug to path when no hash or pathname', () => {
    expect(parseAppRoute('chesstrainer://analyses')).toBe('/analyses');
  });

  it('ignores generic app hosts', () => {
    expect(parseAppRoute('chesstrainer://app')).toBeNull();
    expect(parseAppRoute('chesstrainer://localhost')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseAppRoute('not a url')).toBeNull();
  });
});
