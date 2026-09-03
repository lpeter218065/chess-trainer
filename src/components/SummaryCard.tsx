import { StreamText } from './StreamText';

interface Props { outcome: 'success' | 'fail'; reason: string; summary: string; streaming: boolean; onRestart(): void; onBack(): void }

export function SummaryCard({ outcome, reason, summary, streaming, onRestart, onBack }: Props) {
  return (
    <div className={`rounded-lg border p-4 ${outcome === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-orange-300 bg-orange-50'}`}>
      <h3 className="text-base font-semibold">{outcome === 'success' ? '完成训练目标' : '未达成目标'}</h3>
      <p className="mb-2 text-sm text-neutral-600">{reason}</p>
      <StreamText text={summary} streaming={streaming} placeholder="正在生成总结…" />
      <div className="mt-3 flex gap-2">
        <button className="rounded bg-neutral-800 px-3 py-1 text-sm text-white" onClick={onRestart}>再来一次</button>
        <button className="rounded border px-3 py-1 text-sm" onClick={onBack}>返回课程列表</button>
      </div>
    </div>
  );
}
