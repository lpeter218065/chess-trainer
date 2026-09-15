import { useT } from '../../i18n';

function Star({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={on ? 'campaign-star is-on' : 'campaign-star is-off'} aria-hidden="true">
      <path d="M12 2.6 14.7 8l6 .9-4.3 4.2 1 5.9L12 16.3 6.6 19l1-5.9L3.3 8.9 9.3 8 12 2.6Z" />
    </svg>
  );
}

export function Stars({ n }: { n: number }) {
  const t = useT();
  const filled = Math.max(0, Math.min(3, n));
  return (
    <span className="campaign-stars" aria-label={t('campaign.stars', { n: filled })}>
      <Star on={filled >= 1} />
      <Star on={filled >= 2} />
      <Star on={filled >= 3} />
    </span>
  );
}
