import { describe, it, expect } from 'vitest';
import { ANALYSIS_MOVETIME_MS, DIFFICULTIES, OPENING_OPPONENTS, difficultyById } from '../src/engine/difficulty';

describe('difficulty', () => {
  it('5 档且递增', () => {
    expect(DIFFICULTIES.length).toBe(5);
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      expect(DIFFICULTIES[i].depth).toBeGreaterThanOrEqual(DIFFICULTIES[i - 1].depth);
      expect(DIFFICULTIES[i].skillLevel).toBeGreaterThanOrEqual(DIFFICULTIES[i - 1].skillLevel);
    }
  });
  it('按 id 查找，未知 id 回落到 medium', () => {
    expect(difficultyById('hard').label).toBe('高级');
    expect(difficultyById('nope').id).toBe('medium');
  });
});

describe('movetime 封顶', () => {
  it('每档都有 moveTimeMs，分析封顶 1500', () => {
    for (const d of [...DIFFICULTIES, ...OPENING_OPPONENTS]) expect(d.moveTimeMs).toBeGreaterThan(0);
    expect(DIFFICULTIES.find((d) => d.id === 'max')!.moveTimeMs).toBe(3000);
    expect(ANALYSIS_MOVETIME_MS).toBe(1500);
  });
});
