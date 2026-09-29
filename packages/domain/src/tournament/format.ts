/**
 * The competition formats sportbet runs (decision 5: a closed union).
 * `euroleague` alone until football is ported (decision 11).
 */
export const FORMATS = ['euroleague'] as const;

export type Format = (typeof FORMATS)[number];

export function formatLabel(format: Format): string {
  switch (format) {
    // The switch stays exhaustive even with one member, so adding a format
    // (decision 11) is a compile error until this case list handles it.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above
    case 'euroleague':
      return 'Euroleague';
  }
}
