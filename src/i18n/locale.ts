export type Locale = 'zh' | 'en';
export type LocalePreference = 'system' | Locale;

export interface NavigatorLike {
  language?: string;
  languages?: readonly string[];
}

export function detectLocale(nav: NavigatorLike = typeof navigator === 'undefined' ? {} : navigator): Locale {
  const langs = nav.languages?.length ? [...nav.languages] : [nav.language ?? ''];
  for (const raw of langs) {
    if (raw.toLowerCase().startsWith('zh')) return 'zh';
  }
  if (!langs.some(Boolean)) return 'zh';
  return 'en';
}

export function resolveLocale(
  pref: LocalePreference,
  nav: NavigatorLike = typeof navigator === 'undefined' ? {} : navigator,
): Locale {
  if (pref === 'system') return detectLocale(nav);
  return pref;
}

export function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}

export function speechBcp47(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'zh-CN';
}
