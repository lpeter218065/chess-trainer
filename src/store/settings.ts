import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LlmConfig } from '../llm/client';
import type { DifficultyId } from '../engine/difficulty';

interface SettingsState {
  llm: LlmConfig;
  temperature: number;
  difficultyId: DifficultyId;
  setLlm(partial: Partial<LlmConfig>): void;
  setTemperature(t: number): void;
  setDifficultyId(id: DifficultyId): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
      temperature: 0.8,
      difficultyId: 'medium',
      setLlm: (partial) => set((s) => ({ llm: { ...s.llm, ...partial } })),
      setTemperature: (temperature) => set({ temperature }),
      setDifficultyId: (difficultyId) => set({ difficultyId }),
    }),
    { name: 'chess-trainer-settings' },
  ),
);
