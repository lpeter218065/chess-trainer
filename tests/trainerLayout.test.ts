import { describe, it, expect } from 'vitest';
import { boardSidePx } from '../src/components/layout/TrainerLayout';
describe('boardSidePx', () => {
  it('compact 竖屏：宽度足够时取接近满宽', () => {
    // 390 宽、844 高、下方预留 168 → 高度可用 676 > 390，取 390
    expect(boardSidePx('compact', 390, 844, false, 168)).toBe(390);
  });
  it('compact 矮屏：高度不足时按高度扣减', () => {
    expect(boardSidePx('compact', 390, 520, false, 168)).toBe(352);
  });
  it('不低于下限 200', () => {
    expect(boardSidePx('compact', 390, 360, false, 168)).toBe(200);
  });
  it('wide 返回 0（交给 CSS 网格）', () => {
    expect(boardSidePx('wide', 1200, 800, true, 0)).toBe(0);
  });
});
