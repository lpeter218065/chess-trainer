export type DifficultyId = 'beginner' | 'easy' | 'medium' | 'hard' | 'max';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  skillLevel: number; // Stockfish "Skill Level" 0..20
  depth: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'beginner', label: '入门', skillLevel: 3, depth: 5 },
  { id: 'easy', label: '初级', skillLevel: 8, depth: 8 },
  { id: 'medium', label: '中级', skillLevel: 14, depth: 12 },
  { id: 'hard', label: '高级', skillLevel: 20, depth: 16 },
  { id: 'max', label: '满力', skillLevel: 20, depth: 20 },
];

export function difficultyById(id: string): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[2];
}

/** analyst 用的固定分析深度 */
export const ANALYSIS_DEPTH = 16;
