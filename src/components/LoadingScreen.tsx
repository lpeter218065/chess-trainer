export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-paper p-6">
      <p className="font-display text-xl font-semibold tracking-tight text-ink">国际象棋训练</p>
      <p className="text-sm text-muted" role="status">{message}</p>
    </div>
  );
}
