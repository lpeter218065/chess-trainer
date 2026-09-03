import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LlmConfig, ReasoningEffort } from '../llm/client';
import type { DifficultyId } from '../engine/difficulty';

interface SettingsState {
  llm: LlmConfig;
  temperature: number;
  difficultyId: DifficultyId;
  setLlm(partial: Partial<LlmConfig>): void;
  setTemperature(t: number): void;
  setDifficultyId(id: DifficultyId): void;
}

const env = import.meta.env;
const envEffort = env.VITE_LLM_REASONING_EFFORT as ReasoningEffort | undefined;

function envLlm(): LlmConfig {
  return {
    baseUrl: env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: env.VITE_LLM_API_KEY || '',
    model: env.VITE_LLM_MODEL || 'gpt-4o-mini',
    ...(envEffort ? { reasoningEffort: envEffort } : {}),
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      llm: envLlm(),
      temperature: 0.8,
      difficultyId: 'medium',
      setLlm: (partial) => set((s) => ({ llm: { ...s.llm, ...partial } })),
      setTemperature: (temperature) => set({ temperature }),
      setDifficultyId: (difficultyId) => set({ difficultyId }),
    }),
    {
      name: 'chess-trainer-settings',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const envDefaults = envLlm();
        const stored = p.llm;
        return {
          ...current,
          ...p,
          llm: {
            ...current.llm,
            ...stored,
            // 本地未填 key 时用 .env.local，避免 persist 把空 key 盖住环境默认值
            apiKey: stored?.apiKey || envDefaults.apiKey,
            baseUrl: stored?.apiKey ? stored.baseUrl : (envDefaults.apiKey ? envDefaults.baseUrl : (stored?.baseUrl ?? current.llm.baseUrl)),
            model: stored?.apiKey ? stored.model : (envDefaults.apiKey ? envDefaults.model : (stored?.model ?? current.llm.model)),
            reasoningEffort: stored?.reasoningEffort ?? envDefaults.reasoningEffort ?? current.llm.reasoningEffort,
          },
        };
      },
    },
  ),
);
