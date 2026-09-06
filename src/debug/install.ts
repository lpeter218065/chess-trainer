import { Capacitor } from '@capacitor/core';
import { isNative } from '../platform/native';
import { appDebugLog, debugLog } from './log';

/** 启动时探测的原生插件；缺失或方法名不匹配会导致 `"<Plugin>.<method>()" is not implemented`。 */
const PROBED_PLUGINS = ['NativeSse', 'SecureStorage', 'Preferences', 'Filesystem', 'App', 'Keyboard', 'StatusBar'];

/** 镜像到原生控制台（Capacitor 会把 WebView 的 console.* 转发到 Xcode / simctl log stream）。 */
export type DebugHookDeps = {
  info?: (msg: string) => void;
  error?: (msg: string) => void;
};

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

/** hook 安装前保存的原始 console.error；镜像必须走它，走被 hook 的那个会无限递归。 */
let nativeError: ((...args: unknown[]) => void) | null = null;
/** console 只 hook 一次；重复调用只更新下面两个回调。 */
let installed = false;
let mirrorInfo: (msg: string) => void = () => {};
let mirrorError: (msg: string) => void = () => {};

function mirror(fn: (msg: string) => void, msg: string): void {
  try {
    fn(msg);
  } catch {
    /* ignore */
  }
}

function logPluginAvailability(info: (msg: string) => void): void {
  if (!isNative()) return;
  try {
    const line = PROBED_PLUGINS.map((n) => `${n}=${Capacitor.isPluginAvailable(n) ? 'yes' : 'no'}`).join(' ');
    debugLog('info', 'app', `plugins ${line}`);
    mirror(info, `[debug] plugins ${line}`);
  } catch (e) {
    const text = `plugins probe failed ${stringifyArg(e)}`;
    debugLog('warn', 'app', text);
    mirror(info, `[debug] ${text}`);
  }
}

function hookConsole(): void {
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  nativeError = origError;
  // console.warn/error 本来就会进原生控制台，这里只补内存日志，不再镜像（否则递归）
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
    const text = e.message || stringifyArg(e.error ?? 'error');
    debugLog('error', 'window', text);
    mirror(mirrorError, `[debug] ${text}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const text = stringifyArg(e.reason);
    debugLog('error', 'promise', text);
    mirror(mirrorError, `[debug] ${text}`);
  });
}

export function installDebugHooks(deps: DebugHookDeps = {}): void {
  if (!installed) {
    hookConsole();
    installed = true;
  }
  mirrorInfo = deps.info ?? console.info.bind(console);
  mirrorError = deps.error ?? nativeError ?? console.error.bind(console);
  debugLog('info', 'app', `debug hooks on  log=${appDebugLog.list().length}`);
  logPluginAvailability(mirrorInfo);
}

export function requestDebugOverlay(open = true): void {
  window.dispatchEvent(new CustomEvent('chess-debug', { detail: { open } }));
}
