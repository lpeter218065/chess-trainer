import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPlatformStorage, debounceStorage } from '../platform/storage';
import { snapshotStorage } from './snapshotStorage';
import { exploreSummary, lessonSummary, reviewSummary } from './sessionSummary';
import type { MoveNodeId, MoveTree } from '../chess/moveTree';
import type { FollowUpTurn } from '../llm/prompts';
import type { DifficultyId } from '../engine/difficulty';
import type { OpeningDrill } from '../lessons/openingDrills';
import type { Angle } from '../llm/angles';
import type { Phase, Round } from './session';
import type { Outcome } from '../chess/result';
import type { AnnotatedMove, ReviewDocument } from '../review/types';
import { tl } from '../i18n';

export type SessionKind = 'explore' | 'lesson' | 'review';

export interface SessionMeta {
  id: string;
  kind: SessionKind;
  title: string;
  updatedAt: string;
  lessonId?: string;
  /** 自定义开局练习的完整定义（模型生成的开局书），用于会话恢复 */
  drill?: OpeningDrill;
  /** 保存快照时算好的一行摘要；列表页据此渲染，无需加载快照 */
  summary?: string;
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

export interface ReviewSnapshot {
  pgn: string;
  headers: Record<string, string>;
  startFen: string;
  moves: AnnotatedMove[];
  document: ReviewDocument | null;
  /** 带括号变例与短评的复盘 PGN；旧快照可能没有 */
  annotatedPgn?: string;
  ply: number;
  orientation: 'white' | 'black';
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
  activeExploreId: string | null;
  activeLessonId: string | null;
  activeReviewId: string | null;
  /** 全局当前会话：多种活动项同时存在时，列表只标这一条为「当前」 */
  currentSessionId: string | null;

