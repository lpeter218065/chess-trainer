import { describe, it, expect } from 'vitest';
import { chooseAngle, type Angle } from '../src/llm/angles';

const rnd = (v: number) => () => v;

describe('chooseAngle', () => {
  it('blunder / mistake 强制 compare', () => {
    expect(chooseAngle({ quality: 'blunder', evalSwing: 0, history: [], random: rnd(0.1) })).toBe('compare');
    expect(chooseAngle({ quality: 'mistake', evalSwing: 0, history: [], random: rnd(0.9) })).toBe('compare');
  });
  it('评估剧变（>=150）用 tactics', () => {
    expect(chooseAngle({ quality: 'good', evalSwing: 180, history: [], random: rnd(0.5) })).toBe('tactics');
  });
  it('最近 3 回合没讲过原理时强制 principle', () => {
    expect(chooseAngle({ quality: 'good', evalSwing: 0, history: ['plan', 'tactics', 'king'], random: rnd(0.5) })).toBe('principle');
  });
  it('不与上一回合角度相同', () => {
    for (let i = 0; i < 20; i++) {
      const a = chooseAngle({ quality: 'good', evalSwing: 0, history: ['principle', 'plan'], random: rnd(i / 20) });
      expect(a).not.toBe('plan');
    }
  });
  it('good 及以上不会选 compare；inaccuracy 可以', () => {
    const angles = new Set<Angle>();
    for (let i = 0; i < 50; i++) angles.add(chooseAngle({ quality: 'good', evalSwing: 0, history: ['principle'], random: rnd(i / 50) }));
    expect(angles.has('compare')).toBe(false);
    const withInacc = new Set<Angle>();
    for (let i = 0; i < 50; i++) withInacc.add(chooseAngle({ quality: 'inaccuracy', evalSwing: 0, history: ['principle'], random: rnd(i / 50) }));
    expect(withInacc.has('compare')).toBe(true);
  });
});
