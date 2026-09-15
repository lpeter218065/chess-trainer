import { useSettings } from '../store/settings';
import type { ChromeKey } from './chrome';
import type { Vars } from './interpolate';
import { resolveLocale, type Locale } from './locale';
import { t } from './t';

/** Current UI/LLM locale from settings. Safe outside React. */
export function liveLocale(): Locale {
  try {
    return resolveLocale(useSettings.getState().localePref);
  } catch {
    return 'zh';
  }
}

export function tl(key: ChromeKey, vars?: Vars): string {
  return t(liveLocale(), key, vars);
}
