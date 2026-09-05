export type LicenseEntry = {
  name: string;
  version: string;
  license: string;
  homepage?: string;
};

export type PackageJsonLike = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type PackageMeta = {
  name?: string;
  version?: string;
  license?: string | { type: string };
  licenses?: Array<string | { type: string }>;
  homepage?: string;
  repository?: string | { url?: string };
};

function licenseOf(meta: PackageMeta): string {
  if (typeof meta.license === 'string' && meta.license) return meta.license;
  if (meta.license && typeof meta.license === 'object' && meta.license.type) return meta.license.type;
  if (Array.isArray(meta.licenses) && meta.licenses.length > 0) {
    return meta.licenses
      .map((item) => (typeof item === 'string' ? item : item.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return 'UNKNOWN';
}

function homepageOf(meta: PackageMeta): string | undefined {
  if (meta.homepage) return meta.homepage;
  const raw = typeof meta.repository === 'string' ? meta.repository : meta.repository?.url;
  if (!raw) return undefined;
  let url = raw.replace(/^git\+/, '');
  if (url.startsWith('git://')) url = `https://${url.slice('git://'.length)}`;
  return url.replace(/\.git$/, '');
}

export function collectLicenses(
  pkg: PackageJsonLike,
  readMeta: (name: string) => PackageMeta | null,
): LicenseEntry[] {
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort((a, b) =>
    a.localeCompare(b),
  );
  const seen = new Set<string>();
  const out: LicenseEntry[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const meta = readMeta(name);
    if (!meta) throw new Error(`missing package metadata: ${name}`);
    const entry: LicenseEntry = {
      name,
      version: meta.version ?? 'unknown',
      license: licenseOf(meta),
    };
    const homepage = homepageOf(meta);
    if (homepage) entry.homepage = homepage;
    out.push(entry);
  }
  return out;
}
