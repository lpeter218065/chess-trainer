import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Outcome } from '../chess/result';
import { createPlatformStorage } from '../platform/storage';

export interface ProgressRecord {
  attempts: number;
  completed: boolean; // 至少一次 success
  clean: boolean; // 至少一次 success 且未用 hint
  lastOutcome: Outcome;
  lastPlayedAt: string; // ISO
}

interface ProgressState {
  records: Record<string, ProgressRecord>;
  recordAttempt(lessonId: string, outcome: Outcome, clean: boolean): void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      records: {},
      recordAttempt: (lessonId, outcome, clean) =>
        set((s) => {
          const prev = s.records[lessonId];
          const success = outcome === 'success';
          return {
            records: {
              ...s.records,
              [lessonId]: {
                attempts: (prev?.attempts ?? 0) + 1,
                completed: (prev?.completed ?? false) || success,
                clean: (prev?.clean ?? false) || (success && clean),
                lastOutcome: outcome,
                lastPlayedAt: new Date().toISOString(),
              },
            },
          };
        }),
    }),
    {
      name: 'chess-trainer-progress',
      storage: createJSONStorage(() => createPlatformStorage('small')),
    },
  ),
);
