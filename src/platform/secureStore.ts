import { isNative } from './native';
import { nativePreferences, type PreferencesLike } from './storage';

export const API_KEY_STORAGE = 'chess-trainer-api-key';

export type SecurePlugin = {
  get(key: string, defaultValue: string | null): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const memory = new Map<string, string>();

function webPlugin(): SecurePlugin {
  return {
    async get(key, defaultValue) {
      if (typeof localStorage === 'undefined') return memory.get(key) ?? defaultValue;
      return localStorage.getItem(key) ?? defaultValue;
    },
    async set(key, value) {
      if (typeof localStorage === 'undefined') {
        memory.set(key, value);
        return;
      }
      localStorage.setItem(key, value);
    },
    async remove(key) {
      if (typeof localStorage === 'undefined') {
        memory.delete(key);
        return;
      }
      localStorage.removeItem(key);
    },
  };
}

let cfg: { native: boolean; plugin: SecurePlugin; fallback?: PreferencesLike } | null = null;

export function configureSecureStore(next: { native: boolean; plugin?: SecurePlugin; fallback?: PreferencesLike }) {
  cfg = {
    native: next.native,
    plugin: next.plugin ?? webPlugin(),
    fallback: next.fallback,
  };
}

async function fallbackPrefs(): Promise<PreferencesLike | null> {
  if (cfg?.fallback) return cfg.fallback;
  return waitNativePrefs();
}

async function plugin(): Promise<SecurePlugin> {
  if (cfg) return cfg.plugin;
  if (isNative()) {
    const { SecureStorage } = await withTimeout(
      import('@aparajita/capacitor-secure-storage'),
      800,
    );
    return {
      get: async (key, def) => (await SecureStorage.getItem(key)) ?? def,
      set: (key, value) => SecureStorage.setItem(key, value),
      remove: (key) => SecureStorage.removeItem(key),
    };
  }
  return webPlugin();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function readFromPlugin(): Promise<string> {
  try {
    const v = await withTimeout(
      plugin().then((p) => p.get(API_KEY_STORAGE, null)),
      800,
    );
    return v ?? '';
  } catch {
    console.warn('[secureStore] Keychain 不可用，API Key 回退到 Preferences 明文存储');
    return '';
  }
}

async function waitNativePrefs(): Promise<PreferencesLike | null> {
  const injected = cfg?.fallback;
  if (injected) return injected;
  if (!isNative()) return null;
  for (let i = 0; i < 20; i++) {
    const prefs = nativePreferences();
    if (prefs) return prefs;
    await new Promise((r) => setTimeout(r, 50));
  }
  return nativePreferences();
}

async function readFromPrefs(): Promise<string> {
  try {
    const prefs = await withTimeout(waitNativePrefs(), 1200);
    if (!prefs) return '';
    const { value } = await withTimeout(prefs.get({ key: API_KEY_STORAGE }), 800);
    return value ?? '';
  } catch {
    return '';
  }
}

export async function getApiKey(): Promise<string> {
  return new Promise((resolve) => {
    let pending = 2;
    let found = '';
    const done = (v: string) => {
      if (v && !found) {
        found = v;
        resolve(v);
        return;
      }
      pending -= 1;
      if (pending === 0) resolve(found);
    };
    void readFromPlugin().then(done, () => done(''));
    void readFromPrefs().then(done, () => done(''));
  });
}

/** 永不抛出：Keychain 与 Preferences 都失败时只记一条 warn，避免未处理的 Promise 拒绝。 */
export async function setApiKey(key: string): Promise<void> {
  try {
    // plugin() 自身也可能失败（动态 import 超时 / 插件未打包），必须一起包在 try 里
    const p = await plugin();
    if (!key) await withTimeout(p.remove(API_KEY_STORAGE), 800);
    else await withTimeout(p.set(API_KEY_STORAGE, key), 800);
    return;
  } catch {
    console.warn('[secureStore] Keychain 不可用，API Key 回退到 Preferences 明文存储');
  }
  try {
    const prefs = await fallbackPrefs();
    if (!prefs) return;
    if (!key) await prefs.remove({ key: API_KEY_STORAGE });
    else await prefs.set({ key: API_KEY_STORAGE, value: key });
  } catch (e) {
    console.warn('[secureStore] Preferences 回退写入失败，API Key 未持久化', e);
  }
}

export async function clearApiKey(): Promise<void> {
  try {
    await (await plugin()).remove(API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
  try {
    const prefs = await fallbackPrefs();
    if (prefs) await prefs.remove({ key: API_KEY_STORAGE });
  } catch {
    /* ignore */
  }
}

/**
 * 迁移：旧版本把 Key 存在 settings 持久化对象里，新版本只存 secureStore。
 * hydrate 后若内存里有 Key 而 secureStore 为空，补写一次，避免下次重写 settings 时丢失。
 */
export async function ensureApiKeyPersisted(currentKey: string): Promise<void> {
  if (!currentKey) return;
  const stored = await getApiKey();
  if (stored) return;
  await setApiKey(currentKey);
}
