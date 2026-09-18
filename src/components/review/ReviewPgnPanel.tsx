import { useState } from 'react';
import { useT } from '../../i18n';

export function ReviewPgnPanel({ pgn }: { pgn: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (!pgn.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pgn);
    } catch {
      const el = document.getElementById('review-annotated-pgn');
      if (el instanceof HTMLTextAreaElement) {
        el.focus();
        el.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <details className="review-pgn-panel no-print">
      <summary className="review-pgn-head">
        <div>
          <h2>{t('review.pgnUpdated')}</h2>
          <p>{t('review.pgnUpdatedHint')}</p>
        </div>
        <span className="review-pgn-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => {
              e.preventDefault();
              void copy();
            }}
          >
            {copied ? t('review.copied') : t('review.copyPgn')}
          </button>
        </span>
      </summary>
      <textarea
        id="review-annotated-pgn"
        className="field review-pgn-field selectable-text"
        readOnly
        value={pgn}
        rows={8}
        aria-label={t('review.pgnUpdated')}
      />
    </details>
  );
}
