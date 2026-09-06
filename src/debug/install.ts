import { appDebugLog, debugLog } from './log';

function stringifyArg(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function installDebugHooks(): void {
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    try {
      debugLog('warn', 'console', args.map(stringifyArg).join(' '));
    } catch {
      /* ignore */
    }
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    try {
      debugLog('error', 'console', args.map(stringifyArg).join(' '));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('error', (e) => {
    debugLog('error', 'window', e.message || String(e.error ?? 'error'));
  });
  window.addEventListener('unhandledrejection', (e) => {
    debugLog('error', 'promise', stringifyArg(e.reason));
  });
  debugLog('info', 'app', `debug hooks on  log=${appDebugLog.list().length}`);
}

export function requestDebugOverlay(open = true): void {
  window.dispatchEvent(new CustomEvent('chess-debug', { detail: { open } }));
}
