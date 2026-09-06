import { describe, it, expect, vi } from 'vitest';
import { createSnapshotStorage, SNAPSHOT_KEY_PREFIX } from '../src/store/snapshotStorage';
import { asyncBackend } from './helpers/asyncBackend';

describe('snapshotStorage', () => {
  it('set 立即可 peek，flush 后落到 backend，每个会话一个 key', async () => {
    const b = asyncBackend();
    const s = createSnapshotStorage(b);
    s.set('a', { x: 1 });
    s.set('b', { x: 2 });
    expect(s.peek<{ x: number }>('a')).toEqual({ x: 1 });
    expect(b.m.size).toBe(0);
    await s.flush();
    expect([...b.m.keys()].sort()).toEqual([`${SNAPSHOT_KEY_PREFIX}a`, `${SNAPSHOT_KEY_PREFIX}b`]);
    const rawB = b.m.get(`${SNAPSHOT_KEY_PREFIX}b`);
    const writesBefore = b.writes();
    s.set('a', { x: 3 });
    await s.flush();
    expect(b.m.get(`${SNAPSHOT_KEY_PREFIX}b`)).toBe(rawB);
    expect(b.writes()).toBe(writesBefore + 1);
  });

  it('load 读穿并缓存；缺失与坏 JSON 返回 null', async () => {
    const b = asyncBackend();
    b.m.set(`${SNAPSHOT_KEY_PREFIX}a`, '{"x":1}');
    b.m.set(`${SNAPSHOT_KEY_PREFIX}bad`, '{nope');
    const s = createSnapshotStorage(b);
    expect(s.peek('a')).toBeNull();
    expect(await s.load<{ x: number }>('a')).toEqual({ x: 1 });
    expect(s.peek<{ x: number }>('a')).toEqual({ x: 1 });
    expect(await s.load('missing')).toBeNull();
    expect(await s.load('bad')).toBeNull();
  });

  it('remove 清缓存并删 backend', async () => {
    const b = asyncBackend();
    const s = createSnapshotStorage(b);
    s.set('a', { x: 1 });
    await s.flush();
    s.remove('a');
    await s.flush();
    expect(s.peek('a')).toBeNull();
    expect(b.m.has(`${SNAPSHOT_KEY_PREFIX}a`)).toBe(false);
  });

  it('写入失败（异步 reject / 同步 throw）都不冒泡到 flush', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = asyncBackend();
    b.setItem = async () => {
      throw new Error('async boom');
    };
    const s = createSnapshotStorage(b);
    s.set('a', { x: 1 });
    await expect(s.flush()).resolves.toBeUndefined();
    expect(s.peek<{ x: number }>('a')).toEqual({ x: 1 });

    // localStorage 配额是同步抛的
    const b2 = asyncBackend();
    b2.setItem = () => {
      throw new Error('quota');
    };
    const s2 = createSnapshotStorage(b2);
    expect(() => s2.set('a', { x: 1 })).not.toThrow();
    await expect(s2.flush()).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('读取失败返回 null，不冒泡', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = asyncBackend();
    b.getItem = () => {
      throw new Error('denied');
    };
    const s = createSnapshotStorage(b);
    await expect(s.load('a')).resolves.toBeNull();
    spy.mockRestore();
  });
});
