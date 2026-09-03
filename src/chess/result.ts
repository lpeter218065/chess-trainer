import type { Lesson } from '../lessons/schema';
import type { Quality } from './quality';

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
      if (gameResult === 'playerWin') return { outcome: 'success', reason: '完成杀王，达成目标。' };
      if (gameResult === 'playerLoss' || gameResult === 'draw') return { outcome: 'fail', reason: '没有赢下这个必胜局面。' };
      return finalEvalCp >= 500
        ? { outcome: 'success', reason: '结束时已形成决定性优势。' }
        : { outcome: 'fail', reason: '结束时优势不足以取胜。' };
    case 'draw':
      if (gameResult === 'draw') return { outcome: 'success', reason: '成功守和。' };
      if (gameResult === 'playerLoss') return { outcome: 'fail', reason: '防守失败，被杀王。' };
      if (gameResult === 'playerWin') return { outcome: 'success', reason: '对方失误，反而赢了。' };
      return Math.abs(finalEvalCp) <= 50
        ? { outcome: 'success', reason: '局面保持均势，守和成功。' }
        : { outcome: 'fail', reason: '防守出现漏洞，局面已经失守。' };
    case 'hold': {
      const floor = lesson.evalFloor ?? -100;
      if (gameResult === 'playerLoss') return { outcome: 'fail', reason: '被杀王。' };
      const dropped = p.evalHistory.some((e) => e < floor);
      const blundered = p.qualities.includes('blunder');
      if (dropped) return { outcome: 'fail', reason: '过程中评估掉到阈值以下。' };
      if (blundered) return { outcome: 'fail', reason: '出现了严重失误。' };
      return { outcome: 'success', reason: '全程保持了可接受的局面，没有严重失误。' };
    }
  }
}
