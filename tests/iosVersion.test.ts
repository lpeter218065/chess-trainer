import { describe, it, expect } from 'vitest';
import { applyMarketingVersion, bumpCurrentProjectVersion } from '../src/platform/iosVersion';

describe('applyMarketingVersion', () => {
  it('把 pbxproj 里所有 MARKETING_VERSION 换成 package.json 的 version', () => {
    const pbx = [
      'CURRENT_PROJECT_VERSION = 1;',
      'MARKETING_VERSION = 1.0;',
      'PRODUCT_NAME = App;',
      'MARKETING_VERSION = 1.0;',
    ].join('\n');
    const out = applyMarketingVersion(pbx, '0.1.0');
    expect(out).toContain('MARKETING_VERSION = 0.1.0;');
    expect(out).not.toContain('MARKETING_VERSION = 1.0;');
    expect(out.match(/MARKETING_VERSION = 0\.1\.0;/g)).toHaveLength(2);
    expect(out).toContain('CURRENT_PROJECT_VERSION = 1;');
  });

  it('拒绝非 semver 版本号', () => {
    expect(() => applyMarketingVersion('MARKETING_VERSION = 1.0;', 'nope')).toThrow(/version/);
  });
});

describe('bumpCurrentProjectVersion', () => {
  it('把 CURRENT_PROJECT_VERSION 加 1', () => {
    const { text, build } = bumpCurrentProjectVersion('CURRENT_PROJECT_VERSION = 14;\nMARKETING_VERSION = 0.2.0;');
    expect(build).toBe(15);
    expect(text).toContain('CURRENT_PROJECT_VERSION = 15;');
  });
});
