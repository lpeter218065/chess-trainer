import { MATE_CP } from './notation';

export interface Score {
  cp?: number;
  mate?: number; // 正数=行棋方将杀，负数=行棋方被杀，绝对值为回合数
}

export type Quality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const QUALITY_LABEL: Record<Quality, string> = {
  best: '最佳',
  good: '不错',
  inaccuracy: '不精确',
  mistake: '错误',
  blunder: '严重失误',
};

export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) {
    return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
  }
  return score.cp ?? 0;
}

export interface ClassifyParams {
  evalBefore: number; // 用户视角 cp，走子前
  evalAfter: number; // 用户视角 cp，走子后
  userMoveUci: string;
  bestMoveUci: string;
}

export function classifyMove(p: ClassifyParams): Quality {
  if (p.userMoveUci === p.bestMoveUci) return 'best';
  const delta = p.evalAfter - p.evalBefore;
  if (delta >= -30) return 'good';
  if (delta >= -90) return 'inaccuracy';
  if (delta >= -200) return 'mistake';
  return 'blunder';
}
