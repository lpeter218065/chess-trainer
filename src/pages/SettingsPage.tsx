import { NavBack } from '../components/layout/NavBack';
import { LanguageChips, SettingsFields } from '../components/SettingsFields';
import { LookPicker } from '../components/settings/LookPicker';
import { PieceSetPicker } from '../components/settings/PieceSetPicker';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';

export function SettingsPage() {
  const t = useT();
  const pieceSet = useSettings((s) => s.pieceSet);
  const boardTheme = useSettings((s) => s.boardTheme);
  const pieceColor = useSettings((s) => s.pieceColor);
  const setPieceSet = useSettings((s) => s.setPieceSet);
  const setBoardTheme = useSettings((s) => s.setBoardTheme);
  const setPieceColor = useSettings((s) => s.setPieceColor);
  return (
    <main className="page-shell mx-auto max-w-xl">
      <header className="mb-6">
        <NavBack to="/">{t('nav.home')}</NavBack>
        <h1 className="page-title mt-3">{t('settings.title')}</h1>
      </header>
      <LanguageChips />
      <LookPicker
        boardTheme={boardTheme}
        pieceColor={pieceColor}
        pieceSet={pieceSet}
        onBoardTheme={setBoardTheme}
        onPieceColor={setPieceColor}
      />
      <PieceSetPicker value={pieceSet} onChange={setPieceSet} />
      <div className="mt-8">
        <SettingsFields showLanguage={false} />
      </div>
    </main>
  );
}
