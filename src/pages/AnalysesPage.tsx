import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  formatSessionTime,
  resolveCurrentSessionId,
  useGameSessions,
  type SessionKind,
  type SessionMeta,
} from '../store/gameSessions';
import { parseDrillLessonId } from '../lessons/openingDrills';
import { NavBack } from '../components/layout/NavBack';

type KindFilter = 'all' | SessionKind;

const DELETE_REVEAL = 88;

function IconMore() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="3.5" r="1.35" fill="currentColor" />
      <circle cx="8" cy="8" r="1.35" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.35" fill="currentColor" />
    </svg>
  );
}

function SwipeRow({
  onDelete,
  label,
  children,
}: {
  onDelete: () => void;
  label: string;
  children: ReactNode;
}) {
  const startX = useRef<number | null>(null);
  const dxRef = useRef(0);
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const skipClick = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX.current = e.clientX;
    skipClick.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 8) skipClick.current = true;
    const next = open ? Math.min(0, Math.max(-DELETE_REVEAL, -DELETE_REVEAL + delta)) : Math.min(0, Math.max(-DELETE_REVEAL, delta));
    dxRef.current = next;
    setDx(next);
  };

  const onPointerUp = () => {
    if (startX.current == null) return;
    startX.current = null;
    const shouldOpen = dxRef.current < -DELETE_REVEAL / 2;
    setOpen(shouldOpen);
    dxRef.current = shouldOpen ? -DELETE_REVEAL : 0;
    setDx(dxRef.current);
  };

  return (
    <div className="swipe-row">
      <button
        type="button"
        className="swipe-row-delete"
        tabIndex={open ? 0 : -1}
        aria-label={`删除 ${label}`}
        onClick={onDelete}
      >
        删除
      </button>
      <div
        className="swipe-row-content"
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (skipClick.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function AnalysesPage() {
  const metasMap = useGameSessions((s) => s.metas);
  const currentId = useGameSessions(resolveCurrentSessionId);
  const deleteSession = useGameSessions((s) => s.deleteSession);
  const newExplore = useGameSessions((s) => s.newExplore);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

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
      navigate(`/explore?session=${encodeURIComponent(m.id)}`, { state: { from: 'analyses' } });
      return;
    }
    if (m.lessonId) {
      const drill = parseDrillLessonId(m.lessonId);
      if (drill) {
        navigate(`/drill/${encodeURIComponent(drill.drillId)}?session=${encodeURIComponent(m.id)}`, {
          state: { from: 'analyses' },
        });
        return;
      }
      navigate(`/lesson/${encodeURIComponent(m.lessonId)}?session=${encodeURIComponent(m.id)}`, {
        state: { from: 'analyses' },
      });
    }
  };

  const confirmDelete = (m: SessionMeta) => {
    if (!window.confirm(`删除「${m.title}」？此操作不可恢复。`)) return;
    deleteSession(m.id);
    setMenuId(null);
  };

  const startNew = () => {
    const id = newExplore();
    navigate(`/explore?session=${encodeURIComponent(id)}`, { state: { from: 'analyses' } });
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
    <div className="page-shell mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="mb-6">
        <NavBack to="/">首页</NavBack>
        <h1 className="page-title mt-1 text-2xl">我的分析</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary text-sm" onClick={startNew}>
            新建探索
          </button>
          <Link to="/explore" state={{ from: 'analyses' }} className="btn text-sm">自由探索</Link>
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
        <div className="flex w-full min-w-0 flex-col items-center rounded-xl border border-dashed border-line px-4 py-10 text-center">
          {Object.keys(metasMap).length === 0 ? (
            <>
              <p className="w-full text-sm text-muted">还没有保存的分析。从起始局面开一局即可。</p>
              <div className="mt-4 flex w-full justify-center">
                <button type="button" className="btn btn-primary" onClick={startNew}>新建探索</button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">没有匹配的结果，试试改搜索词或筛选。</p>
          )}
        </div>
      ) : (
        <ul className="panel overflow-hidden">
          {items.map((m) => {
            const active = m.id === currentId;
            const summary = m.summary ?? (m.kind === 'explore' ? '空分析' : '课程练习');
            return (
              <li key={m.id} className={`relative border-b border-line last:border-b-0 ${active ? 'bg-cream' : ''}`}>
                <SwipeRow label={m.title} onDelete={() => confirmDelete(m)}>
                  <div className="flex items-stretch">
                    <button type="button" className="min-w-0 flex-1 px-4 py-3 text-left hover:opacity-90" onClick={() => openSession(m)}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge shrink-0 ${
                            m.kind === 'explore' ? 'badge-walnut' : 'badge-brass'
                          }`}
                        >
                          {m.kind === 'explore' ? '探索' : '课程'}
                        </span>
                        <span className="truncate font-medium text-ink">{m.title}</span>
                        {active && <span className="shrink-0 text-[11px] text-walnut">当前</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {summary}
                        <span className="mx-1.5 text-line">·</span>
                        {formatSessionTime(m.updatedAt)}
                      </p>
                    </button>
                    <div className="relative flex shrink-0 items-center pr-1" ref={menuId === m.id ? menuRef : undefined}>
                      <button
                        type="button"
                        className="btn btn-ghost min-h-11 min-w-11 px-0 text-muted"
                        aria-label={`更多操作 ${m.title}`}
                        aria-haspopup="menu"
                        aria-expanded={menuId === m.id}
                        onClick={() => setMenuId((cur) => (cur === m.id ? null : m.id))}
                      >
                        <IconMore />
                      </button>
                      {menuId === m.id && (
                        <div className="menu absolute right-1 top-full z-20 mt-1 w-32 py-1" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className="flex min-h-11 w-full items-center px-3 text-left text-sm text-danger"
                            onClick={() => confirmDelete(m)}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </SwipeRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
