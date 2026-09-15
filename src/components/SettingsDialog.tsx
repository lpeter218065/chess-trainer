import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { SettingsFields } from './SettingsFields';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-x-hidden overflow-y-auto overscroll-contain bg-ink/40 backdrop-blur-xs p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto px-5 pt-3 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))] sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="sheet-handle sm:hidden" />
        <h2 id="settings-title" className="page-title mb-4 text-xl">{t('settings.title')}</h2>
        <p className="mb-4 text-sm">
          <Link to="/settings" className="text-walnut underline-offset-4 hover:underline" onClick={onClose}>
            {t('settings.pieces')}
          </Link>
        </p>
        <SettingsFields onClose={onClose} />
      </div>
    </div>
  );
}
