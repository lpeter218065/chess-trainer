import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPlatformStorage, debounceStorage } from '../platform/storage';
import type { MoveNodeId, MoveTree } from '../chess/moveTree';
import type { FollowUpTurn } from '../llm/prompts';
import type { DifficultyId } from '../engine/difficulty';
import type { OpeningDrill } from '../lessons/openingDrills';
import type { Angle } from '../llm/angles';
import type { Phase, Round } from './session';
import type { Outcome } from '../chess/result';

export type SessionKind = 'explore' | 'lesson';

export interface SessionMeta {
  id: string;
  kind: SessionKind;
  title: string;
  updatedAt: string;
  lessonId?: string;
  /** 自定义开局练习的完整定义（模型生成的开局书），用于会话恢复 */
  drill?: OpeningDrill;
}

export interface ExploreSnapshot {
  startFen: string;
  tree: MoveTree;
  path: MoveNodeId[];
  reviewDepth: number | null;
  orientation: 'white' | 'black';
  /** @deprecated kept for migration; prefer commentaries */
  commentary: string;
  commentaryPly: number | null;
  /** Primary commentaries keyed by exploreFollowUpThreadId */
  commentaries?: Record<string, CommentaryEntry>;
  followUps: Record<string, FollowUpTurn[]>;
}

export interface CommentaryEntry {
  threadId: string;
  path: MoveNodeId[];
  ply: number;
  text: string;
  /** short SAN line for history list, e.g. "1. e4 e5" */
  sansLabel: string;
  updatedAt: string;
}

export interface LessonSnapshot {
  lessonId: string;
  difficultyId: DifficultyId;
  fen: string;
  history: string[];
  rounds: Round[];
  evalHistory: number[];
  evalCp: number;
  intro: string;
  summary: string;
  hintUsed: boolean;
  usedPrincipleIds: string[];
  angleHistory: Angle[];
  followUps: Record<string, FollowUpTurn[]>;
  phase: Phase;
  result: { outcome: Outcome; reason: string } | null;
}

interface GameSessionsState {
  metas: Record<string, SessionMeta>;
  exploreData: Record<string, ExploreSnapshot>;
  lessonData: Record<string, LessonSnapshot>;
  activeExploreId: string | null;
  activeLessonId: string | null;

