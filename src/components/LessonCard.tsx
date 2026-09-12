import { Link } from 'react-router-dom';
import type { Lesson } from '../lessons/schema';
import type { ProgressRecord } from '../store/progress';

export function LessonCard({ lesson, record }: { lesson: Lesson; record?: ProgressRecord }) {
  return (
    <Link
      to={`/lesson/${encodeURIComponent(lesson.id)}`}
      state={{ from: 'home' }}
      className="card-link p-3.5"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug text-ink">{lesson.title}</h3>
        {record?.completed && (
          <span className={`badge shrink-0 ${record.clean ? 'badge-baize' : 'badge-brass'}`}>
            {record.clean ? '干净完成' : '已完成'}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{lesson.summary}</p>
      <p className="mt-2 text-xs text-muted/80">执{lesson.playerColor === 'w' ? '白' : '黑'} · {record ? `已练 ${record.attempts} 次` : '未开始'}</p>
    </Link>
  );
}
