import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameSessions, formatSessionTime, type SessionKind, type SessionMeta } from '../store/gameSessions';

function listForKind(metas: Record<string, SessionMeta>, kind: SessionKind): SessionMeta[] {
  return Object.values(metas)
    .filter((m) => m.kind === kind)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function IconPencil() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M11.2 2.1a1.4 1.4 0 0 1 2 2L5.7 11.6 2.8 12.5l.9-2.9 8.5-7.5Zm.7 3.4-1.4-1.4-7.4 6.6-.4 1.4 1.4-.4 7.8-6.2Z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M4.2 3.1 8 6.9l3.8-3.8 1.1 1.1L9.1 8l3.8 3.8-1.1 1.1L8 9.1l-3.8 3.8-1.1-1.1L6.9 8 3.1 4.2l1.1-1.1Z" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true">
      <path fill="currentColor" d="M4.2 6.2 8 10l3.8-3.8 1.1 1.1L8 12.2 3.1 7.3l1.1-1.1Z" />
    </svg>
  );
}

export function SessionBar({
  kind,
  onSwitch,
  onNew,
  onSaveAs,
}: {
  kind: SessionKind;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onSaveAs: (title: string) => void;
}) {
  const metasMap = useGameSessions((s) => s.metas);
  const activeId = useGameSessions((s) => (kind === 'explore' ? s.activeExploreId : s.activeLessonId));
  const rename = useGameSessions((s) => s.rename);
  const deleteSession = useGameSessions((s) => s.deleteSession);

  const metas = useMemo(() => listForKind(metasMap, kind), [metasMap, kind]);
  const active = useMemo(() => metas.find((m) => m.id === activeId) ?? null, [metas, activeId]);

  const [open, setOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const newLabel = kind === 'explore' ? '起始局面' : '重开本局';

  return (
    <div ref={rootRef} className="relative flex items-center text-xs">
      <button
        type="button"
        className="btn max-w-[14rem] gap-1 truncate text-left text-xs"
        title={active?.title ?? '会话'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{active?.title ?? '会话'}</span>
        <IconChevron />
      </button>

      {open && (
        <div className="menu absolute right-0 top-full z-20 mt-1.5 max-h-80 w-72 py-1" role="menu">
          {metas.length === 0 && <p className="px-3 py-3 text-muted">暂无会话</p>}
          {metas.map((m) => (
            <div key={m.id} className={`flex items-center gap-1 px-1.5 py-0.5 ${m.id === activeId ? 'bg-felt-fg' : ''}`}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === activeId}
                className="min-h-11 min-w-0 flex-1 truncate rounded-md px-2 text-left hover:bg-cream/50"
                onClick={() => { onSwitch(m.id); setOpen(false); }}
              >
                <span className="block truncate font-medium text-ink">{m.title}</span>
                <span className="text-[11px] text-muted">{formatSessionTime(m.updatedAt)}</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-11 min-w-11 px-0 text-muted"
                aria-label={`重命名 ${m.title}`}
                title="重命名"
                onClick={() => {
                  const t = window.prompt('重命名会话', m.title);
                  if (t) rename(m.id, t);
                }}
              >
                <IconPencil />
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-11 min-w-11 px-0 text-muted hover:text-danger"
                aria-label={`删除 ${m.title}`}
                title="删除"
                onClick={() => {
                  if (!window.confirm(`删除会话「${m.title}」？`)) return;
                  deleteSession(m.id);
                  if (m.id === activeId) {
                    const next = listForKind(useGameSessions.getState().metas, kind)[0];
                    if (next) onSwitch(next.id);
                    else onNew();
                  }
                }}
              >
                <IconClose />
              </button>
            </div>
          ))}
          <div className="mt-1 border-t border-line py-1">
            <button
              type="button"
              className="flex min-h-11 w-full items-center px-3 text-left text-sm text-ink hover:bg-cream/40"
              role="menuitem"
              onClick={() => { setOpen(false); onNew(); }}
            >
              {newLabel}
            </button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center px-3 text-left text-sm text-ink hover:bg-cream/40"
              role="menuitem"
              onClick={() => { setTitleDraft(`${active?.title ?? '会话'} 副本`); setSaveAsOpen(true); setOpen(false); }}
            >
              另存为…
            </button>
          </div>
        </div>
      )}

      {saveAsOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setSaveAsOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-paper p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-as-title"
          >
            <h3 id="save-as-title" className="font-display mb-3 text-lg font-semibold text-ink">另存为</h3>
            <label htmlFor="save-as-title-input" className="mb-1.5 block text-sm font-medium text-ink">名称</label>
            <input
              id="save-as-title-input"
              className="field mb-4"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSaveAs(titleDraft);
                  setSaveAsOpen(false);
                }
                if (e.key === 'Escape') setSaveAsOpen(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setSaveAsOpen(false)}>取消</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onSaveAs(titleDraft);
                  setSaveAsOpen(false);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
