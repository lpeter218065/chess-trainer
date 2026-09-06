import { useState } from 'react';
import { appDebugLog } from './log';

/**
 * 调试日志面板。由 `DebugOverlay` 懒加载（`React.lazy`），首次呼出前不进主 bundle。
 * 自己读日志缓冲、自己管「已复制」状态，对外只需要一个 `onClose`。
 */
export default function DebugOverlayPanel({ onClose }: { onClose(): void }) {
  const [copied, setCopied] = useState(false);
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
        <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="mb-2 shrink-0 text-[11px] text-felt-fg/70">
        设置里可开启摇一摇 / 三指点按开关。密钥已脱敏。
      </p>
      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed">
        {entries.length === 0
          ? '暂无日志。去设置里点「测试连接」，或生成讲解后再打开本页。'
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
