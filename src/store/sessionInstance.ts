import { useStore, type StoreApi } from 'zustand';
import { createSessionStore, type SessionState, type LlmPort } from './session';
import { createEngineService } from '../engine/engineService';
import { ENGINE_JS_URL } from '../engine/enginePath.generated';
import { streamChat } from '../llm/client';
import { useSettings } from './settings';
import { useProgress } from './progress';

let storePromise: Promise<StoreApi<SessionState>> | null = null;

const llm: LlmPort = {
  stream(messages, opts) {
    const { llm: cfg } = useSettings.getState();
    if (!cfg.apiKey) {
      return (async function* () { throw new Error('尚未配置 API Key，请先在设置中填写'); })();
    }
    return streamChat(cfg, messages, { temperature: opts.temperature, signal: opts.signal });
  },
};

export function getSessionStore(): Promise<StoreApi<SessionState>> {
  if (!storePromise) {
    storePromise = createEngineService(ENGINE_JS_URL).then((engine) =>
      createSessionStore({
        engine,
        llm,
        onFinished: (lessonId, outcome, clean) => useProgress.getState().recordAttempt(lessonId, outcome, clean),
      }),
    );
  }
  return storePromise;
}

export function useSession<T>(store: StoreApi<SessionState>, selector: (s: SessionState) => T): T {
  return useStore(store, selector);
}
