import { Capacitor } from '@capacitor/core';
import { isNative } from '../platform/native';
import { appDebugLog, debugLog } from './log';

/** 启动时探测的原生插件；缺失或方法名不匹配会导致 `"<Plugin>.<method>()" is not implemented`。 */
const PROBED_PLUGINS = ['NativeSse', 'SecureStorage', 'Preferences', 'Filesystem', 'App', 'Keyboard', 'StatusBar'];

export function stringifyArg(v: unknown): string {
  if (v instanceof Error) {
    // CapacitorException 带 code（如 UNIMPLEMENTED / UNAVAILABLE），对定位缺失插件很关键
    const code = (v as Error & { code?: unknown }).code;
    const suffix = code === undefined ? '' : ` [${String(code)}]`;
    const head = `${v.name}: ${v.message}${suffix}`;
    const stack = v.stack ?? '';
    if (!stack) return head;
    // WebKit 的 stack 只有调用帧、不含 "Name: message" 首行，直接用 stack 会丢正文
    if (!suffix && v.message && stack.includes(v.message)) return stack;
    return `${head}\n${stack}`;
  }
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function logPluginAvailability(): void {
  if (!isNative()) return;
  try {
    const line = PROBED_PLUGINS.map((n) => `${n}=${Capacitor.isPluginAvailable(n) ? 'yes' : 'no'}`).join(' ');
    debugLog('info', 'app', `plugins ${line}`);
  } catch (e) {
    debugLog('warn', 'app', `plugins probe failed ${stringifyArg(e)}`);
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
    debugLog('error', 'window', e.message || stringifyArg(e.error ?? 'error'));
  });
  window.addEventListener('unhandledrejection', (e) => {
    debugLog('error', 'promise', stringifyArg(e.reason));
  });
  debugLog('info', 'app', `debug hooks on  log=${appDebugLog.list().length}`);
  logPluginAvailability();
}

export function requestDebugOverlay(open = true): void {
  window.dispatchEvent(new CustomEvent('chess-debug', { detail: { open } }));
}
