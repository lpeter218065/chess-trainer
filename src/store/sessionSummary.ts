import { tl } from '../i18n';
import type { ExploreSnapshot, LessonSnapshot, ReviewSnapshot } from './gameSessions';

/** 探索会话的一行摘要，保存快照时算好写进 meta，列表页无需加载快照 */
export function exploreSummary(snap: ExploreSnapshot | null | undefined): string {
  if (!snap) return tl('analyses.emptyExplore');
  const n = snap.path.length;
  if (n === 0) return tl('session.startPosition');
  const comments = Object.keys(snap.commentaries ?? {}).length;
  const bits = [tl('session.movesCount', { n })];
  if (comments > 0) bits.push(tl('session.commentsCount', { n: comments }));
  return bits.join(' · ');
}

/** 课程 / 开局练习会话的一行摘要 */
export function lessonSummary(snap: LessonSnapshot | null | undefined): string {
  if (!snap) return tl('analyses.lessonPractice');
  const rounds = snap.rounds.length;
  if (rounds === 0) return snap.intro ? tl('session.started') : tl('home.notStarted');
  const base = tl('session.roundsCount', { n: rounds });
  return snap.phase === 'finished' ? `${base} · ${tl('session.finished')}` : base;
}

export function reviewSummary(snap: ReviewSnapshot | null | undefined): string {
  if (!snap) return tl('analyses.reviewPractice');
  const n = snap.moves.length;
  const bits: string[] = [];
  const result = snap.headers.Result?.trim();
  if (result && result !== '*' && result !== '?') bits.push(result);
  if (n > 0) bits.push(tl('session.movesCount', { n }));
  else bits.push(tl('review.noMovesYet'));
  if (snap.document) bits.push(tl('review.readyShort'));
  return bits.join(' · ');
}
