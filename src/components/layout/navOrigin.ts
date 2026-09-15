import { liveLocale } from '../../i18n/live';
import { t } from '../../i18n/t';

export type NavOrigin = 'home' | 'analyses';

export function originFromState(state: unknown): NavOrigin {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from?: unknown }).from;
    if (from === 'analyses') return 'analyses';
  }
  return 'home';
}

export function originLabel(origin: NavOrigin): string {
  const locale = liveLocale();
  return origin === 'analyses' ? t(locale, 'home.analyses') : t(locale, 'nav.home');
}

export function originPath(origin: NavOrigin): string {
  return origin === 'analyses' ? '/analyses' : '/';
}
