type LineKind = 'summary' | 'bullet' | 'next';

function classifyLine(line: string): { kind: LineKind; text: string } {
  const t = line.trim();
  if (t.startsWith('•')) return { kind: 'bullet', text: t.slice(1).trim() };
  if (t.startsWith('- ')) return { kind: 'bullet', text: t.slice(2).trim() };
  if (t.startsWith('→')) return { kind: 'next', text: t.slice(1).trim() };
  return { kind: 'summary', text: t };
}

function hasStructuredLines(text: string): boolean {
  return text.split('\n').some((l) => {
    const t = l.trim();
    return t.startsWith('•') || t.startsWith('- ') || t.startsWith('→');
  });
}

function StructuredText({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split('\n').map(classifyLine).filter((l) => l.text);
  const summary = lines.filter((l) => l.kind === 'summary').map((l) => l.text);
  const bullets = lines.filter((l) => l.kind === 'bullet');
  const next = lines.filter((l) => l.kind === 'next');

  return (
    <div className="text-sm leading-relaxed">
      {summary.length > 0 && <p className="mb-2 font-medium">{summary.join(' ')}</p>}
      {bullets.length > 0 && (
        <ul className="mb-2 list-none space-y-1 pl-0">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-wood">•</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      )}
      {next.length > 0 && (
        <p className="text-muted">
          <span className="mr-1 text-felt">→</span>
          {next.map((n) => n.text).join(' ')}
        </p>
      )}
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-felt align-middle" />}
    </div>
  );
}

export function StreamText({ text, streaming, placeholder }: { text: string; streaming: boolean; placeholder?: string }) {
  if (!text && !streaming) return <p className="text-sm text-muted">{placeholder ?? ''}</p>;
  if (hasStructuredLines(text)) return <StructuredText text={text} streaming={streaming} />;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text}
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-felt align-middle" />}
    </p>
  );
}
