import { useEffect, useState } from 'react';
import { appDebugLog } from './log';
import { requestDebugOverlay } from './install';
import { createShakeDetector, motionMagnitudeG } from './shake';
import { isNative } from '../platform';

export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => appDebugLog.subscribe(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const onShake = () => toggle();
    const onDebug = (e: Event) => {
      const openTo = (e as CustomEvent<{ open?: boolean }>).detail?.open;
      setOpen(openTo ?? true);
    };
    window.addEventListener('chess-shake', onShake);
    window.addEventListener('chess-debug', onDebug);

    const detector = createShakeDetector({
      onShake: toggle,
    });
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
      window.removeEventListener('chess-debug', onDebug);
      if (!isNative()) window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  if (!open) return null;
  const entries = appDebugLog.list();
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-ink/80 p-3 text-felt-fg"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="debug-title"
    >
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
        <h2 id="debug-title" className="min-w-0 flex-1 text-sm font-semibold">
          调试日志
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => { appDebugLog.clear(); }}>
          清空
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            void navigator.clipboard?.writeText(appDebugLog.format()).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              },
              () => {},
            );
          }}
        >
          {copied ? '已复制' : '复制'}
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => requestDebugOverlay(false)}>
          关闭
        </button>
      </div>
      <p className="mb-2 shrink-0 text-[11px] text-felt-fg/70">
        摇一摇或三指点按开关。密钥已脱敏。
      </p>
      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed">
        {entries.length === 0
          ? '暂无日志。去设置里点「测试连接」，或生成讲解后再摇一摇。'
          : entries
              .map((e) => {
                const ts = new Date(e.t).toISOString().slice(11, 23);
                return `${ts}  ${e.level.padEnd(5)}  ${e.source}  ${e.message}`;
              })
              .join('\n')}
      </pre>
    </div>
  );
}
