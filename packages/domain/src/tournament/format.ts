/** The competition formats sportbet runs (decision 5: a closed union). */
export const FORMATS = ['football', 'euroleague'] as const;

export type Format = (typeof FORMATS)[number];

export function formatLabel(format: Format): string {
  switch (format) {
    case 'football':
      return 'Football';
    case 'euroleague':
      return 'Euroleague';
  }
}
