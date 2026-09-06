// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cap = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => cap.native,
    isPluginAvailable: (name: string) => name === 'NativeSse',
  },
}));

import { installDebugHooks } from '../src/debug/install';
import { appDebugLog } from '../src/debug/log';

function dispatchRejection(reason: unknown): void {
  const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
  Object.defineProperty(ev, 'reason', { value: reason });
  window.dispatchEvent(ev);
}

// hook 安装前抢占 console，安装后 install.ts 保存的“原始” console.error 就是这两个 spy
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

describe('installDebugHooks 镜像到原生控制台', () => {
  beforeEach(() => {
    appDebugLog.clear();
    cap.native = false;
    consoleError.mockClear();
    consoleInfo.mockClear();
  });

  it('默认使用 hook 安装前的原始 console.error，未处理拒绝不会递归', () => {
    installDebugHooks();
    const hooked = console.error;
    expect(hooked).not.toBe(consoleError);

    dispatchRejection(new Error('boom'));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('[debug]'));
    // 镜像走原始函数：只有一次调用，没有二次进入 hook
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(appDebugLog.list().filter((e) => e.source === 'console')).toHaveLength(0);
  });

  it('unhandledrejection 同时进入内存日志与 error 输出', () => {
    const error = vi.fn();
    installDebugHooks({ info: vi.fn(), error });
    dispatchRejection(new Error('boom'));
    expect(
      appDebugLog.list().some((e) => e.source === 'promise' && e.message.includes('boom')),
    ).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('window error 同时进入内存日志与 error 输出', () => {
    const error = vi.fn();
    installDebugHooks({ info: vi.fn(), error });
    window.dispatchEvent(new ErrorEvent('error', { message: 'kaboom' }));
    expect(
      appDebugLog.list().some((e) => e.source === 'window' && e.message.includes('kaboom')),
    ).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('kaboom'));
  });

  it('console.warn/error 只写内存日志，不再镜像回控制台', () => {
    const error = vi.fn();
    installDebugHooks({ info: vi.fn(), error });
    console.error('已经在控制台了');
    console.warn('警告也是');
    expect(appDebugLog.list().map((e) => `${e.source}:${e.level}`)).toEqual(
      expect.arrayContaining(['console:error', 'console:warn']),
    );
    expect(error).not.toHaveBeenCalled();
    // 透传到原始 console.error，一次而已
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('已经在控制台了');
  });

  it('重复调用不重复 hook console，只更新回调', () => {
    installDebugHooks({ info: vi.fn(), error: vi.fn() });
    const hooked = console.error;
    const error = vi.fn();
    installDebugHooks({ info: vi.fn(), error });
    expect(console.error).toBe(hooked);

    console.error('once');
    expect(appDebugLog.list().filter((e) => e.source === 'console')).toHaveLength(1);

    dispatchRejection(new Error('later'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('later'));
    expect(appDebugLog.list().filter((e) => e.source === 'promise')).toHaveLength(1);
  });

  it('原生上插件可用性同时进内存日志与 info 输出', () => {
    cap.native = true;
    const info = vi.fn();
    installDebugHooks({ info, error: vi.fn() });
    expect(
      appDebugLog.list().some((e) => e.source === 'app' && e.message.startsWith('plugins ')),
    ).toBe(true);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('NativeSse=yes'));
  });

  it('Web 上不输出插件可用性', () => {
    cap.native = false;
    const info = vi.fn();
    installDebugHooks({ info, error: vi.fn() });
    expect(appDebugLog.list().some((e) => e.message.startsWith('plugins '))).toBe(false);
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining('NativeSse'));
  });
});
