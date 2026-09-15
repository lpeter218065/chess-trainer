import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPlatformStorage } from '../platform/storage';
import { islandByLevelId, isUnlocked as unlocked } from '../campaign';

interface CampaignStore {
  stars: Record<string, number>;
  cards: string[];
  recordLevel(levelId: string, stars: number, card: string): void;
  isUnlocked(levelId: string): boolean;
}

export const useCampaign = create<CampaignStore>()(
  persist(
    (set, get) => ({
      stars: {},
      cards: [],
      recordLevel(levelId, stars, card) {
        set((s) => {
          const prev = s.stars[levelId] ?? 0;
          const next = Math.max(prev, stars);
          const cards = s.cards.includes(card) ? s.cards : [...s.cards, card];
          return { stars: { ...s.stars, [levelId]: next }, cards };
        });
      },
      isUnlocked(levelId) {
        const island = islandByLevelId(levelId);
        if (!island) return false;
        return unlocked(island.levels, get().stars, levelId);
      },
    }),
    {
      name: 'chess-trainer-campaign',
      storage: createJSONStorage(() => createPlatformStorage('small')),
    },
  ),
);
