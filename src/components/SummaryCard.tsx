import { StreamText } from './StreamText';

interface Props { outcome: 'success' | 'fail'; reason: string; summary: string; streaming: boolean; onRestart(): void; onBack(): void }

export function SummaryCard({ outcome, reason, summary, streaming, onRestart, onBack }: Props) {
  const ok = outcome === 'success';
  return (
    <div className={`rounded-xl border p-4 ${ok ? 'border-felt/30 bg-felt-fg/70' : 'border-wood/30 bg-cream/50'}`}>
      <h3 className="font-display text-base font-semibold text-ink">{ok ? '完成训练目标' : '未达成目标'}</h3>
      <p className="mb-2 text-sm text-muted">{reason}</p>
      <StreamText text={summary} streaming={streaming} placeholder="正在生成总结…" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onRestart}>再来一次</button>
        <button type="button" className="btn" onClick={onBack}>返回课程列表</button>
      </div>
    </div>
  );
}
