import { useStore, type StoreApi } from 'zustand';
import { createSessionStore, type SessionState } from './session';
import { getEngine } from '../engine/getEngine';
import { settingsLlmPort as llm } from '../llm/port';
import { useProgress } from './progress';
import { useGameSessions } from './gameSessions';
import { createDebouncer } from '../utils/debounce';
import type { Lesson } from '../lessons/schema';
import type { Difficulty } from '../engine/difficulty';

let storePromise: Promise<StoreApi<SessionState>> | null = null;

function attachLessonAutosave(store: StoreApi<SessionState>) {
  const debouncer = createDebouncer(400);
  let lastJson = '';
  store.subscribe(() => {
    debouncer.schedule(() => {
      const snap = store.getState().exportSnapshot();
      if (!snap) return;
      const gs = useGameSessions.getState();
      const id = gs.activeLessonId;
      if (!id) return;
      const meta = gs.metas[id];
      if (!meta || meta.kind !== 'lesson' || meta.lessonId !== snap.lessonId) return;
      const json = JSON.stringify(snap);
      if (json === lastJson) return;
      lastJson = json;
      gs.saveLessonSnapshot(id, snap);
    });
  });
}

export function getSessionStore(): Promise<StoreApi<SessionState>> {
  if (!storePromise) {
    storePromise = getEngine().then((engine) => {
      const store = createSessionStore({
        engine,
        llm,
        onFinished: (lessonId, outcome, clean) => useProgress.getState().recordAttempt(lessonId, outcome, clean),
      });
      attachLessonAutosave(store);
      return store;
    });
  }
  return storePromise;
}

/** 后台执行 start / hydrate；出错只记录，UI 靠 store 的 engineError / llmError 展示 */
function runInBackground(p: Promise<unknown>) {
  p.catch((e) => console.error('[session] 后台启动失败', e));
}

/** Start or restore lesson into the session store（立即返回，引擎与讲解在后台） */
export async function bootLessonSession(lesson: Lesson, difficulty: Difficulty): Promise<StoreApi<SessionState>> {
  const store = await getSessionStore();
  const gs = useGameSessions.getState();
  const id = gs.ensureLessonActive(lesson.id, `${lesson.title}`);
  const snap = gs.getLessonSnapshot(id);
  if (snap && snap.lessonId === lesson.id) {
    runInBackground(store.getState().hydrateSnapshot(snap, lesson));
  } else {
    runInBackground(
      store.getState().start(lesson, difficulty).then(() => {
        const exported = store.getState().exportSnapshot();
        if (exported && useGameSessions.getState().activeLessonId === id) gs.saveLessonSnapshot(id, exported, `${lesson.title}`);
      }),
    );
  }
  return store;
}

export async function switchLessonSession(id: string, lesson: Lesson, difficulty: Difficulty): Promise<void> {
  const store = await getSessionStore();
  const gs = useGameSessions.getState();
  if (gs.activeLessonId) {
    const cur = store.getState().exportSnapshot();
    if (cur) gs.saveLessonSnapshot(gs.activeLessonId, cur);
  }
  gs.setActiveLesson(id);
  const snap = gs.getLessonSnapshot(id);
  if (snap && snap.lessonId === lesson.id) {
    runInBackground(store.getState().hydrateSnapshot(snap, lesson));
  } else {
    runInBackground(
      store.getState().start(lesson, difficulty).then(() => {
        const exported = store.getState().exportSnapshot();
        if (exported && useGameSessions.getState().activeLessonId === id) gs.saveLessonSnapshot(id, exported);
      }),
    );
  }
}

export async function newLessonSession(lesson: Lesson, difficulty: Difficulty): Promise<void> {
  const store = await getSessionStore();
  const gs = useGameSessions.getState();
  if (gs.activeLessonId) {
    const cur = store.getState().exportSnapshot();
    if (cur) gs.saveLessonSnapshot(gs.activeLessonId, cur);
  }
  const id = gs.newLesson(lesson.id, `${lesson.title}`);
  runInBackground(
    store.getState().start(lesson, difficulty).then(() => {
      const exported = store.getState().exportSnapshot();
      if (exported && useGameSessions.getState().activeLessonId === id) gs.saveLessonSnapshot(id, exported);
    }),
  );
}

export function useSession<T>(store: StoreApi<SessionState>, selector: (s: SessionState) => T): T {
  return useStore(store, selector);
}
