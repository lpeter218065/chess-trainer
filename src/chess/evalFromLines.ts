import type { Analysis } from '../engine/engineService';
import { scoreToCp } from './quality';

/**
 * 用户着法若正是走子前分析里某条 MultiPV 线的首着，该线分数就是走子后局面的评估，
 * 可省掉一次引擎搜索。返回值视角：走子后的行棋方（对手）。未命中返回 null。
 */
export function evalAfterFromLines(analysis: Analysis, userUci: string): number | null {
  const line = analysis.lines.find((l) => l.pv[0] === userUci);
  if (!line) return null;
  return -scoreToCp(line.score);
}
