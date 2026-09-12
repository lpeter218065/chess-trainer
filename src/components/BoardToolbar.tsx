import { useEffect, useRef, useState, type ReactNode } from 'react';

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
      {error ? <p role="alert" className="text-danger">{error}</p> : <p role="status">{children}</p>}
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

export function BoardMoreMenu({ items }: { items: BoardMoreItem[] }) {
  const visible = items.filter((item) => !item.hidden);
  const [open, setOpen] = useState(false);
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

  if (visible.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`btn btn-sm ${open ? 'btn-on' : ''}`}
        aria-label="更多"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore />
        更多
      </button>
      {open && (
        <div className="menu absolute right-0 bottom-full z-20 mb-1.5 min-w-44 py-1" role="menu">
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
              <span>{item.label}{item.pressed ? ' · 开' : ''}</span>
              {item.disabled && item.reason && (
                <span className="text-[11px] font-normal text-muted">{item.reason}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
