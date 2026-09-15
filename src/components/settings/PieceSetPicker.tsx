import { defaultPieces } from 'react-chessboard';
import { PIECE_SET_IDS, piecesForSet, type PieceSetId } from '../../chess/pieceSet';
import { START_FEN } from '../../chess/pgn';
import { useT, type ChromeKey } from '../../i18n';
import { MiniBoard } from '../MiniBoard';

const LABELS: Record<PieceSetId, { name: ChromeKey; hint: ChromeKey }> = {
  classic: { name: 'settings.piece.classic', hint: 'settings.piece.classicHint' },
  walnut: { name: 'settings.piece.walnut', hint: 'settings.piece.walnutHint' },
  letter: { name: 'settings.piece.letter', hint: 'settings.piece.letterHint' },
  spatial: { name: 'settings.piece.spatial', hint: 'settings.piece.spatialHint' },
  fantasy: { name: 'settings.piece.fantasy', hint: 'settings.piece.fantasyHint' },
  shapes: { name: 'settings.piece.shapes', hint: 'settings.piece.shapesHint' },
};

const PREVIEW_KEYS = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP'] as const;

function PieceGlyphs({ id }: { id: PieceSetId }) {
  const pieces = piecesForSet(id) ?? defaultPieces;
  return (
    <div className="piece-set-glyphs" aria-hidden="true">
      {PREVIEW_KEYS.map((key) => {
        const render = pieces?.[key];
        return (
          <span key={key} className="piece-set-glyph">
            {render ? render({ svgStyle: { width: '100%', height: '100%' } }) : null}
          </span>
        );
      })}
    </div>
  );
}

export function PieceSetPicker({
  value,
  onChange,
}: {
  value: PieceSetId;
  onChange(id: PieceSetId): void;
}) {
  const t = useT();
  return (
    <section className="mt-8">
      <header className="home-section-head">
        <h2>{t('settings.pieces')}</h2>
        <p>{t('settings.piecesHint')}</p>
      </header>
      <div className="piece-set-grid mt-3" role="group" aria-label={t('settings.pieces')}>
        {PIECE_SET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="piece-set-card"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <p className="font-medium text-ink">{t(LABELS[id].name)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(LABELS[id].hint)}</p>
            <PieceGlyphs id={id} />
          </button>
        ))}
      </div>
      <div className="piece-set-preview mt-6 rounded-2xl border border-line/80 bg-ivory/60 p-4 shadow-xs">
        <p className="mb-3 text-xs font-semibold tracking-wide text-walnut">{t('settings.piecePreview')}</p>
        <div className="mx-auto flex w-full max-w-56 items-center justify-center">
          <MiniBoard
            fen={START_FEN}
            orientation="white"
            lastMove={{ from: 'e2', to: 'e4' }}
            boardId="settings-piece-preview"
            className="aspect-square w-full"
          />
        </div>
      </div>
    </section>
  );
}
