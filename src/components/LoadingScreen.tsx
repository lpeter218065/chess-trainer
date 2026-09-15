import { AppMark } from './layout/AppMark';
import { useT } from '../i18n';

export function LoadingScreen({ message }: { message?: string }) {
  const t = useT();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-table p-6">
      <AppMark size={40} />
      <p className="page-title text-xl">{t('app.name')}</p>
      <p className="text-sm text-muted" role="status">{message ?? t('app.loading')}</p>
    </div>
  );
}
