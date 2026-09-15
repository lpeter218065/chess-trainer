import { Link } from 'react-router-dom';
import type { Lesson } from '../lessons/schema';
import type { ProgressRecord } from '../store/progress';
import { CardChevron } from './layout/CardChevron';
import { useT } from '../i18n';

export function LessonCard({ lesson, record }: { lesson: Lesson; record?: ProgressRecord }) {
  const t = useT();
  const side = lesson.playerColor === 'w' ? t('home.playWhite') : t('home.playBlack');
  const status = record ? t('home.attempts', { n: record.attempts }) : t('home.notStarted');
  return (
    <Link
      to={`/lesson/${encodeURIComponent(lesson.id)}`}
      state={{ from: 'home' }}
      className="card-link p-3.5 pr-10"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug text-ink">{lesson.title}</h3>
        {record?.completed && (
          <span className={`badge shrink-0 ${record.clean ? 'badge-baize' : 'badge-brass'}`}>
            {record.clean ? t('home.cleanDone') : t('home.done')}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{lesson.summary}</p>
      <p className="mt-2 text-xs text-muted">{t('home.sideAttempts', { side, status })}</p>
      <CardChevron />
    </Link>
  );
}
