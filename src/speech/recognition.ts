import { Capacitor, registerPlugin } from '@capacitor/core';
import { t, speechBcp47, liveLocale, type Locale } from '../i18n';

export const SPEECH_LOCALE = 'zh-CN';

export type SpeechListener = {
  onPartial?(text: string): void;
  onFinal?(text: string): void;
  onError?(message: string): void;
  onEnd?(): void;
};

export interface SpeechPort {
  available(): Promise<boolean>;
  start(listener: SpeechListener): Promise<void>;
  stop(): Promise<void>;
}

export type WebSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type NativeSpeechPlugin = {
  available(): Promise<{ available: boolean }>;
  start(opts: { locale: string }): Promise<void>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  addListener(
    event: 'partial' | 'result' | 'error' | 'end',
    cb: (e: { text?: string; message?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  };

function liveSpeechBcp47(fallback = SPEECH_LOCALE): string {
  try {
    return speechBcp47(liveLocale());
  } catch {
    return fallback;
  }
}

export function speechErrorMessage(code: string, locale: Locale = liveLocale()): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'denied':
      return t(locale, 'speech.denied');
    case 'no-speech':
      return t(locale, 'speech.noSpeech');
    case 'audio-capture':
      return t(locale, 'speech.noMic');
    case 'simulator':
      return t(locale, 'speech.simulator');
    case 'network':
      return t(locale, 'speech.network');
    case 'aborted':
      return '';
    default:
      return t(locale, 'speech.fail');
  }
}

export function getSpeechRecognitionCtor(win: Window & typeof globalThis): (new () => WebSpeechRecognition) | null {
  const w = win as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function combinedTranscript(results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>): { text: string; isFinal: boolean } {
  let text = '';
  let isFinal = true;
  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    text += row[0]?.transcript ?? '';
    if (!row.isFinal) isFinal = false;
  }
  return { text, isFinal };
}

export function createUnavailableSpeechPort(): SpeechPort {
  return {
    async available() {
      return false;
    },
    async start() {},
    async stop() {},
  };
}

export function createWebSpeechPort(opts?: {
  ctor?: (new () => WebSpeechRecognition) | null;
  locale?: string;
}): SpeechPort {
  const Ctor = opts?.ctor === undefined ? getSpeechRecognitionCtor(window) : opts.ctor;
  const locale = opts?.locale ?? SPEECH_LOCALE;
  let rec: WebSpeechRecognition | null = null;
  return {
    async available() {
      return Boolean(Ctor);
    },
    async start(listener) {
      if (!Ctor) {
        listener.onError?.(speechErrorMessage('unavailable'));
        return;
      }
      rec?.abort();
      rec = new Ctor();
      rec.lang = liveSpeechBcp47(locale);
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        const { text, isFinal } = combinedTranscript(ev.results);
        if (!text) return;
        if (isFinal) listener.onFinal?.(text);
        else listener.onPartial?.(text);
      };
      rec.onerror = (ev) => {
        const message = speechErrorMessage(ev.error);
        if (message) listener.onError?.(message);
      };
      rec.onend = () => {
        rec = null;
        listener.onEnd?.();
      };
      rec.start();
    },
    async stop() {
      rec?.stop();
      rec = null;
    },
  };
}

export function createNativeSpeechPort(plugin: NativeSpeechPlugin, locale = SPEECH_LOCALE): SpeechPort {
  const handles: Array<{ remove: () => Promise<void> }> = [];
  const clear = async () => {
    const current = handles.splice(0);
    await Promise.all(current.map((h) => h.remove().catch(() => undefined)));
  };
  return {
    async available() {
      try {
        const res = await plugin.available();
        return Boolean(res.available);
      } catch {
        return false;
      }
    },
    async start(listener) {
      await clear();
      const listen = async (event: 'partial' | 'result' | 'error' | 'end', cb: (e: { text?: string; message?: string }) => void) => {
        const handle = await plugin.addListener(event, cb);
        handles.push(handle);
      };
      await listen('partial', (e) => {
        if (e.text) listener.onPartial?.(e.text);
      });
      await listen('result', (e) => {
        if (e.text) listener.onFinal?.(e.text);
      });
      await listen('error', (e) => {
        const message = speechErrorMessage(e.message ?? 'unknown');
        if (message) listener.onError?.(message);
      });
      await listen('end', () => {
        listener.onEnd?.();
      });
      try {
        await plugin.start({ locale: liveSpeechBcp47(locale) });
      } catch (e) {
        await clear();
        const raw = String((e as Error).message ?? '');
        const code = /denied|not-allowed|permission/i.test(raw) ? 'denied' : raw;
        const message = speechErrorMessage(code);
        if (message) listener.onError?.(message);
        listener.onEnd?.();
      }
    },
    async stop() {
      try {
        await plugin.stop();
      } finally {
        await clear();
      }
    },
  };
}

export async function resolveSpeechPort(deps?: {
  isNative?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  loadNative?: () => NativeSpeechPlugin;
  createNative?: () => SpeechPort;
  webCtor?: (new () => WebSpeechRecognition) | null;
}): Promise<SpeechPort> {
  const isNative = deps?.isNative ?? (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  });
  const isPluginAvailable = deps?.isPluginAvailable ?? ((name: string) => {
    try {
      return Capacitor.isPluginAvailable(name);
    } catch {
      return false;
    }
  });
  if (isNative() && isPluginAvailable('SpeechRecognition')) {
    if (deps?.createNative) return deps.createNative();
    const plugin = deps?.loadNative
      ? deps.loadNative()
      : registerPlugin<NativeSpeechPlugin>('SpeechRecognition');
    return createNativeSpeechPort(plugin);
  }
  const ctor = deps && 'webCtor' in deps ? deps.webCtor ?? null : getSpeechRecognitionCtor(window);
  if (ctor) return createWebSpeechPort({ ctor });
  return createUnavailableSpeechPort();
}

let shared: Promise<SpeechPort> | null = null;

export function getSharedSpeechPort(): Promise<SpeechPort> {
  shared ??= resolveSpeechPort();
  return shared;
}
