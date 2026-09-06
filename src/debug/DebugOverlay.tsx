import { lazy, Suspense, useEffect, useState } from 'react';
import { appDebugLog } from './log';
import { createShakeDetector, motionMagnitudeG } from './shake';
import { isNative } from '../platform';
import { useSettings } from '../store/settings';

const Panel = lazy(() => import('./DebugOverlayPanel'));

export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const gestures = useSettings((s) => s.debugGesturesEnabled);

  useEffect(() => appDebugLog.subscribe(() => setTick((n) => n + 1)), []);

  // 设置页「查看日志」按钮：始终有效，与手势开关无关
  useEffect(() => {
    const onDebug = (e: Event) => {
      const openTo = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setOpen(openTo ?? true);
    };
    window.addEventListener('chess-debug', onDebug);
    return () => window.removeEventListener('chess-debug', onDebug);
  }, []);

  // 摇一摇 / 三指：只在设置开关打开时挂监听，关掉时全部卸载
  useEffect(() => {
    if (!gestures) return;
    const toggle = () => setOpen((v) => !v);
    const onShake = () => toggle();
    window.addEventListener('chess-shake', onShake);

    const detector = createShakeDetector({ onShake: toggle });
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      detector.sample(motionMagnitudeG(a.x, a.y, a.z), performance.now());
    };
    // iOS 真机由 AppDelegate 发 chess-shake，避免和 JS 加速度各触发一次导致闪开关
    if (!isNative()) window.addEventListener('devicemotion', onMotion);

    let threeFingerLock = false;
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length < 3 || threeFingerLock) return;
      threeFingerLock = true;
      toggle();
    };
    const onTouchEnd = () => {
      threeFingerLock = false;
    };
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('chess-shake', onShake);
      if (!isNative()) window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [gestures]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Panel onClose={() => setOpen(false)} />
    </Suspense>
  );
}
