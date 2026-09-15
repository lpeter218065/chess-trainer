import { Link, useParams } from 'react-router-dom';
import { CAMPAIGN_ISLANDS, islandById, laterIslandsOf } from '../campaign';
import { IslandHero } from '../components/campaign/IslandHero';
import { Stars } from '../components/campaign/Stars';
import { AppMark } from '../components/layout/AppMark';
import { CardChevron } from '../components/layout/CardChevron';
import { NavBack } from '../components/layout/NavBack';
import { useCampaign } from '../store/campaign';
import { localizeContent, useLocale, useT } from '../i18n';

export function CampaignMapPage() {
  const { id } = useParams();
  const island = islandById(decodeURIComponent(id ?? ''));
  if (!island) return <IslandHub />;
  return <IslandMap islandId={island.id} />;
}

function IslandHub() {
  const t = useT();
  const locale = useLocale();
  const islands = CAMPAIGN_ISLANDS.map((island) => localizeContent(island, locale));
  return (
    <div className="page-shell campaign-hub">
      <header className="mb-6">
        <NavBack to="/">{t('nav.home')}</NavBack>
        <div className="mt-4 flex items-center gap-3">
          <AppMark size={36} />
          <h1 className="page-title min-w-0">{t('home.campaign')}</h1>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {t('home.campaignBlurb')}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {islands.map((island) => (
          <IslandHero key={island.id} island={island} titleAs="h2" />
        ))}
      </div>
    </div>
  );
}

function IslandMap({ islandId }: { islandId: string }) {
  const t = useT();
  const locale = useLocale();
  const raw = islandById(islandId);
  const island = raw ? localizeContent(raw, locale) : raw;
  const stars = useCampaign((s) => s.stars);
  const unlocked = useCampaign((s) => s.isUnlocked);
  const cards = useCampaign((s) => s.cards);
  if (!island || !raw) return <IslandHub />;
  const later = laterIslandsOf(island.id).map((next) => localizeContent(next, locale));
  const remembered = cards
    .filter((card) => raw.levels.some((level) => level.ideaCard === card))
    .map((card) => localizeContent(card, locale));
  return (
    <div className="page-shell campaign-map">
      <header className="mb-6">
        <NavBack to="/campaign">{t('campaign.isles')}</NavBack>
        <div className="mt-4 flex items-center gap-3">
          <AppMark size={36} />
          <h1 className="page-title min-w-0">{island.title}</h1>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{island.blurb}</p>
      </header>

      <ol className="campaign-path">
        {island.levels.map((level, i) => {
          const open = unlocked(level.id);
          const score = stars[level.id] ?? 0;
          const kind = level.kind === 'recognize' ? t('campaign.kind.recognize') : level.kind === 'boss' ? t('campaign.kind.boss') : t('campaign.kind.sail');
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className={`campaign-kicker campaign-map-kind campaign-kind-${level.kind}`}>{i + 1} · {kind}</p>
                {score > 0 && <Stars n={score} />}
              </div>
              <h2 className="mt-2 font-semibold text-ink">{level.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{level.summary}</p>
              {!open && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-walnut/8 px-2 py-0.5 text-xs font-medium text-muted">
                  <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 opacity-80" fill="currentColor" aria-hidden="true">
                    <path d="M4.5 6V4.5a3.5 3.5 0 0 1 7 0V6h.5A1.5 1.5 0 0 1 13.5 7.5v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13.5v-6A1.5 1.5 0 0 1 4 6h.5Zm1.5 0h4V4.5a2 2 0 1 0-4 0V6Z" />
                  </svg>
                  {t('campaign.lock')}
                </span>
              )}
              {open && <CardChevron />}
            </>
          );
          if (!open) {
            return (
              <li key={level.id} className="card-link is-locked" aria-disabled="true">
                {inner}
              </li>
            );
          }
          return (
            <li key={level.id}>
              <Link to={`/campaign/${level.id}`} className="card-link block">
                {inner}
              </Link>
            </li>
          );
        })}
      </ol>

      {remembered.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-ink">{t('campaign.remembered')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {remembered.map((card) => (
              <li key={card} className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-ivory px-3.5 py-2.5 text-sm font-medium text-walnut shadow-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brass/15 text-brass">
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                    <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v12.25a.25.25 0 0 1-.4.2L8 11.2l-4.6 3.75a.25.25 0 0 1-.4-.2V2.5Z" />
                  </svg>
                </span>
                {card}
              </li>
            ))}
          </ul>
        </section>
      )}

      {later.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display mb-3 text-lg font-semibold text-ink">{t('campaign.later')}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {later.map((next) => (
              <div key={next.id} className="card-link is-locked" aria-disabled="true">
                <p className="campaign-kicker">
                  <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 opacity-70" fill="currentColor" aria-hidden="true">
                    <path d="M4.5 6V4.5a3.5 3.5 0 0 1 7 0V6h.5A1.5 1.5 0 0 1 13.5 7.5v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 13.5v-6A1.5 1.5 0 0 1 4 6h.5Zm1.5 0h4V4.5a2 2 0 1 0-4 0V6Z" />
                  </svg>
                  {t('campaign.locked')}
                </p>
                <h3 className="mt-1 font-semibold text-ink">{next.title}</h3>
                <p className="mt-1 text-sm text-muted">{next.blurb}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
