import { useStore, type StoreApi } from 'zustand';
import { createReviewStore, emptyReviewSnapshot, type ReviewState } from './review';
import { getEngine } from '../engine/getEngine';
import { settingsLlmPort as llm } from '../llm/port';
import { useGameSessions } from './gameSessions';
import { createDebouncer } from '../utils/debounce';
import { titleFromHeaders } from '../review/document';
import { tl } from '../i18n';

let storePromise: Promise<StoreApi<ReviewState>> | null = null;

function attachReviewAutosave(store: StoreApi<ReviewState>) {
  const debouncer = createDebouncer(400);
  let lastJson = '';
  store.subscribe(() => {
    debouncer.schedule(() => {
      const gs = useGameSessions.getState();
      const id = gs.activeReviewId ?? gs.ensureReviewActive();
      const snap = store.getState().exportSnapshot();
      const json = JSON.stringify(snap);
      if (json === lastJson) return;
      lastJson = json;
      const title = titleFromHeaders(snap.headers, gs.metas[id]?.title || tl('review.untitled'));
      gs.saveReviewSnapshot(id, snap, title);
    });
  });
}

export function getReviewStore(): Promise<StoreApi<ReviewState>> {
  if (!storePromise) {
    storePromise = getEngine().then(async (engine) => {
      const store = createReviewStore(engine, llm);
      const gs = useGameSessions.getState();
      const id = gs.ensureReviewActive();
      await gs.loadSnapshot(id);
      const snap = gs.getReviewSnapshot(id);
      if (snap) store.getState().hydrateSnapshot(snap);
      attachReviewAutosave(store);
      return store;
    });
  }
  return storePromise;
}

export async function switchReviewSession(id: string): Promise<StoreApi<ReviewState>> {
  const store = await getReviewStore();
  const gs = useGameSessions.getState();
  if (gs.activeReviewId && gs.activeReviewId !== id) {
    gs.saveReviewSnapshot(gs.activeReviewId, store.getState().exportSnapshot());
  }
  gs.setActiveReview(id);
  await gs.loadSnapshot(id);
  const snap = gs.getReviewSnapshot(id);
  if (snap) store.getState().hydrateSnapshot(snap);
  else {
    store.getState().reset();
    gs.saveReviewSnapshot(id, emptyReviewSnapshot());
  }
  return store;
}

export async function newReviewSession(): Promise<StoreApi<ReviewState>> {
  const store = await getReviewStore();
  const gs = useGameSessions.getState();
  if (gs.activeReviewId) {
    gs.saveReviewSnapshot(gs.activeReviewId, store.getState().exportSnapshot());
  }
  const id = gs.newReview();
  store.getState().reset();
  gs.saveReviewSnapshot(id, emptyReviewSnapshot());
  return store;
}

export function useReview<T>(store: StoreApi<ReviewState>, selector: (s: ReviewState) => T): T {
  return useStore(store, selector);
}
