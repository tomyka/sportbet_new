/**
 * The competition formats sportbet runs (decision 5: a closed union).
 * `euroleague` alone until football is ported (decision 11).
 */
export const FORMATS = ['euroleague'] as const;

export type Format = (typeof FORMATS)[number];

export function formatLabel(format: Format): string {
  switch (format) {
    case 'euroleague':
      return 'Euroleague';
  }
}
