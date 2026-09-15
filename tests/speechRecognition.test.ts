import { describe, expect, it, vi } from 'vitest';
import {
  createNativeSpeechPort,
  createUnavailableSpeechPort,
  createWebSpeechPort,
  getSpeechRecognitionCtor,
  resolveSpeechPort,
  speechErrorMessage,
  type NativeSpeechPlugin,
  type WebSpeechRecognition,
} from '../src/speech/recognition';

describe('speechErrorMessage', () => {
  it('maps permission and silence to kid-facing copy', () => {
    expect(speechErrorMessage('not-allowed')).toBe('没有麦克风权限');
    expect(speechErrorMessage('denied')).toBe('没有麦克风权限');
    expect(speechErrorMessage('no-speech')).toBe('没听清，再说一次');
    expect(speechErrorMessage('simulator')).toBe('模拟器没有麦克风，请用真机');
    expect(speechErrorMessage('aborted')).toBe('');
  });
});

describe('getSpeechRecognitionCtor', () => {
  it('reads SpeechRecognition or webkitSpeechRecognition', () => {
    const Ctor = function Webkit() {} as unknown as new () => WebSpeechRecognition;
    expect(getSpeechRecognitionCtor({} as Window & typeof globalThis)).toBeNull();
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: Ctor } as unknown as Window & typeof globalThis)).toBe(Ctor);
  });
});

describe('createWebSpeechPort', () => {
  it('starts zh-CN recognition and forwards interim plus final text', async () => {
    const rec: Partial<WebSpeechRecognition> & { started?: boolean } = {
      lang: '',
      continuous: false,
      interimResults: false,
      start() {
        rec.started = true;
      },
      stop() {
        rec.onend?.();
      },
      abort() {},
    };
    const Ctor = function Fake() {
      return rec;
    } as unknown as new () => WebSpeechRecognition;
    const port = createWebSpeechPort({ ctor: Ctor });
    expect(await port.available()).toBe(true);
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const onEnd = vi.fn();
    await port.start({ onPartial, onFinal, onEnd });
    expect(rec.started).toBe(true);
    expect(rec.lang).toBe('zh-CN');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);

    rec.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: '为什么走 ' } },
      ],
    });
    expect(onPartial).toHaveBeenCalledWith('为什么走 ');

    rec.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: '为什么走 c5' } },
      ],
    });
    expect(onFinal).toHaveBeenCalledWith('为什么走 c5');

    await port.stop();
    expect(onEnd).toHaveBeenCalled();
  });

  it('turns not-allowed into 没有麦克风权限', async () => {
    const rec: Partial<WebSpeechRecognition> = {
      start() {},
      stop() {},
      abort() {},
    };
    const Ctor = function Fake() {
      return rec;
    } as unknown as new () => WebSpeechRecognition;
    const onError = vi.fn();
    const port = createWebSpeechPort({ ctor: Ctor });
    await port.start({ onError });
    rec.onerror?.({ error: 'not-allowed' });
    expect(onError).toHaveBeenCalledWith('没有麦克风权限');
  });
});

describe('createNativeSpeechPort', () => {
  it('does not await the plugin object and forwards partial text', async () => {
    const listeners: Record<string, (e: { text?: string; message?: string }) => void> = {};
    const plugin: NativeSpeechPlugin = {
      available: vi.fn(async () => ({ available: true })),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      cancel: vi.fn(async () => {}),
      addListener: vi.fn(async (event, cb) => {
        listeners[event] = cb;
        return { remove: async () => {} };
      }),
    };
    Object.defineProperty(plugin, 'then', {
      get() {
        throw new Error('"SpeechRecognition.then()" is not implemented on ios');
      },
    });
    const port = createNativeSpeechPort(plugin);
    expect(await port.available()).toBe(true);
    const onPartial = vi.fn();
    await port.start({ onPartial });
    expect(plugin.start).toHaveBeenCalledWith({ locale: 'zh-CN' });
    listeners.partial?.({ text: '后护着' });
    expect(onPartial).toHaveBeenCalledWith('后护着');
    await port.stop();
    expect(plugin.stop).toHaveBeenCalled();
  });

  it('maps a native permission reject to 没有麦克风权限', async () => {
    const plugin: NativeSpeechPlugin = {
      available: async () => ({ available: true }),
      start: async () => {
        throw new Error('denied');
      },
      stop: async () => {},
      cancel: async () => {},
      addListener: async () => ({ remove: async () => {} }),
    };
    const onError = vi.fn();
    const onEnd = vi.fn();
    await createNativeSpeechPort(plugin).start({ onError, onEnd });
    expect(onError).toHaveBeenCalledWith('没有麦克风权限');
    expect(onEnd).toHaveBeenCalled();
  });
});

describe('resolveSpeechPort', () => {
  it('prefers the native plugin on Capacitor, else web, else hidden', async () => {
    const native = createUnavailableSpeechPort();
    const webCtor = function Fake() {
      return { start() {}, stop() {}, abort() {} };
    } as unknown as new () => WebSpeechRecognition;

    const nativePort = await resolveSpeechPort({
      isNative: () => true,
      isPluginAvailable: (name) => name === 'SpeechRecognition',
      loadNative: () => {
        throw new Error('should use factory');
      },
      createNative: () => native,
    });
    expect(nativePort).toBe(native);

    const web = await resolveSpeechPort({
      isNative: () => false,
      isPluginAvailable: () => false,
      webCtor,
    });
    expect(await web.available()).toBe(true);

    const none = await resolveSpeechPort({
      isNative: () => false,
      isPluginAvailable: () => false,
      webCtor: null,
    });
    expect(await none.available()).toBe(false);
  });
});
