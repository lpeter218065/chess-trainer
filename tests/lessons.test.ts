import { describe, it, expect } from 'vitest';
import { Chess, validateFen } from 'chess.js';
import { LESSONS } from '../src/lessons';
import { PRINCIPLES, principleById } from '../src/lessons/principles';

describe('lessons data', () => {
  it('有 12 课，id 唯一', () => {
    expect(LESSONS.length).toBe(12);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(12);
  });

  for (const lesson of LESSONS) {
    describe(lesson.id, () => {
      it('startFen 合法', () => {
        expect(validateFen(lesson.startFen).ok).toBe(true);
      });
      it('playerColor 与 FEN 行棋方一致', () => {
        expect(new Chess(lesson.startFen).turn()).toBe(lesson.playerColor);
      });
      it('id 前缀与 section 一致', () => {
        expect(lesson.id.startsWith(lesson.section + '/')).toBe(true);
      });
      it('principleIds 都存在', () => {
        for (const id of lesson.principleIds) expect(() => principleById(id)).not.toThrow();
      });
      it('modelLine 每步合法', () => {
        if (!lesson.modelLine) return;
        const c = new Chess(lesson.startFen);
        for (const san of lesson.modelLine) expect(() => c.move(san)).not.toThrow();
      });
    });
  }
});

describe('principles', () => {
  it('至少 25 条且 id 唯一', () => {
    expect(PRINCIPLES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(PRINCIPLES.map((p) => p.id)).size).toBe(PRINCIPLES.length);
  });
});
