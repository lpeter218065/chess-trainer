import type { Round } from '../store/session';
import { QUALITY_LABEL, type Quality } from '../chess/quality';
import { ANGLE_LABEL } from '../llm/angles';
import { StreamText } from './StreamText';

const QUALITY_CLASS: Record<Quality, string> = {
  best: 'bg-emerald-600', good: 'bg-green-500', inaccuracy: 'bg-yellow-500', mistake: 'bg-orange-500', blunder: 'bg-red-600',
};

interface Props { intro: string; rounds: Round[]; streaming: string | null; llmError: string | null }

export function CommentaryPanel({ intro, rounds, streaming, llmError }: Props) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      <section className="rounded-lg border border-neutral-200 p-3">
        <h3 className="mb-1 text-xs font-semibold text-neutral-500">开场</h3>
        <StreamText text={intro} streaming={streaming === 'intro'} placeholder="正在生成开场讲解…" />
      </section>
      {rounds.map((r) => (
        <section key={r.index} className="rounded-lg border border-neutral-200 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="font-mono">{r.index + 1}. {r.userMove.san}{r.engineMove ? ` ${r.engineMove.san}` : ''}</span>
            <span className={`rounded px-1.5 py-0.5 text-white ${QUALITY_CLASS[r.userMove.quality]}`}>{QUALITY_LABEL[r.userMove.quality]}</span>
            <span className="text-neutral-400">{ANGLE_LABEL[r.angle]}</span>
          </div>
          <StreamText text={r.commentary} streaming={streaming === 'commentary' && r.index === rounds.length - 1} placeholder="讲解生成中…" />
        </section>
      ))}
      {llmError && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{llmError}</p>}
    </div>
  );
}
