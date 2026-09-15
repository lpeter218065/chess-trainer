const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function applyMarketingVersion(pbxproj: string, version: string): string {
  if (!SEMVER.test(version)) throw new Error(`invalid version: ${version}`);
  if (!pbxproj.includes('MARKETING_VERSION')) {
    throw new Error('MARKETING_VERSION not found');
  }
  return pbxproj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
}

/** 每次发版递增 CURRENT_PROJECT_VERSION（App Store build number） */
export function bumpCurrentProjectVersion(pbxproj: string): { text: string; build: number } {
  const match = pbxproj.match(/CURRENT_PROJECT_VERSION = (\d+);/);
  if (!match) throw new Error('CURRENT_PROJECT_VERSION not found');
  const build = Number(match[1]) + 1;
  const text = pbxproj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  return { text, build };
}
