export type DifficultyId = 'beginner' | 'easy' | 'medium' | 'hard' | 'max';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  skillLevel: number; // Stockfish "Skill Level" 0..20
  depth: number;
  /** 搜索时间封顶（毫秒），与 depth 先到为止 */
  moveTimeMs: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'beginner', label: '入门', skillLevel: 3, depth: 5, moveTimeMs: 800 },
  { id: 'easy', label: '初级', skillLevel: 8, depth: 8, moveTimeMs: 800 },
  { id: 'medium', label: '中级', skillLevel: 14, depth: 12, moveTimeMs: 800 },
  { id: 'hard', label: '高级', skillLevel: 20, depth: 16, moveTimeMs: 1500 },
  { id: 'max', label: '满力', skillLevel: 20, depth: 20, moveTimeMs: 3000 },
];

/** 开局练习仅两档：一般（会出软着）/ 高级 */
export const OPENING_OPPONENTS: Difficulty[] = [
  { id: 'easy', label: '一般对手', skillLevel: 9, depth: 8, moveTimeMs: 800 },
  { id: 'hard', label: '高级对手', skillLevel: 20, depth: 16, moveTimeMs: 1500 },
];

export function difficultyById(id: string): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[2];
}

export function openingOpponentById(id: string): Difficulty {
  return OPENING_OPPONENTS.find((d) => d.id === id) ?? OPENING_OPPONENTS[0];
}

/** analyst 用的固定分析深度与时间封顶 */
export const ANALYSIS_DEPTH = 16;
export const ANALYSIS_MOVETIME_MS = 1500;
