import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMarketingVersion } from '../src/platform/iosVersion.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const pbxPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const next = applyMarketingVersion(readFileSync(pbxPath, 'utf8'), version);
writeFileSync(pbxPath, next);
console.log('MARKETING_VERSION', version);
