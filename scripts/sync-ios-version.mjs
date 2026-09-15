import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMarketingVersion, bumpCurrentProjectVersion } from '../src/platform/iosVersion.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const pbxPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
let pbx = readFileSync(pbxPath, 'utf8');
const prevMarketing = pbx.match(/MARKETING_VERSION = ([^;]+);/)?.[1]?.trim();
pbx = applyMarketingVersion(pbx, version);
writeFileSync(pbxPath, pbx);
console.log('MARKETING_VERSION', version);
if (prevMarketing !== version) {
  pbx = readFileSync(pbxPath, 'utf8');
  const bumped = bumpCurrentProjectVersion(pbx);
  writeFileSync(pbxPath, bumped.text);
  console.log('CURRENT_PROJECT_VERSION', bumped.build);
}
