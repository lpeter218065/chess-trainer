/** Map a native deep-link URL to a HashRouter path (no leading `#`). */
export function parseAppRoute(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hash) {
      return parsed.hash.replace(/^#/, '');
    }
    if (parsed.pathname && parsed.pathname !== '/') {
      return parsed.pathname;
    }
    if (parsed.host && parsed.host !== 'app' && parsed.host !== 'localhost') {
      return `/${parsed.host}`;
    }
  } catch {
    /* ignore malformed url */
  }
  return null;
}
