export type Section = 'opening' | 'middlegame' | 'endgame';
export type Color = 'w' | 'b';

export type StopRule =
  | { kind: 'plies'; count: number } // 用户走满 count 步结束
  | { kind: 'gameOver'; maxPlies: number }; // 分出结果或双方总步数到上限

export type Target = 'win' | 'draw' | 'hold';

export interface Lesson {
  id: string; // 'opening/italian-game'
  section: Section;
  title: string;
  summary: string;
  startFen: string;
  playerColor: Color; // 必须与 startFen 的行棋方一致
  theme: string;
  keyIdeas: string[];
  principleIds: string[];
  modelLine?: string[]; // SAN，从 startFen 开始
  stop: StopRule;
  target: Target;
  evalFloor?: number; // hold 用，默认 -100
  tags?: string[];
}

export const SECTION_LABEL: Record<Section, string> = {
  opening: '开局',
  middlegame: '中局',
  endgame: '残局',
};
