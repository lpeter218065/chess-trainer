import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LlmConfig, ReasoningEffort } from '../llm/client';
import { normalizeLlmBaseUrl } from '../llm/client';
import type { DifficultyId } from '../engine/difficulty';
import { createPlatformStorage } from '../platform/storage';
import { setApiKey } from '../platform/secureStore';
import type { LocalePreference } from '../i18n/locale';
import { parsePieceSet, type PieceSetId } from '../chess/pieceSet';
import { parseBoardTheme, type BoardThemeId } from '../chess/boardTheme';
import { parsePieceColor, type PieceColorId } from '../chess/pieceColor';

interface SettingsState {
  llm: LlmConfig;
  temperature: number;
  difficultyId: DifficultyId;
  /** 摇一摇 / 三指触屏呼出调试日志。默认关闭，避免误触；设置里的「查看日志」按钮不受影响。 */
  debugGesturesEnabled: boolean;
  localePref: LocalePreference;
  pieceSet: PieceSetId;
  boardTheme: BoardThemeId;
  pieceColor: PieceColorId;
  setLlm(partial: Partial<LlmConfig>): void;
  setTemperature(t: number): void;
  setDifficultyId(id: DifficultyId): void;
  setDebugGesturesEnabled(v: boolean): void;
  setLocalePref(pref: LocalePreference): void;
  setPieceSet(id: PieceSetId): void;
  setBoardTheme(id: BoardThemeId): void;
  setPieceColor(id: PieceColorId): void;
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
    debugGesturesEnabled: s.debugGesturesEnabled,
    localePref: s.localePref,
    pieceSet: s.pieceSet,
    boardTheme: s.boardTheme,
    pieceColor: s.pieceColor,
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
      debugGesturesEnabled: false,
      localePref: 'system',
      pieceSet: 'classic',
      boardTheme: 'walnut',
      pieceColor: 'standard',
      setLlm: (partial) => {
        set((s) => ({
          llm: {
            ...s.llm,
            ...partial,
            ...(partial.baseUrl !== undefined ? { baseUrl: normalizeLlmBaseUrl(partial.baseUrl) } : {}),
          },
        }));
        if (partial.apiKey !== undefined) {
          void setApiKey(partial.apiKey).catch((e) => console.warn('[settings] 保存 API Key 失败', e));
        }
      },
      setTemperature: (temperature) => set({ temperature }),
      setDifficultyId: (difficultyId) => set({ difficultyId }),
      setDebugGesturesEnabled: (debugGesturesEnabled) => set({ debugGesturesEnabled }),
      setLocalePref: (localePref) => set({ localePref }),
      setPieceSet: (id) => set({ pieceSet: parsePieceSet(id) }),
      setBoardTheme: (id) => set({ boardTheme: parseBoardTheme(id) }),
      setPieceColor: (id) => set({ pieceColor: parsePieceColor(id) }),
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
        const legacyKey = typeof stored?.apiKey === 'string' ? stored.apiKey : '';
        if (legacyKey && !preferEnv) void setApiKey(legacyKey).catch(() => undefined);
        return {
          ...current,
          ...p,
          localePref: p.localePref ?? current.localePref,
          pieceSet: parsePieceSet(p.pieceSet ?? current.pieceSet),
          boardTheme: parseBoardTheme(p.boardTheme ?? current.boardTheme),
          pieceColor: parsePieceColor(p.pieceColor ?? current.pieceColor),
          llm: {
            ...current.llm,
            ...stored,
            apiKey: preferEnv ? envDefaults.apiKey : (legacyKey || envDefaults.apiKey || current.llm.apiKey),
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
      onRehydrateStorage: () => (state) => {
        if (!state?.llm?.apiKey || import.meta.env.DEV) return;
        queueMicrotask(() => {
          useSettings.setState({ llm: { ...useSettings.getState().llm } });
        });
      },
    },
  ),
);
