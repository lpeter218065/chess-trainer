import { describe, it, expect } from 'vitest';
import { createPlatformStorage } from '../src/platform/storage';

function fakePreferences() {
  const m = new Map<string, string>();
  return {
    data: m,
    async get({ key }: { key: string }) {
      return { value: m.has(key) ? m.get(key)! : null };
    },
    async set({ key, value }: { key: string; value: string }) {
      m.set(key, value);
    },
    async remove({ key }: { key: string }) {
      m.delete(key);
    },
  };
}

function fakeFilesystem() {
  const files = new Map<string, string>();
  return {
    files,
    async readFile({ path }: { path: string }) {
      if (!files.has(path)) throw new Error('not found');
      return { data: files.get(path)! };
    },
    async writeFile({ path, data }: { path: string; data: string }) {
      files.set(path, data);
    },
  };
}

describe('createPlatformStorage', () => {
  it('small native 读写与缺失 key 返回 null', async () => {
    const preferences = fakePreferences();
    const store = createPlatformStorage('small', { native: true, preferences });
    expect(await store.getItem('k')).toBeNull();
    await store.setItem('k', '{"a":1}');
    expect(await store.getItem('k')).toBe('{"a":1}');
    await store.removeItem('k');
    expect(await store.getItem('k')).toBeNull();
  });

  it('large native JSON 往返，缺失文件返回 null', async () => {
    const filesystem = fakeFilesystem();
    const store = createPlatformStorage('large', { native: true, filesystem });
    expect(await store.getItem('chess-trainer-game-sessions')).toBeNull();
    const payload = JSON.stringify({ metas: { a: 1 } });
    await store.setItem('chess-trainer-game-sessions', payload);
    expect(await store.getItem('chess-trainer-game-sessions')).toBe(payload);
    expect(JSON.parse(filesystem.files.get('chess-trainer-game-sessions.json')!)).toEqual({ metas: { a: 1 } });
  });

  it('web small/large 走同一套内存或 localStorage 接口', async () => {
    const store = createPlatformStorage('small', { native: false });
    await store.setItem('web-k', '{"ok":true}');
    expect(await store.getItem('web-k')).toBe('{"ok":true}');
    await store.removeItem('web-k');
    expect(await store.getItem('web-k')).toBeNull();
  });
});
