import { useCallback, useMemo } from 'react';
import { useSettings } from '../store/settings';
import type { ChromeKey } from './chrome';
import { localizeContent } from './content';
import { resolveLocale, type Locale } from './locale';
import { t, type Vars } from './t';

export function useLocale(): Locale {
  const pref = useSettings((s) => s.localePref);
  return resolveLocale(pref);
}

export function useT() {
  const locale = useLocale();
  return useCallback((key: ChromeKey, vars?: Vars) => t(locale, key, vars), [locale]);
}

export function useLocalized<T>(value: T): T {
  const locale = useLocale();
  return useMemo(() => localizeContent(value, locale), [locale, value]);
}
