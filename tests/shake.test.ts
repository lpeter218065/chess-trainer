import { describe, it, expect } from 'vitest';
import { createShakeDetector } from '../src/debug/shake';

describe('createShakeDetector', () => {
  it('静止加速度不触发', () => {
    let n = 0;
    const d = createShakeDetector({ thresholdG: 2.3, cooldownMs: 500, onShake: () => { n += 1; } });
    d.sample(1.0, 0);
    d.sample(1.05, 80);
    d.sample(0.95, 160);
    expect(n).toBe(0);
  });

  it('超过阈值触发一次，冷却期内不重复', () => {
    let n = 0;
    const d = createShakeDetector({ thresholdG: 2.3, cooldownMs: 500, onShake: () => { n += 1; } });
    expect(d.sample(2.6, 0)).toBe(true);
    expect(d.sample(2.8, 100)).toBe(false);
    expect(d.sample(2.7, 600)).toBe(true);
    expect(n).toBe(2);
  });
});
