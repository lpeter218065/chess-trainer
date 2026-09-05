import { describe, it, expect, beforeEach } from 'vitest';
import { getApiKey, setApiKey, clearApiKey, configureSecureStore } from '../src/platform/secureStore';

const WEB_KEY = 'chess-trainer-api-key';

describe('secureStore web', () => {
  beforeEach(async () => {
    configureSecureStore({ native: false });
    await clearApiKey();
  });

  it('读写清除', async () => {
    expect(await getApiKey()).toBe('');
    await setApiKey('sk-web');
    expect(await getApiKey()).toBe('sk-web');
    await clearApiKey();
    expect(await getApiKey()).toBe('');
  });
});

describe('secureStore native', () => {
  const bag = new Map<string, string>();
  const plugin = {
    async get(key: string, defaultValue: string | null) {
      return bag.has(key) ? bag.get(key)! : defaultValue;
    },
    async set(key: string, value: string) {
      bag.set(key, value);
    },
    async remove(key: string) {
      bag.delete(key);
    },
  };

  beforeEach(() => {
    bag.clear();
    configureSecureStore({ native: true, plugin });
  });

  it('用假插件读写清除', async () => {
    expect(await getApiKey()).toBe('');
    await setApiKey('sk-native');
    expect(await getApiKey()).toBe('sk-native');
    expect(bag.get(WEB_KEY)).toBe('sk-native');
    await clearApiKey();
    expect(await getApiKey()).toBe('');
  });

  it('Keychain 挂起时超时并回退 Preferences', async () => {
    const prefs = new Map<string, string>();
    prefs.set('chess-trainer-api-key', 'sk-hung');
    configureSecureStore({
      native: true,
      plugin: {
        get: () => new Promise(() => {}),
        set: () => new Promise(() => {}),
        remove: () => new Promise(() => {}),
      },
      fallback: {
        async get({ key }) { return { value: prefs.get(key) ?? null }; },
        async set({ key, value }) { prefs.set(key, value); },
        async remove({ key }) { prefs.delete(key); },
      },
    });
    expect(await getApiKey()).toBe('sk-hung');
  });

  it('Keychain 与 Preferences 都挂起时超时返回空串，不永远卡住', async () => {
    configureSecureStore({
      native: true,
      plugin: {
        get: () => new Promise(() => {}),
        set: () => new Promise(() => {}),
        remove: () => new Promise(() => {}),
      },
      fallback: {
        get: () => new Promise(() => {}),
        set: async () => {},
        remove: async () => {},
      },
    });
    const started = Date.now();
    await expect(getApiKey()).resolves.toBe('');
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('Keychain 失败时回退 Preferences', async () => {
    const prefs = new Map<string, string>();
    const throwing = {
      async get() { throw new Error('missing entitlement'); },
      async set() { throw new Error('missing entitlement'); },
      async remove() { throw new Error('missing entitlement'); },
    };
    configureSecureStore({
      native: true,
      plugin: throwing,
      fallback: {
        async get({ key }) { return { value: prefs.get(key) ?? null }; },
        async set({ key, value }) { prefs.set(key, value); },
        async remove({ key }) { prefs.delete(key); },
      },
    });
    await setApiKey('sk-fallback');
    expect(await getApiKey()).toBe('sk-fallback');
    await clearApiKey();
    expect(await getApiKey()).toBe('');
  });

  it('ensureApiKeyPersisted：secureStore 为空时把内存里的老 Key 写进去', async () => {
    const { ensureApiKeyPersisted } = await import('../src/platform/secureStore');
    await ensureApiKeyPersisted('sk-legacy');
    expect(bag.get('chess-trainer-api-key')).toBe('sk-legacy');
  });

  it('ensureApiKeyPersisted：secureStore 已有 Key 时不覆盖；空 Key 不写', async () => {
    const { ensureApiKeyPersisted } = await import('../src/platform/secureStore');
    bag.set('chess-trainer-api-key', 'sk-a');
    await ensureApiKeyPersisted('sk-legacy');
    expect(bag.get('chess-trainer-api-key')).toBe('sk-a');
    bag.clear();
    await ensureApiKeyPersisted('');
    expect(bag.has('chess-trainer-api-key')).toBe(false);
  });
});