  list(kind: SessionKind): SessionMeta[];
  ensureExploreActive(defaultTitle?: string): string;
  ensureLessonActive(lessonId: string, defaultTitle: string): string;
  saveExploreSnapshot(id: string, snap: ExploreSnapshot, title?: string): void;
  saveLessonSnapshot(id: string, snap: LessonSnapshot, title?: string): void;
  saveReviewSnapshot(id: string, snap: ReviewSnapshot, title?: string): void;
  saveAsExplore(fromId: string, title: string): string | null;
  saveAsLesson(fromId: string, title: string): string | null;
  rename(id: string, title: string): void;
  setActiveExplore(id: string): void;
  setActiveLesson(id: string): void;
  setActiveReview(id: string): void;
  deleteSession(id: string): void;
  newExplore(title?: string): string;
  newReview(title?: string): string;
  ensureReviewActive(defaultTitle?: string): string;
  flushPendingSave(): Promise<void>;
  newLesson(lessonId: string, title: string, extra?: { drill?: OpeningDrill }): string;
  /** 读取该会话的快照到内存缓存；读快照前必须先 await 它 */
  loadSnapshot(id: string): Promise<void>;
  getExploreSnapshot(id: string): ExploreSnapshot | null;
  getLessonSnapshot(id: string): LessonSnapshot | null;
  getReviewSnapshot(id: string): ReviewSnapshot | null;
}

/** 持久化的部分：只有 metas 与活动会话，快照走 snapshotStorage 分 key 存 */
export interface PersistedGameSessions {
  metas: Record<string, SessionMeta>;
  activeExploreId: string | null;
  activeLessonId: string | null;
  activeReviewId: string | null;
  currentSessionId: string | null;
}

/** 同一时刻只允许一条会话是当前：优先 last-activated，否则取两个活动项里更新更晚的。 */
export function resolveCurrentSessionId(s: {
  metas: Record<string, SessionMeta>;
  activeExploreId: string | null;
  activeLessonId: string | null;
  activeReviewId?: string | null;
  currentSessionId?: string | null;
}): string | null {
  const claimed = s.currentSessionId;
  if (claimed) {
    const meta = s.metas[claimed];
    if (meta?.kind === 'explore' && s.activeExploreId === claimed) return claimed;
    if (meta?.kind === 'lesson' && s.activeLessonId === claimed) return claimed;
    if (meta?.kind === 'review' && s.activeReviewId === claimed) return claimed;
  }
  const candidates = [s.activeExploreId, s.activeLessonId, s.activeReviewId ?? null]
    .map((id) => (id ? s.metas[id] : undefined))
    .filter((m): m is SessionMeta => Boolean(m));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultExploreTitle() {
  const d = new Date();
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  return tl('session.exploreNow', { time });
}

const gameSessionStorage = debounceStorage(createPlatformStorage('large'), 400);

export async function flushPendingSave(): Promise<void> {
  await Promise.all([gameSessionStorage.flush(), snapshotStorage.flush()]);
}

/** v0：快照曾与 metas 同存一个 blob。搬进 snapshotStorage，并把摘要补进 meta。 */
export function migrateGameSessions(persisted: unknown, version: number): PersistedGameSessions {
  const p = (persisted ?? {}) as Partial<PersistedGameSessions> & {
    exploreData?: Record<string, ExploreSnapshot>;
    lessonData?: Record<string, LessonSnapshot>;
  };
  const metas: Record<string, SessionMeta> = { ...(p.metas ?? {}) };
  if (version < 1) {
    for (const [id, snap] of Object.entries(p.exploreData ?? {})) {
      snapshotStorage.set(id, snap);
      if (metas[id]) metas[id] = { ...metas[id], summary: exploreSummary(snap) };
    }
    for (const [id, snap] of Object.entries(p.lessonData ?? {})) {
      snapshotStorage.set(id, snap);
      if (metas[id]) metas[id] = { ...metas[id], summary: lessonSummary(snap) };
    }
  }
  const activeExploreId = p.activeExploreId ?? null;
  const activeLessonId = p.activeLessonId ?? null;
  const activeReviewId = p.activeReviewId ?? null;
  return {
    metas,
    activeExploreId,
    activeLessonId,
    activeReviewId,
    currentSessionId: resolveCurrentSessionId({
      metas,
      activeExploreId,
      activeLessonId,
      activeReviewId,
      currentSessionId: p.currentSessionId ?? null,
    }),
  };
}

export const useGameSessions = create<GameSessionsState>()(
  persist(
    (set, get) => ({
      metas: {},
      activeExploreId: null,
      activeLessonId: null,
      activeReviewId: null,
      currentSessionId: null,

      list(kind) {
        return Object.values(get().metas)
          .filter((m) => m.kind === kind)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },

      ensureExploreActive(defaultTitle) {
        const s = get();
        if (s.activeExploreId && s.metas[s.activeExploreId]?.kind === 'explore') {
          if (s.currentSessionId !== s.activeExploreId) set({ currentSessionId: s.activeExploreId });
          return s.activeExploreId;
        }
        return get().newExplore(defaultTitle);
      },

      ensureLessonActive(lessonId, defaultTitle) {
        const s = get();
        const active = s.activeLessonId ? s.metas[s.activeLessonId] : null;
        if (active?.kind === 'lesson' && active.lessonId === lessonId) {
          if (s.currentSessionId !== s.activeLessonId) set({ currentSessionId: s.activeLessonId });
          return s.activeLessonId!;
        }
        // Prefer most recent session for this lesson
        const existing = get().list('lesson').find((m) => m.lessonId === lessonId);
        if (existing) {
          set({ activeLessonId: existing.id, currentSessionId: existing.id });
          return existing.id;
        }
        return get().newLesson(lessonId, defaultTitle);
      },

      ensureReviewActive(defaultTitle) {
        const s = get();
        if (s.activeReviewId && s.metas[s.activeReviewId]?.kind === 'review') {
          if (s.currentSessionId !== s.activeReviewId) set({ currentSessionId: s.activeReviewId });
          return s.activeReviewId;
        }
        return get().newReview(defaultTitle);
      },

      saveExploreSnapshot(id, snap, title) {
        const prev = get().metas[id];
        if (!prev || prev.kind !== 'explore') return;
        snapshotStorage.set(id, snap);
        set((s) => ({
          metas: {
            ...s.metas,
            [id]: { ...prev, title: title ?? prev.title, updatedAt: nowIso(), summary: exploreSummary(snap) },
          },
        }));
      },

      saveLessonSnapshot(id, snap, title) {
        const prev = get().metas[id];
        if (!prev || prev.kind !== 'lesson') return;
        snapshotStorage.set(id, snap);
        set((s) => ({
          metas: {
            ...s.metas,
            [id]: {
              ...prev,
              title: title ?? prev.title,
              updatedAt: nowIso(),
              lessonId: snap.lessonId,
              summary: lessonSummary(snap),
            },
          },
        }));
      },

      saveReviewSnapshot(id, snap, title) {
        const prev = get().metas[id];
        if (!prev || prev.kind !== 'review') return;
        snapshotStorage.set(id, snap);
        set((s) => ({
          metas: {
            ...s.metas,
            [id]: { ...prev, title: title ?? prev.title, updatedAt: nowIso(), summary: reviewSummary(snap) },
          },
        }));
      },

      saveAsExplore(fromId, title) {
        const s = get();
        const data = snapshotStorage.peek<ExploreSnapshot>(fromId);
        const prev = s.metas[fromId];
        if (!data || !prev || prev.kind !== 'explore') return null;
        const id = newId();
        const copy = structuredClone(data);
        const meta: SessionMeta = {
          id,
          kind: 'explore',
          title: title.trim() || defaultExploreTitle(),
          updatedAt: nowIso(),
          summary: exploreSummary(copy),
        };
        snapshotStorage.set(id, copy);
        set({ metas: { ...s.metas, [id]: meta }, activeExploreId: id, currentSessionId: id });
        return id;
      },

      saveAsLesson(fromId, title) {
        const s = get();
        const data = snapshotStorage.peek<LessonSnapshot>(fromId);
        const prev = s.metas[fromId];
        if (!data || !prev || prev.kind !== 'lesson') return null;
        const id = newId();
        const copy = structuredClone(data);
        const meta: SessionMeta = {
          id,
          kind: 'lesson',
          title: title.trim() || prev.title,
          updatedAt: nowIso(),
          lessonId: copy.lessonId,
          ...(prev.drill ? { drill: prev.drill } : {}),
          summary: lessonSummary(copy),
        };
        snapshotStorage.set(id, copy);
        set({ metas: { ...s.metas, [id]: meta }, activeLessonId: id, currentSessionId: id });
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
        set({ activeExploreId: id, currentSessionId: id });
      },

      setActiveLesson(id) {
        if (get().metas[id]?.kind !== 'lesson') return;
        set({ activeLessonId: id, currentSessionId: id });
      },

      setActiveReview(id) {
        if (get().metas[id]?.kind !== 'review') return;
        set({ activeReviewId: id, currentSessionId: id });
      },

      deleteSession(id) {
        snapshotStorage.remove(id);
        set((s) => {
          const metas = { ...s.metas };
          delete metas[id];
          let { activeExploreId, activeLessonId, activeReviewId, currentSessionId } = s;
          if (activeExploreId === id) {
            activeExploreId = Object.values(metas).find((m) => m.kind === 'explore')?.id ?? null;
          }
          if (activeLessonId === id) {
            activeLessonId = Object.values(metas).find((m) => m.kind === 'lesson')?.id ?? null;
          }
          if (activeReviewId === id) {
            activeReviewId = Object.values(metas).find((m) => m.kind === 'review')?.id ?? null;
          }
          currentSessionId = resolveCurrentSessionId({
            metas,
            activeExploreId,
            activeLessonId,
            activeReviewId,
            currentSessionId: currentSessionId === id ? null : currentSessionId,
          });
          return { metas, activeExploreId, activeLessonId, activeReviewId, currentSessionId };
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
          currentSessionId: id,
        }));
        return id;
      },

      newReview(title) {
        const id = newId();
        const meta: SessionMeta = {
          id,
          kind: 'review',
          title: title?.trim() || tl('review.untitled'),
          updatedAt: nowIso(),
        };
        set((s) => ({
          metas: { ...s.metas, [id]: meta },
          activeReviewId: id,
          currentSessionId: id,
        }));
        return id;
      },

      newLesson(lessonId, title, extra) {
        const id = newId();
        const meta: SessionMeta = {
          id,
          kind: 'lesson',
          title: title.trim() || tl('session.defaultLesson'),
          updatedAt: nowIso(),
          lessonId,
          ...(extra?.drill ? { drill: extra.drill } : {}),
        };
        set((s) => ({
          metas: { ...s.metas, [id]: meta },
          activeLessonId: id,
          currentSessionId: id,
        }));
        return id;
      },

      async loadSnapshot(id) {
        await snapshotStorage.load(id);
      },

      getExploreSnapshot(id) {
        return snapshotStorage.peek<ExploreSnapshot>(id);
      },

      getLessonSnapshot(id) {
        return snapshotStorage.peek<LessonSnapshot>(id);
      },

      getReviewSnapshot(id) {
        return snapshotStorage.peek<ReviewSnapshot>(id);
      },

      flushPendingSave,
    }),
    {
      name: 'chess-trainer-game-sessions',
      version: 3,
      storage: createJSONStorage(() => gameSessionStorage),
      partialize: (s) => ({
        metas: s.metas,
        activeExploreId: s.activeExploreId,
        activeLessonId: s.activeLessonId,
        activeReviewId: s.activeReviewId,
        currentSessionId: s.currentSessionId,
      }),
      migrate: (p, v) => migrateGameSessions(p, v) as unknown as GameSessionsState,
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
