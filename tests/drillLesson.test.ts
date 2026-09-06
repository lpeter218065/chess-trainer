import { describe, it, expect } from 'vitest';
import { drillToLesson, parseDrillLessonId } from '../src/lessons/drillLesson';
import { openingDrillById } from '../src/lessons/openingDrills';

describe('parseDrillLessonId', () => {
  it('与 drillToLesson 生成的 id 往返一致', () => {
    const drill = openingDrillById('london')!;
    for (const color of ['w', 'b'] as const) {
      for (const mode of ['from-start', 'tabiya'] as const) {
        const lesson = drillToLesson(drill, color, mode);
        expect(parseDrillLessonId(lesson.id)).toEqual({ drillId: 'london', color, startMode: mode });
      }
    }
  });
  it('非 drill id 返回 null', () => {
    expect(parseDrillLessonId('opening/italian-game')).toBeNull();
    expect(parseDrillLessonId('drill/x')).toBeNull();
  });
});
