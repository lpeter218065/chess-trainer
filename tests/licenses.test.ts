import { describe, it, expect } from 'vitest';
import { collectLicenses } from '../src/licenses/collect';

const REQUIRED = {
  stockfish: { version: '18.0.8', license: 'GPL-3.0', repository: { url: 'git://github.com/nmrugg/stockfish.js' } },
  'chess.js': { version: '1.4.0', license: 'BSD-2-Clause', homepage: 'https://github.com/jhlywa/chess.js' },
  'react-chessboard': { version: '5.12.1', license: 'MIT', homepage: 'https://github.com/Clariity/react-chessboard' },
  react: { version: '19.1.0', license: 'MIT' },
  vite: { version: '8.0.0', license: 'MIT' },
  zustand: { version: '5.0.15', license: 'MIT' },
} as const;

describe('collectLicenses', () => {
  it('列出 stockfish GPLv3、chess.js BSD-2、react-chessboard/react/vite/zustand MIT', () => {
    const pkg = {
      dependencies: {
        stockfish: '^18.0.8',
        'chess.js': '^1.4.0',
        'react-chessboard': '^5.12.1',
        react: '^19.1.0',
        zustand: '^5.0.15',
      },
      devDependencies: { vite: '^8.0.0' },
    };
    const list = collectLicenses(pkg, (name) => REQUIRED[name as keyof typeof REQUIRED] ?? null);
    const byName = Object.fromEntries(list.map((e) => [e.name, e]));
    expect(byName.stockfish.license).toMatch(/GPL-3\.0/);
    expect(byName.stockfish.homepage).toContain('github.com/nmrugg/stockfish.js');
    expect(byName['chess.js'].license).toBe('BSD-2-Clause');
    expect(byName['react-chessboard'].license).toBe('MIT');
    expect(byName.react.license).toBe('MIT');
    expect(byName.vite.license).toBe('MIT');
    expect(byName.zustand.license).toBe('MIT');
  });

  it('license 为对象时取 type', () => {
    const list = collectLicenses(
      { dependencies: { foo: '1.0.0' } },
      () => ({ version: '1.0.0', license: { type: 'Apache-2.0' } }),
    );
    expect(list).toEqual([{ name: 'foo', version: '1.0.0', license: 'Apache-2.0' }]);
  });

  it('缺少 node_modules 元数据时抛错，避免清单遗漏', () => {
    expect(() => collectLicenses({ dependencies: { missing: '1' } }, () => null)).toThrow(/missing/);
  });
});