  list(kind: SessionKind): SessionMeta[];
  ensureExploreActive(defaultTitle?: string): string;
  ensureLessonActive(lessonId: string, defaultTitle: string): string;
  saveExploreSnapshot(id: string, snap: ExploreSnapshot, title?: string): void;
  saveLessonSnapshot(id: string, snap: LessonSnapshot, title?: string): void;
  saveAsExplore(fromId: string, title: string): string | null;
  saveAsLesson(fromId: string, title: string): string | null;
  rename(id: string, title: string): void;
  setActiveExplore(id: string): void;
  setActiveLesson(id: string): void;
  deleteSession(id: string): void;
  newExplore(title?: string): string;
  flushPendingSave(): Promise<void>;
  newLesson(lessonId: string, title: string, extra?: { drill?: OpeningDrill }): string;
  getExploreSnapshot(id: string): ExploreSnapshot | null;
  getLessonSnapshot(id: string): LessonSnapshot | null;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultExploreTitle() {
  const d = new Date();
  return `探索 · ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const gameSessionStorage = debounceStorage(createPlatformStorage('large'), 400);

export function flushPendingSave(): Promise<void> {
  return gameSessionStorage.flush();
}

export const useGameSessions = create<GameSessionsState>()(
  persist(
    (set, get) => ({
      metas: {},
      exploreData: {},
      lessonData: {},
      activeExploreId: null,
      activeLessonId: null,

      list(kind) {
        return Object.values(get().metas)
          .filter((m) => m.kind === kind)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },

      ensureExploreActive(defaultTitle) {
        const s = get();
        if (s.activeExploreId && s.metas[s.activeExploreId]?.kind === 'explore') return s.activeExploreId;
        return get().newExplore(defaultTitle);
      },

      ensureLessonActive(lessonId, defaultTitle) {
        const s = get();
        const active = s.activeLessonId ? s.metas[s.activeLessonId] : null;
        if (active?.kind === 'lesson' && active.lessonId === lessonId) return s.activeLessonId!;
        // Prefer most recent session for this lesson
        const existing = get().list('lesson').find((m) => m.lessonId === lessonId);
        if (existing) {
          set({ activeLessonId: existing.id });
          return existing.id;
        }
        return get().newLesson(lessonId, defaultTitle);
      },

      saveExploreSnapshot(id, snap, title) {
        set((s) => {
          const prev = s.metas[id];
          if (!prev || prev.kind !== 'explore') return s;
          return {
            exploreData: { ...s.exploreData, [id]: snap },
            metas: {
              ...s.metas,
              [id]: { ...prev, title: title ?? prev.title, updatedAt: nowIso() },
            },
          };
        });
      },

      saveLessonSnapshot(id, snap, title) {
        set((s) => {
          const prev = s.metas[id];
          if (!prev || prev.kind !== 'lesson') return s;
          return {
            lessonData: { ...s.lessonData, [id]: snap },
            metas: {
              ...s.metas,
              [id]: {
                ...prev,
                title: title ?? prev.title,
                updatedAt: nowIso(),
                lessonId: snap.lessonId,
              },
            },
          };
        });
      },

      saveAsExplore(fromId, title) {
        const s = get();
        const data = s.exploreData[fromId];
        const prev = s.metas[fromId];
        if (!data || !prev || prev.kind !== 'explore') return null;
        const id = newId();
        const meta: SessionMeta = { id, kind: 'explore', title: title.trim() || defaultExploreTitle(), updatedAt: nowIso() };
        set({
          metas: { ...s.metas, [id]: meta },
          exploreData: { ...s.exploreData, [id]: structuredClone(data) },
          activeExploreId: id,
        });
        return id;
      },

      saveAsLesson(fromId, title) {
        const s = get();
        const data = s.lessonData[fromId];
        const prev = s.metas[fromId];
        if (!data || !prev || prev.kind !== 'lesson') return null;
        const id = newId();
        const meta: SessionMeta = {
          id,
          kind: 'lesson',
          title: title.trim() || prev.title,
          updatedAt: nowIso(),
          lessonId: data.lessonId,
          ...(prev.drill ? { drill: prev.drill } : {}),
        };
        set({
          metas: { ...s.metas, [id]: meta },
          lessonData: { ...s.lessonData, [id]: structuredClone(data) },
          activeLessonId: id,
        });
        return id;
      },

      rename(id, title) {
        const t = title.trim();
        if (!t) return;
        set((s) => {
          const prev = s.metas[id];
          if (!prev) return s;
          return { metas: { ...s.metas, [id]: { ...prev, title: t, updatedAt: nowIso() } } };
        });
      },

      setActiveExplore(id) {
        if (get().metas[id]?.kind !== 'explore') return;
        set({ activeExploreId: id });
      },

      setActiveLesson(id) {
        if (get().metas[id]?.kind !== 'lesson') return;
        set({ activeLessonId: id });
      },

      deleteSession(id) {
        set((s) => {
          const metas = { ...s.metas };
          const exploreData = { ...s.exploreData };
          const lessonData = { ...s.lessonData };
          const kind = metas[id]?.kind;
          delete metas[id];
          delete exploreData[id];
          delete lessonData[id];
          let { activeExploreId, activeLessonId } = s;
          if (activeExploreId === id) {
            activeExploreId = Object.values(metas).find((m) => m.kind === 'explore')?.id ?? null;
          }
          if (activeLessonId === id) {
            activeLessonId = Object.values(metas).find((m) => m.kind === 'lesson')?.id ?? null;
          }
          void kind;
          return { metas, exploreData, lessonData, activeExploreId, activeLessonId };
        });
      },

      newExplore(title) {
        const id = newId();
        const meta: SessionMeta = {
          id,
          kind: 'explore',
          title: title?.trim() || defaultExploreTitle(),
          updatedAt: nowIso(),
        };
        set((s) => ({
          metas: { ...s.metas, [id]: meta },
          activeExploreId: id,
        }));
        return id;
      },

      newLesson(lessonId, title, extra) {
        const id = newId();
        const meta: SessionMeta = {
          id,
          kind: 'lesson',
          title: title.trim() || '课程',
          updatedAt: nowIso(),
          lessonId,
          ...(extra?.drill ? { drill: extra.drill } : {}),
        };
        set((s) => ({
          metas: { ...s.metas, [id]: meta },
          activeLessonId: id,
        }));
        return id;
      },

      getExploreSnapshot(id) {
        return get().exploreData[id] ?? null;
      },

      getLessonSnapshot(id) {
        return get().lessonData[id] ?? null;
      },

      flushPendingSave() {
        return gameSessionStorage.flush();
      },
    }),
    {
      name: 'chess-trainer-game-sessions',
      storage: createJSONStorage(() => gameSessionStorage),
    },
  ),
);

export function formatSessionTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return iso;
  }
}
