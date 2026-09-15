import type { Locale } from './locale';
import { CONTENT_EN as CONTENT_EN_BASE } from './content-en';
import { CONTENT_EN_CAMPAIGN } from './content-en-campaign';
import { CONTENT_EN_LESSONS } from './content-en-lessons';
import { CONTENT_EN_MORE } from './content-en-more';

export const CONTENT_EN: Record<string, string> = {
  ...CONTENT_EN_BASE,
  ...CONTENT_EN_MORE,
  ...CONTENT_EN_CAMPAIGN,
  ...CONTENT_EN_LESSONS,
};

export function translateTree<T>(value: T, dict: Record<string, string>): T {
  if (typeof value === 'string') return (dict[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => translateTree(item, dict)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = { ...(value as object) };
    for (const [key, child] of Object.entries(value as object)) {
      out[key] = translateTree(child, dict);
    }
    return out as T;
  }
  return value;
}

export function localizeContent<T>(value: T, locale: Locale): T {
  if (locale === 'zh') return value;
  return translateTree(value, CONTENT_EN);
}
