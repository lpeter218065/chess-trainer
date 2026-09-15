import { NavBack } from '../components/layout/NavBack';
import { useT } from '../i18n';
import { APP_LICENSE, STOCKFISH_ENGINE_SOURCE, STOCKFISH_JS_SOURCE } from '../licenses/notice';
import { APP_VERSION, THIRD_PARTY_LICENSES } from '../licenses/thirdParty.generated';

export function LicensesPage() {
  const t = useT();
  return (
    <div className="page-shell mx-auto max-w-3xl">
      <header className="mb-6">
        <NavBack to="/">{t('nav.home')}</NavBack>
        <h1 className="page-title mt-2 text-2xl">{t('licenses.title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('app.name')} {APP_VERSION} · {APP_LICENSE}</p>
      </header>

      <section className="panel mb-6 p-4">
        <h2 className="font-display text-lg font-semibold text-ink">{t('licenses.app')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('licenses.appBody')}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('settings.privacy')}</p>
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="font-display text-lg font-semibold text-ink">{t('licenses.stockfish')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('licenses.stockfishBody')}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-walnut">
          <li>
            <a className="underline-offset-4 hover:underline" href={STOCKFISH_ENGINE_SOURCE} target="_blank" rel="noreferrer">
              {t('licenses.engineSource')}
            </a>
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href={STOCKFISH_JS_SOURCE} target="_blank" rel="noreferrer">
              {t('licenses.wasmSource')}
            </a>
          </li>
        </ul>
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="font-display text-lg font-semibold text-ink">{t('licenses.pieces')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('licenses.piecesBody')}</p>
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg font-semibold text-ink">{t('licenses.third')}</h2>
        <p className="mb-3 text-sm text-muted">{t('licenses.generated')}</p>
        <ul className="panel divide-y divide-line">
          {THIRD_PARTY_LICENSES.map((pkg) => (
            <li key={pkg.name} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0">
                {pkg.homepage ? (
                  <a className="font-medium text-ink underline-offset-4 hover:underline" href={pkg.homepage} target="_blank" rel="noreferrer">
                    {pkg.name}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{pkg.name}</span>
                )}
                <span className="ml-2 text-xs text-muted">{pkg.version}</span>
              </div>
              <span className="text-sm text-muted">{pkg.license}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
