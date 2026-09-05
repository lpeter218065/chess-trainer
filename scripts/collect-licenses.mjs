import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLicenses } from '../src/licenses/collect.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const list = collectLicenses(pkg, (name) => {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
});

const outDir = join(root, 'src', 'licenses');
mkdirSync(outDir, { recursive: true });
const body = `// 由 scripts/collect-licenses.mjs 生成，勿手改
import type { LicenseEntry } from './collect';
export const APP_VERSION = ${JSON.stringify(pkg.version)};
export const THIRD_PARTY_LICENSES: LicenseEntry[] = ${JSON.stringify(list, null, 2)};
`;
writeFileSync(join(outDir, 'thirdParty.generated.ts'), body);
console.log('licenses:', list.length);
