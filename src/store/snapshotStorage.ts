import type { StateStorage } from 'zustand/middleware';
import { createPlatformStorage } from '../platform/storage';

/** 每个会话一个 key；native 下会成为文件名，故不能含冒号 */
export const SNAPSHOT_KEY_PREFIX = 'chess-trainer-session-';

export interface SnapshotStorage {
  /** 同步读，只看内存缓存；未加载返回 null */
  peek<T>(id: string): T | null;
  /** 读穿：缓存没有则从 backend 读并缓存 */
  load<T>(id: string): Promise<T | null>;
  /** 写缓存 + 异步写 backend，写入 Promise 被记录，可被 flush 等待 */
  set<T>(id: string, snap: T): void;
  remove(id: string): void;
  /** 等待所有在途写入 */
  flush(): Promise<void>;
}

export function createSnapshotStorage(backend: StateStorage): SnapshotStorage {
  const cache = new Map<string, unknown>();
  const pending = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    const guarded = p.catch((e) => console.error('[snapshotStorage] 写入失败', e));
    pending.add(guarded);
    void guarded.finally(() => pending.delete(guarded));
  };
  /** backend 可能同步抛（localStorage 配额 / SecurityError），统一收进被 track 的 promise */
  const attempt = (op: () => unknown) => track(new Promise<unknown>((resolve) => resolve(op())));
  return {
    peek<T>(id: string) {
      return (cache.get(id) as T | undefined) ?? null;
    },
    async load<T>(id: string) {
      if (cache.has(id)) return (cache.get(id) as T | undefined) ?? null;
      let raw: string | null;
      try {
        raw = await backend.getItem(SNAPSHOT_KEY_PREFIX + id);
      } catch (e) {
        console.error('[snapshotStorage] 读取失败', e);
        return null;
      }
      if (raw === null || raw === undefined) return null;
      try {
        const v = JSON.parse(raw) as T;
        cache.set(id, v);
        return v;
      } catch {
        return null;
      }
    },
    set<T>(id: string, snap: T) {
      cache.set(id, snap);
      attempt(() => backend.setItem(SNAPSHOT_KEY_PREFIX + id, JSON.stringify(snap)));
    },
    remove(id: string) {
      cache.delete(id);
      attempt(() => backend.removeItem(SNAPSHOT_KEY_PREFIX + id));
    },
    async flush() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}

let current: SnapshotStorage = createSnapshotStorage(createPlatformStorage('large'));

/** 稳定代理：调用方模块加载时就能持有引用，测试替换 backend 后仍生效 */
export const snapshotStorage: SnapshotStorage = {
  peek: (id) => current.peek(id),
  load: (id) => current.load(id),
  set: (id, snap) => current.set(id, snap),
  remove: (id) => current.remove(id),
  flush: () => current.flush(),
};

export function __setSnapshotStorageForTests(s: SnapshotStorage) {
  current = s;
}
