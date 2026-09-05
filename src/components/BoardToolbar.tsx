import type { ReactNode } from 'react';

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
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}
