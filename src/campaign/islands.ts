import { LATER_ISLANDS, SICILIAN_ISLAND } from './sicilianIsland';
import { QUEEN_PAWN_ISLAND, QUEEN_PAWN_LATER } from './queenPawnIsland';
import type { CampaignLevel, Island } from './types';

export const CAMPAIGN_ISLANDS: Island[] = [SICILIAN_ISLAND, QUEEN_PAWN_ISLAND];

export function islandById(id: string): Island | undefined {
  return CAMPAIGN_ISLANDS.find((island) => island.id === id);
}

export function islandByLevelId(levelId: string): Island | undefined {
  return CAMPAIGN_ISLANDS.find((island) => island.levels.some((level) => level.id === levelId));
}

export function levelById(id: string): CampaignLevel | undefined {
  for (const island of CAMPAIGN_ISLANDS) {
    const level = island.levels.find((item) => item.id === id);
    if (level) return level;
  }
  return undefined;
}

export function laterIslandsOf(islandId: string): Island[] {
  if (islandId === SICILIAN_ISLAND.id) return LATER_ISLANDS;
  if (islandId === QUEEN_PAWN_ISLAND.id) return QUEEN_PAWN_LATER;
  return [];
}
