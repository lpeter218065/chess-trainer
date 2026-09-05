/** Sticky commentary marker: tap X when empty → X; tap X again → clear; tap Y → Y. */
export function toggleFocus<T>(current: T | null, next: T): T | null {
  return current === next ? null : next;
}
