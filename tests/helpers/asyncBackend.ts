import type { StateStorage } from 'zustand/middleware';

export type AsyncBackend = StateStorage & { m: Map<string, string>; writes(): number };

/** 全异步的 StateStorage 测试替身：写入有延迟，便于验证「先进缓存、后落盘」。 */
export function asyncBackend(): AsyncBackend {
  const m = new Map<string, string>();
  let writes = 0;
  const s: AsyncBackend = {
    m,
    writes: () => writes,
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      await new Promise((r) => setTimeout(r, 5));
      writes++;
      m.set(k, v);
    },
    removeItem: async (k) => {
      m.delete(k);
    },
  };
  return s;
}
