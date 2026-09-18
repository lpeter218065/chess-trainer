import { useMemo, useState, type ReactNode } from 'react';
import { useGameSessions, formatSessionTime, resolveCurrentSessionId, type SessionKind, type SessionMeta } from '../store/gameSessions';
import { Sheet } from './Sheet';
import { useT } from '../i18n';

function listForKind(metas: Record<string, SessionMeta>, kind: SessionKind): SessionMeta[] {
  return Object.values(metas)
    .filter((m) => m.kind === kind)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function activeIdFor(
  kind: SessionKind,
  s: { activeExploreId: string | null; activeLessonId: string | null; activeReviewId: string | null },
): string | null {
  if (kind === 'explore') return s.activeExploreId;
  if (kind === 'lesson') return s.activeLessonId;
  return s.activeReviewId;
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
  const t = useT();
  const metasMap = useGameSessions((s) => s.metas);
  const activeId = useGameSessions((s) => activeIdFor(kind, s));
  const currentId = useGameSessions(resolveCurrentSessionId);
  const rename = useGameSessions((s) => s.rename);
  const deleteSession = useGameSessions((s) => s.deleteSession);

  const metas = useMemo(() => listForKind(metasMap, kind), [metasMap, kind]);
  const active = useMemo(() => metas.find((m) => m.id === activeId) ?? null, [metas, activeId]);

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const newLabel = kind === 'explore'
    ? t('session.startPosition')
    : kind === 'review'
      ? t('review.new')
      : t('session.restart');

  return (
    <div>
      {metas.length === 0 && (
        <p className="px-1 py-3 text-sm text-muted">{t('session.empty')}</p>
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
                {m.id === currentId && <span className="shrink-0 text-[11px] text-walnut">{t('session.current')}</span>}
              </span>
              <span className="text-xs text-muted">{formatSessionTime(m.updatedAt)}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost min-h-11 min-w-11 px-0 text-muted"
              aria-label={t('session.renameAria', { title: m.title })}
              title={t('session.rename')}
              onClick={() => {
                const next = window.prompt(t('session.renamePrompt'), m.title);
                if (next) rename(m.id, next);
              }}
            >
              <IconPencil />
            </button>
            <button
              type="button"
              className="btn btn-ghost min-h-11 min-w-11 px-0 text-muted hover:text-danger"
              aria-label={t('session.deleteAria', { title: m.title })}
              title={t('session.delete')}
              onClick={() => {
                if (!window.confirm(t('session.deleteConfirm', { title: m.title }))) return;
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
            setTitleDraft(t('session.copy', { title: active?.title ?? t('session.sheet') }));
            setSaveAsOpen(true);
          }}
        >
          {t('session.saveAs')}
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
            <h3 id="save-as-title" className="page-title mb-3 text-xl">{t('session.saveAsTitle')}</h3>
            <label htmlFor="save-as-title-input" className="mb-1.5 block text-sm font-medium text-ink">{t('session.name')}</label>
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
              <button type="button" className="btn" onClick={() => setSaveAsOpen(false)}>{t('session.cancel')}</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onSaveAs(titleDraft);
                  setSaveAsOpen(false);
                }}
              >
                {t('session.save')}
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
  const activeId = useGameSessions((s) => activeIdFor(kind, s));
  const metas = useMemo(() => listForKind(metasMap, kind), [metasMap, kind]);
  const active = useMemo(() => metas.find((m) => m.id === activeId) ?? null, [metas, activeId]);
  const t = useT();

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
    <Sheet open={open} onClose={() => setOpen(false)} title={t('session.sheet')} titleId="session-sheet-title">
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
          aria-label={t('session.sheet')}
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
        title={active?.title ?? t('session.sheet')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 truncate">{active?.title ?? t('session.sheet')}</span>
        <IconChevron />
      </button>
      {sheet}
    </div>
  );
}


