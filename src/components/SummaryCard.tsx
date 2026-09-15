import { StreamText } from './StreamText';
import { useT } from '../i18n';

interface Props { outcome: 'success' | 'fail'; reason: string; summary: string; streaming: boolean; onRestart(): void; onBack(): void }

export function SummaryCard({ outcome, reason, summary, streaming, onRestart, onBack }: Props) {
  const ok = outcome === 'success';
  const t = useT();
  return (
    <div className={`rounded-xl border p-4 ${ok ? 'border-baize/35 bg-baize-fg' : 'border-brass/35 bg-cream'}`}>
      <h3 className="font-display text-base font-semibold text-ink">{ok ? t('summary.ok') : t('summary.fail')}</h3>
      <p className="mb-2 text-sm text-muted">{reason}</p>
      <StreamText text={summary} streaming={streaming} placeholder={t('summary.writing')} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onRestart}>{t('summary.again')}</button>
        <button type="button" className="btn" onClick={onBack}>{t('summary.back')}</button>
      </div>
    </div>
  );
}
