export type NavOrigin = 'home' | 'analyses';

export function originFromState(state: unknown): NavOrigin {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from?: unknown }).from;
    if (from === 'analyses') return 'analyses';
  }
  return 'home';
}

export function originLabel(origin: NavOrigin): string {
  return origin === 'analyses' ? '我的分析' : '首页';
}

export function originPath(origin: NavOrigin): string {
  return origin === 'analyses' ? '/analyses' : '/';
}
