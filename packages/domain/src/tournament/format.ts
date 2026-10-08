/**
 * The competition formats sportbet runs (decision 5: a closed union).
 * `euroleague` alone until football is ported (decision 11).
 */
export const FORMATS = ['euroleague'] as const;

export type Format = (typeof FORMATS)[number];

/**
 * Each format's label. A Record over every Format, so adding a format
 * (decision 11) is a compile error until it has its label.
 */
const FORMAT_LABELS: Readonly<Record<Format, string>> = {
  euroleague: 'Euroleague',
};

export function formatLabel(format: Format): string {
  return FORMAT_LABELS[format];
}
