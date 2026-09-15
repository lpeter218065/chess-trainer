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
import { useT } from '../i18n';

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
  const t = useT();
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
        aria-label={t('analyses.deleteAria', { label })}
        onClick={onDelete}
      >
        {t('session.delete')}
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
  const t = useT();
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
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[aria-haspopup="menu"]')) return;
      setMenuId(null);
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
    if (!window.confirm(t('analyses.deleteConfirm', { title: m.title }))) return;
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
      role="tab"
      aria-selected={kind === id}
      className={`analyses-filter-btn ${kind === id ? 'is-active' : ''}`}
      onClick={() => setKind(id)}
    >
      {label}
    </button>
  );

  const hasAnySessions = Object.keys(metasMap).length > 0;

  return (
    <div className="page-shell mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="mb-6">
        <NavBack to="/">{t('nav.home')}</NavBack>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title text-2xl">{t('analyses.title')}</h1>
          {hasAnySessions && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary text-sm" onClick={startNew}>
                {t('analyses.newExplore')}
              </button>
              <Link to="/explore" state={{ from: 'analyses' }} className="btn text-sm">
                {t('home.explore')}
              </Link>
            </div>
          )}
        </div>
      </header>

      {!hasAnySessions ? (
        <div className="flex w-full min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-line/80 bg-ivory/60 px-6 py-16 text-center shadow-xs">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-walnut shadow-xs">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M3 9h18M9 21V9M15 21V9" />
            </svg>
          </div>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted">
            {t('analyses.empty')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-primary" onClick={startNew}>
              {t('analyses.newExplore')}
            </button>
            <Link to="/" className="btn">
              {t('nav.home')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="analyses-q" className="sr-only">{t('analyses.search')}</label>
              <input
                id="analyses-q"
                className="field min-w-0 pr-8"
                placeholder={t('analyses.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink px-1 text-base leading-none"
                  aria-label={t('analyses.clearSearch')}
                  onClick={() => setQuery('')}
                >
                  ×
                </button>
              )}
            </div>
            <div className="analyses-filter-group shrink-0 self-start sm:self-auto" role="tablist" aria-label={t('analyses.title')}>
              {filterBtn('all', t('analyses.all'))}
              {filterBtn('explore', t('analyses.explore'))}
              {filterBtn('lesson', t('analyses.lesson'))}
            </div>
          </div>

          <p className="mb-3 text-xs text-muted">
            {t('analyses.count', { n: items.length })}{query.trim() || kind !== 'all' ? t('analyses.filtered') : ''}
          </p>

          {items.length === 0 ? (
            <div className="flex w-full min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-line px-4 py-12 text-center">
              <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted">{t('analyses.noMatch')}</p>
              <button
                type="button"
                className="btn btn-sm mt-4 text-xs"
                onClick={() => { setQuery(''); setKind('all'); }}
              >
                {t('analyses.all')}
              </button>
            </div>
          ) : (
            <ul className="rounded-2xl border border-line bg-ivory shadow-xs">
              {items.map((m) => {
                const active = m.id === currentId;
                const summary = m.summary ?? (m.kind === 'explore' ? t('analyses.emptyExplore') : t('analyses.lessonPractice'));
                return (
                  <li
                    key={m.id}
                    className={`relative border-b border-line first:rounded-t-2xl last:border-b-0 last:rounded-b-2xl overflow-hidden ${
                      active ? 'bg-cream' : ''
                    }`}
                  >
                    <SwipeRow label={m.title} onDelete={() => confirmDelete(m)}>
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          className="min-w-0 flex-1 px-4 py-3 text-left transition hover:opacity-90"
                          onClick={() => openSession(m)}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`badge shrink-0 ${
                                m.kind === 'explore' ? 'badge-walnut' : 'badge-brass'
                              }`}
                            >
                              {m.kind === 'explore' ? t('analyses.explore') : t('analyses.lesson')}
                            </span>
                            <span className="truncate font-semibold text-ink">{m.title}</span>
                            {active && <span className="shrink-0 text-[11px] font-medium text-walnut">{t('session.current')}</span>}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {summary}
                            <span className="mx-1.5 text-line">·</span>
                            {formatSessionTime(m.updatedAt)}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center pr-1">
                          <button
                            type="button"
                            className="btn btn-ghost min-h-11 min-w-11 px-0 text-muted"
                            aria-label={t('analyses.more', { title: m.title })}
                            aria-haspopup="menu"
                            aria-expanded={menuId === m.id}
                            onClick={() => setMenuId((cur) => (cur === m.id ? null : m.id))}
                          >
                            <IconMore />
                          </button>
                        </div>
                      </div>
                    </SwipeRow>
                    {menuId === m.id && (
                      <div
                        ref={menuRef}
                        className="menu absolute right-2 top-11 z-30 w-32 py-1 shadow-lg"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex min-h-11 w-full items-center px-3 text-left text-sm text-danger hover:bg-danger/10 transition-colors"
                          onClick={() => confirmDelete(m)}
                        >
                          {t('session.delete')}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
