import type { StateStorage } from 'zustand/middleware';
import { Capacitor } from '@capacitor/core';
import { isNative } from './native';

export type PreferencesLike = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

export type FilesystemLike = {
  readFile(options: { path: string }): Promise<{ data: string }>;
  writeFile(options: { path: string; data: string }): Promise<void>;
};

export interface PlatformStorageOpts {
  native?: boolean;
  preferences?: PreferencesLike;
  filesystem?: FilesystemLike;
}

const memory = new Map<string, string>();

function memoryStorage(): StateStorage {
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
}

function webStorage(): StateStorage {
  if (typeof localStorage === 'undefined') return memoryStorage();
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  };
}

function smallNative(preferences: PreferencesLike): StateStorage {
  return {
    getItem: async (name) => {
      const { value } = await preferences.get({ key: name });
      return value;
    },
    setItem: async (name, value) => {
      await preferences.set({ key: name, value });
    },
    removeItem: async (name) => {
      await preferences.remove({ key: name });
    },
  };
}

function largeNative(filesystem: FilesystemLike): StateStorage {
  const fileFor = (name: string) => `${name}.json`;
  return {
    getItem: async (name) => {
      try {
        const { data } = await filesystem.readFile({ path: fileFor(name) });
        return typeof data === 'string' ? data : null;
      } catch {
        return null;
      }
    },
    setItem: async (name, value) => {
      await filesystem.writeFile({ path: fileFor(name), data: value });
    },
    removeItem: async (name) => {
      await filesystem.writeFile({ path: fileFor(name), data: '' });
    },
  };
}

/** Already-bridged native Preferences; null until Capacitor.Plugins is ready. */
export function nativePreferences(): PreferencesLike | null {
  if (!isNative()) return null;
  const prefs = (Capacitor as unknown as { Plugins?: { Preferences?: PreferencesLike } }).Plugins?.Preferences;
  if (prefs && typeof prefs.get === 'function') return prefs;
  return null;
}

async function defaultPreferences(): Promise<PreferencesLike> {
  for (let i = 0; i < 20; i++) {
    const native = nativePreferences();
    if (native) return native;
    if (!isNative()) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

async function defaultFilesystem(): Promise<FilesystemLike> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  return {
    readFile: ({ path }) => Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 }) as Promise<{ data: string }>,
    writeFile: async ({ path, data }) => {
      await Filesystem.writeFile({ path, data, directory: Directory.Data, encoding: Encoding.UTF8 });
    },
  };
}

export function createPlatformStorage(kind: 'small' | 'large', opts: PlatformStorageOpts = {}): StateStorage {
  const native = opts.native ?? isNative();
  if (!native) return webStorage();

  if (kind === 'small') {
    const prefs = opts.preferences;
    if (prefs) return smallNative(prefs);
    let cached: StateStorage | null = null;
    return {
      getItem: async (name) => {
        if (!cached) cached = smallNative(await defaultPreferences());
        return cached.getItem(name);
      },
      setItem: async (name, value) => {
        if (!cached) cached = smallNative(await defaultPreferences());
        return cached.setItem(name, value);
      },
      removeItem: async (name) => {
        if (!cached) cached = smallNative(await defaultPreferences());
        return cached.removeItem(name);
      },
    };
  }

  const fs = opts.filesystem;
  if (fs) return largeNative(fs);
  let cached: StateStorage | null = null;
  return {
    getItem: async (name) => {
      if (!cached) cached = largeNative(await defaultFilesystem());
      return cached.getItem(name);
    },
    setItem: async (name, value) => {
      if (!cached) cached = largeNative(await defaultFilesystem());
      return cached.setItem(name, value);
    },
    removeItem: async (name) => {
      if (!cached) cached = largeNative(await defaultFilesystem());
      return cached.removeItem(name);
    },
  };
}

export function debounceStorage(inner: StateStorage, ms: number): StateStorage & { flush(): Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { name: string; value: string } | null = null;
  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const p = pending;
    pending = null;
    if (p) await inner.setItem(p.name, p.value);
  };
  return {
    getItem: (name) => inner.getItem(name),
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, ms);
    },
    removeItem: (name) => inner.removeItem(name),
    flush,
  };
}
