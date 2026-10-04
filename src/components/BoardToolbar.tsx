import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

export function ToolToggle({
  pressed,
  disabled,
  title,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn btn-sm ${pressed ? 'btn-on' : 'text-muted'}`}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function BoardToolbar({ children }: { children: ReactNode }) {
  return <div className="board-toolbar relative flex items-center gap-1.5">{children}</div>;
}

export function BoardStatus({ children, error }: { children: ReactNode; error?: string | null }) {
  return (
    <div className="board-status max-h-20 min-w-0 overflow-y-auto">
      {error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" aria-live="polite">{children}</p>}
    </div>
  );
}

export interface BoardMoreItem {
  id: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Shown when disabled; also used as title. */
  reason?: string;
  hidden?: boolean;
  onClick: () => void;
}

function IconMore() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.35" fill="currentColor" />
      <circle cx="8" cy="8" r="1.35" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.35" fill="currentColor" />
    </svg>
  );
}

/** Gap between the trigger button and the menu, matching the old `mb-1.5`. */
const MENU_GAP = 6;
/** Assumed menu height before the first measurement. */
const MENU_FALLBACK_HEIGHT = 200;

export function BoardMoreMenu({ items }: { items: BoardMoreItem[] }) {
  const visible = items.filter((item) => !item.hidden);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The toolbar scrolls horizontally on narrow layouts, which clips anything absolutely
  // positioned inside it, so the menu lives in a portal and is pinned to the button.
  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || MENU_FALLBACK_HEIGHT;
    const right = window.innerWidth - rect.right;
    setMenuStyle(
      rect.top < menuHeight + MENU_GAP
        ? { position: 'fixed', right, top: rect.bottom + MENU_GAP }
        : { position: 'fixed', right, bottom: window.innerHeight - rect.top + MENU_GAP },
    );
  }, []);

  // Measure after the menu mounts (hidden) and before paint, so it never flashes in the wrong spot.
  useLayoutEffect(() => {
    if (open) place();
    else setMenuStyle(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  const t = useT();
  if (visible.length === 0) return null;

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-sm ${open ? 'btn-on' : ''}`}
        aria-label={t('trainer.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore />
        {t('trainer.more')}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="menu z-40 min-w-44 py-1"
            role="menu"
            style={menuStyle ?? { position: 'fixed', visibility: 'hidden' }}
          >
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`flex min-h-11 w-full flex-col items-start justify-center px-3 py-1.5 text-left text-sm ${
                  item.pressed ? 'bg-cream font-medium text-ink' : 'text-ink'
                } ${item.disabled ? 'opacity-40' : ''}`}
                disabled={item.disabled}
                title={item.disabled ? item.reason : undefined}
                aria-pressed={item.pressed}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick();
                  setOpen(false);
                }}
              >
                <span>{item.label}{item.pressed ? t('trainer.on') : ''}</span>
                {item.disabled && item.reason && (
                  <span className="text-[11px] font-normal text-muted">{item.reason}</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
