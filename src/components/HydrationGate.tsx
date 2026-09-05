import { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '../store/settings';
import { useProgress } from '../store/progress';
import { useGameSessions } from '../store/gameSessions';
import { getApiKey, ensureApiKeyPersisted } from '../platform/secureStore';
import { isNative } from '../platform';
import { LoadingScreen } from './LoadingScreen';

const HYDRATE_MS = 3000;

function waitHydrated(store: {
  persist: { hasHydrated(): boolean; onFinishHydration(fn: () => void): () => void };
}, timeoutMs: number): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    store.persist.onFinishHydration(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

export function HydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => !isNative());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isNative()) {
        await Promise.race([
          Promise.all([
            waitHydrated(useSettings, HYDRATE_MS),
            waitHydrated(useProgress, HYDRATE_MS),
            waitHydrated(useGameSessions, HYDRATE_MS),
          ]),
          new Promise<void>((r) => setTimeout(r, HYDRATE_MS)),
        ]);
      }
      if (!cancelled) setReady(true);
      try {
        const key = await getApiKey();
        if (cancelled) return;
        if (key) useSettings.getState().setLlm({ apiKey: key });
        else await ensureApiKeyPersisted(useSettings.getState().llm.apiKey);
      } catch {
        /* 视为无 Key，不挡住启动 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let removed = false;
    let handle: { remove: () => Promise<void> | void } | undefined;
    void import('@capacitor/app').then(({ App }) => {
      if (removed) return;
      return App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) void useGameSessions.getState().flushPendingSave();
      }).then((h) => {
        if (removed) {
          void h.remove();
          return;
        }
        handle = h;
      });
    });
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, []);

  if (!ready) return <LoadingScreen message="正在加载…" />;
  return children;
}
