import { BOARD_THEME_IDS, squaresForTheme, type BoardThemeId } from '../../chess/boardTheme';
import { PIECE_COLOR_IDS, pieceSetUsesTint, tintForColor, type PieceColorId } from '../../chess/pieceColor';
import { useT, type ChromeKey } from '../../i18n';
import type { PieceSetId } from '../../chess/pieceSet';

const BOARD_LABEL: Record<BoardThemeId, ChromeKey> = {
  walnut: 'settings.board.walnut',
  baize: 'settings.board.baize',
  sand: 'settings.board.sand',
  ocean: 'settings.board.ocean',
  ink: 'settings.board.ink',
};

const COLOR_LABEL: Record<PieceColorId, ChromeKey> = {
  standard: 'settings.pieceColor.standard',
  walnut: 'settings.pieceColor.walnut',
  brass: 'settings.pieceColor.brass',
  contrast: 'settings.pieceColor.contrast',
};

export function LookPicker({
  boardTheme,
  pieceColor,
  pieceSet,
  onBoardTheme,
  onPieceColor,
}: {
  boardTheme: BoardThemeId;
  pieceColor: PieceColorId;
  pieceSet: PieceSetId;
  onBoardTheme(id: BoardThemeId): void;
  onPieceColor(id: PieceColorId): void;
}) {
  const t = useT();
  const tintable = pieceSetUsesTint(pieceSet);
  return (
    <section className="mt-8">
      <header className="home-section-head">
        <h2>{t('settings.board')}</h2>
        <p>{t('settings.boardHint')}</p>
      </header>
      <div className="look-swatch-row mt-3" role="group" aria-label={t('settings.board')}>
        {BOARD_THEME_IDS.map((id) => {
          const sq = squaresForTheme(id);
          return (
            <button
              key={id}
              type="button"
              className="look-swatch"
              aria-pressed={boardTheme === id}
              onClick={() => onBoardTheme(id)}
            >
              <span className="look-board" aria-hidden="true">
                <span style={{ background: sq.light }} />
                <span style={{ background: sq.dark }} />
                <span style={{ background: sq.dark }} />
                <span style={{ background: sq.light }} />
              </span>
              <span>{t(BOARD_LABEL[id])}</span>
            </button>
          );
        })}
      </div>
      <header className="home-section-head mt-6">
        <h2>{t('settings.pieceColor')}</h2>
        <p>{tintable ? t('settings.pieceColorHint') : t('settings.pieceColorLocked')}</p>
      </header>
      <div className="look-swatch-row mt-3" role="group" aria-label={t('settings.pieceColor')}>
        {PIECE_COLOR_IDS.map((id) => {
          const tint = tintForColor(id);
          return (
            <button
              key={id}
              type="button"
              className="look-swatch"
              aria-pressed={pieceColor === id}
              disabled={!tintable}
              onClick={() => onPieceColor(id)}
            >
              <span className="look-pieces" aria-hidden="true">
                <span style={{ background: tint.whiteFill, borderColor: tint.whiteStroke }} />
                <span style={{ background: tint.blackFill, borderColor: tint.blackStroke }} />
              </span>
              <span>{t(COLOR_LABEL[id])}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
