/**
 * Counts by reason as the load and parity reports print them:
 * "reason 3, other 1", or "-" when there are none.
 */
export const counted = (counts: Readonly<Record<string, number>>): string =>
  Object.entries(counts)
    .map(([reason, count]) => `${reason} ${String(count)}`)
    .join(', ') || '-';
