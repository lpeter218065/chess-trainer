export function StreamText({ text, streaming, placeholder }: { text: string; streaming: boolean; placeholder?: string }) {
  if (!text && !streaming) return <p className="text-sm text-neutral-400">{placeholder ?? ''}</p>;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text}
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-neutral-500 align-middle" />}
    </p>
  );
}
