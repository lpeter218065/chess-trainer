import { StreamText } from './StreamText';
import { useT } from '../i18n';

interface Props { disabled: boolean; hintText: string; streaming: boolean; onHint(level: 1 | 2): void }

export function HintButton({ disabled, hintText, streaming, onHint }: Props) {
  const t = useT();
  return (
    <div className="rounded-xl border border-line bg-cream/60 p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm px-3" disabled={disabled} onClick={() => onHint(1)}>{t('hint.idea')}</button>
        <button type="button" className="btn btn-sm px-3" disabled={disabled} onClick={() => onHint(2)}>{t('hint.move')}</button>
      </div>
      {(hintText || streaming) && <div className="mt-2"><StreamText text={hintText} streaming={streaming} /></div>}
    </div>
  );
}
