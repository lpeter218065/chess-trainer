import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import type { Island } from '../../campaign/types';
import { useT } from '../../i18n';
import { CardChevron } from '../layout/CardChevron';
import { useCampaign } from '../../store/campaign';

function stripLeadingSide(blurb: string, side: string): string {
  if (blurb.startsWith(`${side}。`)) return blurb.slice(side.length + 1).trim();
  if (blurb.startsWith(`${side}. `)) return blurb.slice(side.length + 2).trim();
  return blurb;
}

export function IslandHero({
  island,
  titleAs: Title = 'h3',
  from,
}: {
  island: Island;
  titleAs?: 'h2' | 'h3';
  from?: string;
}) {
  const t = useT();
  const levelStars = useCampaign(useShallow((s) => island.levels.map((l) => s.stars[l.id] ?? 0)));
  const isWhite = island.id === 'queen-pawn';
  const side = isWhite ? t('home.youWhite') : t('home.youBlack');
  const blurb = stripLeadingSide(island.blurb, side);
  const total = island.levels.length;
  const done = levelStars.filter((n) => n > 0).length;

  return (
    <Link
      to={`/campaign/${island.id}`}
      state={from ? { from } : undefined}
      className={`campaign-hero card-link${isWhite ? ' campaign-hero-d4' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`campaign-kicker ${isWhite ? 'campaign-kicker-white' : 'campaign-kicker-black'}`}>
          <span className="campaign-kicker-dot" aria-hidden="true" />
          {side}
        </span>
        {done > 0 && (
          <span className="rounded-full border border-line/70 bg-ivory/80 px-2 py-0.5 text-xs font-medium text-walnut">
            {done}/{total}
          </span>
        )}
      </div>
      <Title className="mt-2.5 font-display text-lg font-semibold text-ink">{island.title}</Title>
      <p className="mt-1 text-sm leading-relaxed text-muted">{blurb}</p>
      <CardChevron />
    </Link>
  );
}
