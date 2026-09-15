import { chrome, type ChromeKey } from './chrome';
import { interpolate, type Vars } from './interpolate';
import type { Locale } from './locale';

export type { Vars };

export function t(locale: Locale, key: ChromeKey, vars?: Vars): string {
  const entry = chrome[key];
  const raw = entry[locale] || entry.zh;
  return interpolate(raw, vars);
}
