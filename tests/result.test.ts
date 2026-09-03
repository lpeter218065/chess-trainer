import { describe, it, expect } from 'vitest';
import { judgeResult, isFinished } from '../src/chess/result';
import type { Lesson } from '../src/lessons/schema';

const base: Lesson = {
  id: 'x/y', section: 'endgame', title: '', summary: '', startFen: '8/8/8/4k3/8/4K3/8/R7 w - - 0 1',
  playerColor: 'w', theme: '', keyIdeas: [], principleIds: [],
  stop: { kind: 'gameOver', maxPlies: 60 }, target: 'win',
};

describe('isFinished', () => {
  it('plies 规则：用户走满 count 步', () => {
    const l = { ...base, stop: { kind: 'plies', count: 8 } as const };
    expect(isFinished(l, 7, 14, false)).toBe(false);
    expect(isFinished(l, 8, 16, false)).toBe(true);
  });
  it('gameOver 规则：终局或到 maxPlies', () => {
    expect(isFinished(base, 3, 6, true)).toBe(true);
    expect(isFinished(base, 30, 60, false)).toBe(true);
    expect(isFinished(base, 3, 6, false)).toBe(false);
  });
  it('任何规则下终局都结束', () => {
    const l = { ...base, stop: { kind: 'plies', count: 8 } as const };
    expect(isFinished(l, 2, 4, true)).toBe(true);
  });
});

describe('judgeResult', () => {
  const common = { finalFen: base.startFen, evalHistory: [50, 60], qualities: ['good', 'best'] as const };
  it('win：实际获胜或最终评估 >= +500', () => {
    expect(judgeResult({ lesson: base, ...common, finalEvalCp: 600, gameResult: null }).outcome).toBe('success');
    expect(judgeResult({ lesson: base, ...common, finalEvalCp: 100, gameResult: 'playerWin' }).outcome).toBe('success');
    expect(judgeResult({ lesson: base, ...common, finalEvalCp: 100, gameResult: null }).outcome).toBe('fail');
  });
  it('draw：和棋或 |eval| <= 50', () => {
    const l = { ...base, target: 'draw' as const };
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: -30, gameResult: null }).outcome).toBe('success');
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: -30, gameResult: 'draw' }).outcome).toBe('success');
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: -300, gameResult: null }).outcome).toBe('fail');
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: 0, gameResult: 'playerLoss' }).outcome).toBe('fail');
  });
  it('hold：全程不低于 evalFloor 且无 blunder', () => {
    const l = { ...base, target: 'hold' as const };
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: 20, gameResult: null }).outcome).toBe('success');
    expect(judgeResult({ lesson: l, ...common, evalHistory: [50, -150], finalEvalCp: -150, gameResult: null }).outcome).toBe('fail');
    expect(judgeResult({ lesson: l, ...common, qualities: ['good', 'blunder'], finalEvalCp: 20, gameResult: null }).outcome).toBe('fail');
  });
});
