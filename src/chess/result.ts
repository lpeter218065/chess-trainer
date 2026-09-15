import type { Lesson } from '../lessons/schema';
import type { Quality } from './quality';
import { tl } from '../i18n';

export type Outcome = 'success' | 'fail';
export type GameResult = 'playerWin' | 'playerLoss' | 'draw' | null;

export function isFinished(lesson: Lesson, userPlies: number, totalPlies: number, gameOver: boolean): boolean {
  if (gameOver) return true;
  if (lesson.stop.kind === 'plies') return userPlies >= lesson.stop.count;
  return totalPlies >= lesson.stop.maxPlies;
}

export interface JudgeParams {
  lesson: Lesson;
  finalFen: string;
  finalEvalCp: number; // 用户视角
  evalHistory: number[]; // 每回合用户走子后的评估，用户视角
  qualities: readonly Quality[];
  gameResult: GameResult;
}

export function judgeResult(p: JudgeParams): { outcome: Outcome; reason: string } {
  const { lesson, finalEvalCp, gameResult } = p;
  switch (lesson.target) {
    case 'win':
      if (gameResult === 'playerWin') return { outcome: 'success', reason: tl('result.winMate') };
      if (gameResult === 'playerLoss' || gameResult === 'draw') return { outcome: 'fail', reason: tl('result.winMissed') };
      return finalEvalCp >= 500
        ? { outcome: 'success', reason: tl('result.winEval') }
        : { outcome: 'fail', reason: tl('result.winShort') };
    case 'draw':
      if (gameResult === 'draw') return { outcome: 'success', reason: tl('result.drawOk') };
      if (gameResult === 'playerLoss') return { outcome: 'fail', reason: tl('result.drawMated') };
      if (gameResult === 'playerWin') return { outcome: 'success', reason: tl('result.drawWon') };
      return Math.abs(finalEvalCp) <= 50
        ? { outcome: 'success', reason: tl('result.drawEqual') }
        : { outcome: 'fail', reason: tl('result.drawBroke') };
    case 'hold': {
      const floor = lesson.evalFloor ?? -100;
      if (gameResult === 'playerLoss') return { outcome: 'fail', reason: tl('result.holdMated') };
      const dropped = p.evalHistory.some((e) => e < floor);
      const blundered = p.qualities.includes('blunder');
      if (dropped) return { outcome: 'fail', reason: tl('result.holdEval') };
      if (blundered) return { outcome: 'fail', reason: tl('result.holdBlunder') };
      return { outcome: 'success', reason: tl('result.holdOk') };
    }
  }
}
