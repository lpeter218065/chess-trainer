import { useState } from 'react';
import { appDebugLog } from './log';
import { useT } from '../i18n';

/**
 * 调试日志面板。由 `DebugOverlay` 懒加载（`React.lazy`），首次呼出前不进主 bundle。
 * 自己读日志缓冲、自己管「已复制」状态，对外只需要一个 `onClose`。
 */
export default function DebugOverlayPanel({ onClose }: { onClose(): void }) {
  const t = useT();
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
          {t('debug.title')}
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => { appDebugLog.clear(); }}>
          {t('debug.clear')}
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
          {copied ? t('debug.copied') : t('debug.copy')}
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>
          {t('debug.close')}
        </button>
      </div>
      <p className="mb-2 shrink-0 text-[11px] text-felt-fg/70">
        {t('debug.hint')}
      </p>
      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed">
        {entries.length === 0
          ? t('debug.empty')
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
