import type { ExploreSnapshot, LessonSnapshot } from './gameSessions';

/** 探索会话的一行摘要，保存快照时算好写进 meta，列表页无需加载快照 */
export function exploreSummary(snap: ExploreSnapshot | null | undefined): string {
  if (!snap) return '空分析';
  const n = snap.path.length;
  if (n === 0) return '起始局面';
  const comments = Object.keys(snap.commentaries ?? {}).length;
  const bits = [`${n} 手`];
  if (comments > 0) bits.push(`${comments} 条讲解`);
  return bits.join(' · ');
}

/** 课程 / 开局练习会话的一行摘要 */
export function lessonSummary(snap: LessonSnapshot | null | undefined): string {
  if (!snap) return '课程练习';
  const rounds = snap.rounds.length;
  if (rounds === 0) return snap.intro ? '已开局' : '未开始';
  return `${rounds} 回合${snap.phase === 'finished' ? ' · 已结束' : ''}`;
}
