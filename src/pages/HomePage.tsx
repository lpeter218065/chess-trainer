import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { lessonsBySection } from '../lessons';
import { OPENING_DRILLS } from '../lessons/openingDrills';
import type { Section } from '../lessons/schema';
import { useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { useGameSessions } from '../store/gameSessions';
import { LessonCard } from '../components/LessonCard';
import { AppMark } from '../components/layout/AppMark';
import { getEngine } from '../engine/getEngine';
import { CAMPAIGN_ISLANDS } from '../campaign';
import { IslandHero } from '../components/campaign/IslandHero';
import { CardChevron } from '../components/layout/CardChevron';
import { localizeContent, useLocale, useT } from '../i18n';

const SECTIONS: Section[] = ['opening', 'middlegame', 'endgame'];

const BANNER_DISMISS_KEY = 'trainer-key-banner-dismissed';

export function HomePage() {
  const t = useT();
  const locale = useLocale();
  const records = useProgress((s) => s.records);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const metas = useGameSessions((s) => s.metas);
  const islands = useMemo(() => CAMPAIGN_ISLANDS.map((island) => localizeContent(island, locale)), [locale]);
  const drills = useMemo(() => OPENING_DRILLS.map((d) => localizeContent(d, locale)), [locale]);
  const sessionCount = useMemo(() => Object.keys(metas).length, [metas]);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const showKeyBanner = !hasKey && !bannerDismissed;
  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };
  // 空闲时预热引擎 Worker/WASM，进课程页时 getEngine() 直接复用同一个单例 Promise
  useEffect(() => {
    const warm = () => { void getEngine().catch(() => undefined); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm);
    else setTimeout(warm, 0);
  }, []);
  return (
    <main className="page-shell">
      <header className="mb-8 flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-3">
            <AppMark size={36} />
            <h1 className="page-title">{t('app.name')}</h1>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-muted">
            {t('home.tagline')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/explore" state={{ from: 'home' }} className="btn btn-primary text-sm gap-1.5">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <polygon points="10,5.5 12.5,10 10,14.5 7.5,10" fill="currentColor" stroke="none" />
            </svg>
            {t('home.explore')}
          </Link>
          <Link to="/analyses" className="btn text-sm gap-1.5">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 3.5A2 2 0 0 1 6.5 2h9v14.5h-9a2 2 0 0 0-2 2V3.5Z" />
              <path d="M4.5 16.5A2 2 0 0 1 6.5 15h9" />
            </svg>
            {sessionCount > 0 ? t('home.analysesCount', { n: sessionCount }) : t('home.analyses')}
          </Link>
          <Link to="/settings" className="btn text-sm gap-1.5">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
            </svg>
            {t('home.settings')}
          </Link>
        </div>
        {showKeyBanner && (
          <div className="key-banner" role="status">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/15 text-brass">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
              {t('home.keyBanner')}
            </p>
            <Link to="/settings" className="btn btn-primary btn-sm shrink-0">
              {t('home.configure')}
            </Link>
            <button type="button" className="btn btn-ghost btn-sm min-w-11 px-0 shrink-0" aria-label={t('home.dismissBanner')} onClick={dismissBanner}>
              ×
            </button>
          </div>
        )}
      </header>

      <section className="mb-10">
        <header className="home-section-head">
          <h2>{t('home.campaign')}</h2>
          <p>{t('home.campaignBlurb')}</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {islands.map((island) => (
            <IslandHero key={island.id} island={island} from="home" />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <header className="home-section-head">
          <h2>{t('home.drills')}</h2>
          <p>{t('home.drillsBlurb')}</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drills.map((d) => (
            <Link
              key={d.id}
              to={`/drill/${encodeURIComponent(d.id)}`}
              state={{ from: 'home' }}
              className="card-link pr-10"
            >
              <h3 className="font-medium text-ink">{d.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d.summary}</p>
              <CardChevron />
            </Link>
          ))}
          <Link
            to="/drill/custom"
            state={{ from: 'home' }}
            className="card-link border-dashed border-walnut/30 pr-10"
          >
            <p className="campaign-kicker">{t('home.custom')}</p>
            <h3 className="mt-2 font-medium text-ink">{t('home.customTitle')}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t('home.customBlurb')}</p>
            <CardChevron />
          </Link>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-3">
        {SECTIONS.map((sec) => (
          <section key={sec}>
            <header className="home-section-head mb-3">
              <h2>
                {t(sec === 'opening' ? 'section.opening' : sec === 'middlegame' ? 'section.middlegame' : 'section.endgame')}
              </h2>
            </header>
            <div className="flex flex-col gap-2.5">
              {lessonsBySection(sec).map((l) => (
                <LessonCard key={l.id} lesson={localizeContent(l, locale)} record={records[l.id]} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="mt-12 border-t border-line pt-4 text-sm text-muted">
        <Link to="/licenses" className="text-walnut underline-offset-4 hover:underline">{t('home.licenses')}</Link>
      </footer>
    </main>
  );
}
