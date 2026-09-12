import { useMemo, useState, type ReactNode } from 'react';
import { useGameSessions, formatSessionTime, resolveCurrentSessionId, type SessionKind, type SessionMeta } from '../store/gameSessions';
import { Sheet } from './Sheet';

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

function IconMore() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.35" fill="currentColor" />
      <circle cx="8" cy="8" r="1.35" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.35" fill="currentColor" />
    </svg>
  );
}

export function SessionList({
  kind,
  onSwitch,
  onNew,
  onSaveAs,
  extra,
}: {
  kind: SessionKind;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onSaveAs: (title: string) => void;
  extra?: ReactNode;
}) {
  const metasMap = useGameSessions((s) => s.metas);
  const activeId = useGameSessions((s) => (kind === 'explore' ? s.activeExploreId : s.activeLessonId));
  const currentId = useGameSessions(resolveCurrentSessionId);
  const rename = useGameSessions((s) => s.rename);
  const deleteSession = useGameSessions((s) => s.deleteSession);

  const metas = useMemo(() => listForKind(metasMap, kind), [metasMap, kind]);
  const active = useMemo(() => metas.find((m) => m.id === activeId) ?? null, [metas, activeId]);

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const newLabel = kind === 'explore' ? '起始局面' : '重开本局';

  return (
    <div>
      {metas.length === 0 && (
        <p className="px-1 py-3 text-sm text-muted">还没有会话。可在下面新建。</p>
      )}
      <ul className="flex flex-col gap-0.5">
        {metas.map((m) => (
          <li key={m.id} className={`flex items-center gap-1 rounded-lg px-1 py-0.5 ${m.id === activeId ? 'bg-cream' : ''}`}>
            <button
              type="button"
              className="min-h-11 min-w-0 flex-1 truncate rounded-md px-2 text-left"
              onClick={() => onSwitch(m.id)}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 truncate font-medium text-ink">{m.title}</span>
                {m.id === currentId && <span className="shrink-0 text-[11px] text-walnut">当前</span>}
              </span>
              <span className="text-xs text-muted">{formatSessionTime(m.updatedAt)}</span>
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
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-line pt-1">
        <button
          type="button"
          className="flex min-h-11 w-full items-center px-2 text-left text-sm text-ink"
          role="menuitem"
          onClick={onNew}
        >
          {newLabel}
        </button>
        <button
          type="button"
          className="flex min-h-11 w-full items-center px-2 text-left text-sm text-ink"
          role="menuitem"
          onClick={() => {
            setTitleDraft(`${active?.title ?? '会话'} 副本`);
            setSaveAsOpen(true);
          }}
        >
          另存为…
        </button>
        {extra}
      </div>

      {saveAsOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setSaveAsOpen(false)}
          role="presentation"
        >
          <div
            className="sheet p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-as-title"
          >
            <h3 id="save-as-title" className="page-title mb-3 text-xl">另存为</h3>
            <label htmlFor="save-as-title-input" className="mb-1.5 block text-sm font-medium text-ink">名称</label>
            <input
              id="save-as-title-input"
              className="field mb-4"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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

export function SessionBar({
  kind,
  onSwitch,
  onNew,
  onSaveAs,
  trigger = 'title',
  extra,
  open: openProp,
  onOpenChange,
}: {
  kind: SessionKind;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onSaveAs: (title: string) => void;
  trigger?: 'title' | 'more' | 'none';
  extra?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const metasMap = useGameSessions((s) => s.metas);
  const activeId = useGameSessions((s) => (kind === 'explore' ? s.activeExploreId : s.activeLessonId));
  const metas = useMemo(() => listForKind(metasMap, kind), [metasMap, kind]);
  const active = useMemo(() => metas.find((m) => m.id === activeId) ?? null, [metas, activeId]);

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  };

  const closeAnd = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const sheet = (
    <Sheet open={open} onClose={() => setOpen(false)} title="会话" titleId="session-sheet-title">
      <SessionList
        kind={kind}
        onSwitch={(id) => closeAnd(() => onSwitch(id))}
        onNew={() => closeAnd(onNew)}
        onSaveAs={(title) => {
          onSaveAs(title);
          setOpen(false);
        }}
        extra={extra}
      />
    </Sheet>
  );

  if (trigger === 'none') {
    return sheet;
  }

  if (trigger === 'more') {
    return (
      <div className="relative flex items-center">
        <button
          type="button"
          className="btn btn-sm btn-ghost min-h-11 min-w-11 px-0"
          aria-label="会话"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <IconMore />
        </button>
        {sheet}
      </div>
    );
  }

  return (
    <div className="relative flex items-center text-sm">
      <button
        type="button"
        className="session-trigger btn max-w-[9.5rem] gap-1 truncate text-left text-sm"
        title={active?.title ?? '会话'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 truncate">{active?.title ?? '会话'}</span>
        <IconChevron />
      </button>
      {sheet}
    </div>
  );
}


