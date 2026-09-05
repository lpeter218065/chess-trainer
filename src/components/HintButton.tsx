import { StreamText } from './StreamText';

interface Props { disabled: boolean; hintText: string; streaming: boolean; onHint(level: 1 | 2): void }

export function HintButton({ disabled, hintText, streaming, onHint }: Props) {
  return (
    <div className="rounded-xl border border-felt/20 bg-felt-fg/50 p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm px-3" disabled={disabled} onClick={() => onHint(1)}>提示思路</button>
        <button type="button" className="btn btn-sm px-3" disabled={disabled} onClick={() => onHint(2)}>显示着法</button>
      </div>
      {(hintText || streaming) && <div className="mt-2"><StreamText text={hintText} streaming={streaming} /></div>}
    </div>
  );
}
