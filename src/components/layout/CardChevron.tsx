/** Decorative affordance for tappable cards. Hidden from AT; the link name is the title. */
export function CardChevron() {
  return (
    <svg viewBox="0 0 12 20" className="card-chevron" aria-hidden="true">
      <path
        d="M3.2 1.2 10.8 10 3.2 18.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
