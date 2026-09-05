import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  formatSessionTime,
  useGameSessions,
  type ExploreSnapshot,
  type LessonSnapshot,
  type SessionKind,
  type SessionMeta,
} from '../store/gameSessions';

type KindFilter = 'all' | SessionKind;

function exploreSummary(snap: ExploreSnapshot | null | undefined): string {
  if (!snap) return '空分析';
  const n = snap.path.length;
  if (n === 0) return '起始局面';
  const comments = Object.keys(snap.commentaries ?? {}).length;
  const bits = [`${n} 手`];
  if (comments > 0) bits.push(`${comments} 条讲解`);
  return bits.join(' · ');
}

function lessonSummary(snap: LessonSnapshot | null | undefined): string {
  if (!snap) return '课程练习';
  const rounds = snap.rounds.length;
  if (rounds === 0) return snap.intro ? '已开局' : '未开始';
  return `${rounds} 回合${snap.phase === 'finished' ? ' · 已结束' : ''}`;
}

export function AnalysesPage() {
  const metasMap = useGameSessions((s) => s.metas);
  const exploreData = useGameSessions((s) => s.exploreData);
  const lessonData = useGameSessions((s) => s.lessonData);
  const activeExploreId = useGameSessions((s) => s.activeExploreId);
  const activeLessonId = useGameSessions((s) => s.activeLessonId);
  const deleteSession = useGameSessions((s) => s.deleteSession);
  const rename = useGameSessions((s) => s.rename);
  const newExplore = useGameSessions((s) => s.newExplore);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(metasMap)
      .filter((m) => (kind === 'all' ? true : m.kind === kind))
      .filter((m) => {
        if (!q) return true;
        return m.title.toLowerCase().includes(q) || (m.lessonId ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [metasMap, query, kind]);

  const openSession = (m: SessionMeta) => {
    if (m.kind === 'explore') {
      navigate(`/explore?session=${encodeURIComponent(m.id)}`);
      return;
    }
    if (m.lessonId) {
      navigate(`/lesson/${encodeURIComponent(m.lessonId)}?session=${encodeURIComponent(m.id)}`);
    }
  };

  const startRename = (m: SessionMeta) => {
    setRenamingId(m.id);
    setRenameDraft(m.title);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const t = renameDraft.trim();
    if (t) rename(renamingId, t);
    setRenamingId(null);
    setRenameDraft('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const startNew = () => {
    const id = newExplore();
    navigate(`/explore?session=${encodeURIComponent(id)}`);
  };

  const filterBtn = (id: KindFilter, label: string) => (
    <button
      key={id}
      type="button"
      className={`btn text-sm ${kind === id ? 'btn-primary' : 'text-muted'}`}
      aria-pressed={kind === id}
      onClick={() => setKind(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex min-h-11 items-center text-sm text-felt underline-offset-4 hover:underline">← 返回</Link>
          <h1 className="font-display text-2xl font-semibold text-ink">我的分析</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/explore" className="btn text-sm">自由探索</Link>
          <button type="button" className="btn btn-primary text-sm" onClick={startNew}>
            新建探索
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="analyses-q" className="sr-only">搜索标题</label>
        <input
          id="analyses-q"
          className="field min-w-0 flex-1"
          placeholder="搜索标题…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="flex shrink-0 gap-1.5">
          {filterBtn('all', '全部')}
          {filterBtn('explore', '探索')}
          {filterBtn('lesson', '课程')}
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">
        共 {items.length} 条{query.trim() || kind !== 'all' ? '（已筛选）' : ''}
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {Object.keys(metasMap).length === 0 ? (
            <>
              还没有保存的分析。
              <button type="button" className="ml-1 text-felt underline-offset-4 hover:underline" onClick={startNew}>新建探索</button>
            </>
          ) : (
            '没有匹配的结果，试试改搜索词或筛选。'
          )}
        </p>
      ) : (
        <ul className="panel divide-y divide-line">
          {items.map((m) => {
            const active = m.id === activeExploreId || m.id === activeLessonId;
            const summary =
              m.kind === 'explore'
                ? exploreSummary(exploreData[m.id])
                : lessonSummary(lessonData[m.id]);
            const editing = renamingId === m.id;
            return (
              <li key={m.id} className={`flex items-stretch ${active ? 'bg-felt-fg/80' : ''}`}>
                <div className="min-w-0 flex-1 px-4 py-3">
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`rename-${m.id}`} className="sr-only">重命名</label>
                      <input
                        id={`rename-${m.id}`}
                        className="field font-medium"
                        value={renameDraft}
                        autoFocus
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename();
                          }
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={commitRename}
                      />
                      <p className="text-[11px] text-muted">Enter 保存 · Esc 取消</p>
                    </div>
                  ) : (
                    <button type="button" className="w-full text-left hover:opacity-90" onClick={() => openSession(m)}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            m.kind === 'explore' ? 'bg-felt text-felt-fg' : 'bg-cream text-wood'
                          }`}
                        >
                          {m.kind === 'explore' ? '探索' : '课程'}
                        </span>
                        <span className="truncate font-medium text-ink">{m.title}</span>
                        {active && <span className="shrink-0 text-[11px] text-felt">当前</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {summary}
                        <span className="mx-1.5 text-line">·</span>
                        {formatSessionTime(m.updatedAt)}
                      </p>
                    </button>
                  )}
                </div>
                {!editing && (
                  <div className="flex shrink-0 items-center gap-0.5 pr-2">
                    <button
                      type="button"
                      className="btn btn-ghost min-h-11 text-xs text-muted"
                      title="重命名"
                      onClick={() => startRename(m)}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost min-h-11 text-xs text-muted hover:text-danger"
                      title="删除"
                      onClick={() => {
                        if (!window.confirm(`删除「${m.title}」？此操作不可恢复。`)) return;
                        if (renamingId === m.id) cancelRename();
                        deleteSession(m.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
