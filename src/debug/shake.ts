export function createShakeDetector(opts: {
  thresholdG?: number;
  cooldownMs?: number;
  onShake: () => void;
}) {
  const thresholdG = opts.thresholdG ?? 2.3;
  const cooldownMs = opts.cooldownMs ?? 800;
  let last = Number.NEGATIVE_INFINITY;
  return {
    sample(magnitudeG: number, t: number): boolean {
      if (magnitudeG < thresholdG) return false;
      if (t - last < cooldownMs) return false;
      last = t;
      opts.onShake();
      return true;
    },
  };
}

/** 把 DeviceMotion 的 m/s² 转成 g */
export function motionMagnitudeG(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z) / 9.80665;
}
