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

export async function setApiKey(key: string): Promise<void> {
  const p = await plugin();
  try {
    if (!key) await withTimeout(p.remove(API_KEY_STORAGE), 800);
    else await withTimeout(p.set(API_KEY_STORAGE, key), 800);
    return;
  } catch {
    /* fall through */
  }
  const prefs = await fallbackPrefs();
  if (!prefs) return;
  if (!key) await prefs.remove({ key: API_KEY_STORAGE });
  else await prefs.set({ key: API_KEY_STORAGE, value: key });
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
