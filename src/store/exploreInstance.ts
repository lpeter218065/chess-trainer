import { useStore, type StoreApi } from 'zustand';
import { createExploreStore, type ExploreState } from './explore';
import { getEngine } from '../engine/getEngine';
import { settingsLlmPort as llm } from '../llm/port';
import { useGameSessions } from './gameSessions';
import { createDebouncer } from '../utils/debounce';
import { START_FEN } from '../chess/pgn';
import { createEmptyTree } from '../chess/moveTree';

let storePromise: Promise<StoreApi<ExploreState>> | null = null;

const emptyExploreSnap = () => ({
  startFen: START_FEN,
  tree: createEmptyTree(),
  path: [] as string[],
  reviewDepth: null as number | null,
  orientation: 'white' as const,
  commentary: '',
  commentaryPly: null as number | null,
  commentaries: {},
  followUps: {},
});

function attachExploreAutosave(store: StoreApi<ExploreState>) {
  const debouncer = createDebouncer(400);
  let lastJson = '';
  store.subscribe(() => {
    debouncer.schedule(() => {
      const gs = useGameSessions.getState();
      const id = gs.activeExploreId ?? gs.ensureExploreActive();
      const snap = store.getState().exportSnapshot();
      const json = JSON.stringify(snap);
      if (json === lastJson && JSON.stringify(gs.getExploreSnapshot(id)) === json) return;
      lastJson = json;
      gs.saveExploreSnapshot(id, snap);
    });
  });
}

export function getExploreStore(): Promise<StoreApi<ExploreState>> {
  if (!storePromise) {
    storePromise = getEngine().then(async (engine) => {
      const store = createExploreStore(engine, llm);
      const gs = useGameSessions.getState();
      const id = gs.ensureExploreActive();
      await gs.loadSnapshot(id);
      const snap = gs.getExploreSnapshot(id);
      if (snap) {
        store.getState().hydrateSnapshot(snap);
      } else {
        store.getState().loadStart();
        gs.saveExploreSnapshot(id, emptyExploreSnap());
      }
      attachExploreAutosave(store);
      return store;
    });
  }
  return storePromise;
}

/** Switch active explore session and hydrate (or empty start) */
export async function switchExploreSession(id: string): Promise<StoreApi<ExploreState>> {
  const store = await getExploreStore();
  const gs = useGameSessions.getState();
  if (gs.activeExploreId && gs.activeExploreId !== id) {
    gs.saveExploreSnapshot(gs.activeExploreId, store.getState().exportSnapshot());
  }
  gs.setActiveExplore(id);
  await gs.loadSnapshot(id);
  const snap = gs.getExploreSnapshot(id);
  if (snap) store.getState().hydrateSnapshot(snap);
  else {
    store.getState().loadStart();
    gs.saveExploreSnapshot(id, store.getState().exportSnapshot());
  }
  return store;
}

export async function newExploreSession(): Promise<StoreApi<ExploreState>> {
  const store = await getExploreStore();
  const gs = useGameSessions.getState();
  // flush current
  if (gs.activeExploreId) {
    gs.saveExploreSnapshot(gs.activeExploreId, store.getState().exportSnapshot());
  }
  const id = gs.newExplore();
  store.getState().loadStart();
  gs.saveExploreSnapshot(id, store.getState().exportSnapshot());
  return store;
}

export function useExplore<T>(store: StoreApi<ExploreState>, selector: (s: ExploreState) => T): T {
  return useStore(store, selector);
}
