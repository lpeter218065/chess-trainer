import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LlmConfig, ReasoningEffort } from '../llm/client';
import { normalizeLlmBaseUrl } from '../llm/client';
import type { DifficultyId } from '../engine/difficulty';
import { createPlatformStorage } from '../platform/storage';
import { setApiKey } from '../platform/secureStore';

interface SettingsState {
  llm: LlmConfig;
  temperature: number;
  difficultyId: DifficultyId;
  setLlm(partial: Partial<LlmConfig>): void;
  setTemperature(t: number): void;
  setDifficultyId(id: DifficultyId): void;
}

type EnvBag = {
  DEV?: boolean;
  VITE_LLM_API_KEY?: string;
  VITE_LLM_BASE_URL?: string;
  VITE_LLM_MODEL?: string;
  VITE_LLM_REASONING_EFFORT?: string;
};

export function envLlm(env: EnvBag = import.meta.env as EnvBag): LlmConfig {
  const effort = env.VITE_LLM_REASONING_EFFORT as ReasoningEffort | undefined;
  const dev = env.DEV === true;
  return {
    baseUrl: normalizeLlmBaseUrl(env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1'),
    apiKey: dev ? (env.VITE_LLM_API_KEY || '') : '',
    model: env.VITE_LLM_MODEL || 'gpt-4o-mini',
    ...(effort ? { reasoningEffort: effort } : {}),
  };
}

export function partializeSettings(s: SettingsState) {
  return {
    temperature: s.temperature,
    difficultyId: s.difficultyId,
    llm: {
      baseUrl: s.llm.baseUrl,
      model: s.llm.model,
      ...(s.llm.reasoningEffort ? { reasoningEffort: s.llm.reasoningEffort } : {}),
    },
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      llm: envLlm(),
      temperature: 0.8,
      difficultyId: 'medium',
      setLlm: (partial) => {
        set((s) => ({
          llm: {
            ...s.llm,
            ...partial,
            ...(partial.baseUrl !== undefined ? { baseUrl: normalizeLlmBaseUrl(partial.baseUrl) } : {}),
          },
        }));
        if (partial.apiKey !== undefined) {
          void setApiKey(partial.apiKey);
        }
      },
      setTemperature: (temperature) => set({ temperature }),
      setDifficultyId: (difficultyId) => set({ difficultyId }),
    }),
    {
      name: 'chess-trainer-settings',
      storage: createJSONStorage(() => createPlatformStorage('small')),
      partialize: partializeSettings,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const envDefaults = envLlm();
        const stored = p.llm;
        const preferEnv = Boolean(import.meta.env.DEV && envDefaults.apiKey);
        return {
          ...current,
          ...p,
          llm: {
            ...current.llm,
            ...stored,
            apiKey: preferEnv ? envDefaults.apiKey : (stored?.apiKey || envDefaults.apiKey || current.llm.apiKey),
            baseUrl: normalizeLlmBaseUrl(
              preferEnv ? envDefaults.baseUrl : (stored?.baseUrl ?? envDefaults.baseUrl ?? current.llm.baseUrl),
            ),
            model: preferEnv ? envDefaults.model : (stored?.model ?? envDefaults.model ?? current.llm.model),
            reasoningEffort: preferEnv
              ? (envDefaults.reasoningEffort ?? stored?.reasoningEffort ?? current.llm.reasoningEffort)
              : (stored?.reasoningEffort ?? envDefaults.reasoningEffort ?? current.llm.reasoningEffort),
          },
        };
      },
    },
  ),
);
