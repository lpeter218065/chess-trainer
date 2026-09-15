import { useT } from '../i18n';

export function MissingKeyEmpty({
  onConfigure,
  compact = false,
}: {
  onConfigure: () => void;
  compact?: boolean;
}) {
  const t = useT();
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 pb-2">
        <p className="min-w-0 flex-1 text-xs text-muted">{t('missing.compact')}</p>
        <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={onConfigure}>
          {t('missing.configure')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm leading-relaxed text-muted">
        {t('missing.body')}
      </p>
      <button type="button" className="btn btn-primary" onClick={onConfigure}>
        {t('missing.configure')}
      </button>
    </div>
  );
}
