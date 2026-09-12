import { useEffect, type ReactNode } from 'react';

export function Sheet({
  open,
  onClose,
  title,
  titleId = 'sheet-title',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center overflow-x-hidden overflow-y-auto overscroll-contain bg-ink/50 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet max-h-[min(88dvh,40rem)] min-w-0 overflow-x-hidden overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        <div className="sheet-handle sm:hidden" />
        {title && (
          <h2 id={titleId} className="page-title mb-3 text-xl">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
