import { Link } from 'react-router-dom';
import type { Lesson } from '../lessons/schema';
import type { ProgressRecord } from '../store/progress';

export function LessonCard({ lesson, record }: { lesson: Lesson; record?: ProgressRecord }) {
  return (
    <Link to={`/lesson/${encodeURIComponent(lesson.id)}`} className="block rounded-lg border border-neutral-200 p-3 hover:border-neutral-400">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{lesson.title}</h3>
        {record?.completed && <span className={`shrink-0 rounded px-1.5 text-xs text-white ${record.clean ? 'bg-emerald-600' : 'bg-blue-500'}`}>{record.clean ? '干净完成' : '已完成'}</span>}
      </div>
      <p className="mt-1 text-sm text-neutral-600">{lesson.summary}</p>
      <p className="mt-1 text-xs text-neutral-400">执{lesson.playerColor === 'w' ? '白' : '黑'} · {record ? `已练 ${record.attempts} 次` : '未开始'}</p>
    </Link>
  );
}
