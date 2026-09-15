/** 2×2 棋格：应用签名，不是装饰插画。 */
import { useId } from 'react';

export function AppMark({ size = 28 }: { size?: number }) {
  const clipId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="app-mark shrink-0"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="32" height="32" rx="6.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="32" height="32" fill="var(--color-walnut)" />
        <rect x="3" y="3" width="13" height="13" fill="var(--color-ivory)" />
        <rect x="16" y="16" width="13" height="13" fill="var(--color-ivory)" />
      </g>
    </svg>
  );
}
