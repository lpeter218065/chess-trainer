import { Link } from 'react-router-dom';
import type { Lesson } from '../lessons/schema';
import type { ProgressRecord } from '../store/progress';

export function LessonCard({ lesson, record }: { lesson: Lesson; record?: ProgressRecord }) {
  return (
    <Link
      to={`/lesson/${encodeURIComponent(lesson.id)}`}
      className="block cursor-pointer rounded-xl border border-line bg-white p-3.5 transition duration-200 hover:border-felt/30 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug text-ink">{lesson.title}</h3>
        {record?.completed && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${record.clean ? 'bg-felt text-felt-fg' : 'bg-cream text-wood'}`}>
            {record.clean ? '干净完成' : '已完成'}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{lesson.summary}</p>
      <p className="mt-2 text-xs text-muted/80">执{lesson.playerColor === 'w' ? '白' : '黑'} · {record ? `已练 ${record.attempts} 次` : '未开始'}</p>
    </Link>
  );
}
