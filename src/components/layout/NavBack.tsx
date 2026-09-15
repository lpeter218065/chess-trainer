import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';

function Chevron() {
  return (
    <svg viewBox="0 0 12 20" className="nav-back-chevron" aria-hidden="true">
      <path
        d="M10.2 1.2 1.6 10l8.6 8.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NavBack({
  to,
  onClick,
  children,
}: {
  to?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const text = children ?? t('nav.lesson');
  const inner = (
    <>
      <Chevron />
      <span className="nav-back-label">{text}</span>
    </>
  );
  const label = typeof text === 'string' ? t('nav.back', { label: text }) : t('nav.backBare');
  if (to) {
    return (
      <Link to={to} className="nav-back" aria-label={label}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className="nav-back" aria-label={label} onClick={onClick}>
      {inner}
    </button>
  );
}
