import { AppMark } from './layout/AppMark';

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-table p-6">
      <AppMark size={40} />
      <p className="page-title text-xl">国际象棋训练</p>
      <p className="text-sm text-muted" role="status">{message}</p>
    </div>
  );
}
