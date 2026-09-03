import { StreamText } from './StreamText';

interface Props { disabled: boolean; hintText: string; streaming: boolean; onHint(level: 1 | 2): void }

export function HintButton({ disabled, hintText, streaming, onHint }: Props) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40" disabled={disabled} onClick={() => onHint(1)}>提示思路</button>
        <button className="rounded border border-blue-600 px-3 py-1 text-sm text-blue-700 disabled:opacity-40" disabled={disabled} onClick={() => onHint(2)}>显示着法</button>
      </div>
      {(hintText || streaming) && <div className="mt-2"><StreamText text={hintText} streaming={streaming} /></div>}
    </div>
  );
}
