const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function applyMarketingVersion(pbxproj: string, version: string): string {
  if (!SEMVER.test(version)) throw new Error(`invalid version: ${version}`);
  if (!pbxproj.includes('MARKETING_VERSION')) {
    throw new Error('MARKETING_VERSION not found');
  }
  return pbxproj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
}
