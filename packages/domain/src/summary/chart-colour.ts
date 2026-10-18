import type { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { ok, refuse, type Result } from '../shared/result';

/** `#` and six hex digits. */
const CHART_COLOUR_LENGTH = 7;

/**
 * A player's line colour on the points chart (sportbet's `colors.color_code`,
 * R-136): `#rrggbb` in lower case, 7 characters. The only shape that may
 * reach a stroke attribute or a style, so a quote, a separator or a CSS
 * function never can. The same rule the column's CHECK is built from.
 */
export const chartColourInvariant = defineInvariant({
  name: 'chart colour',
  pattern: '^#[0-9a-f]{6}$',
  maxLength: CHART_COLOUR_LENGTH,
  accepts: [
    { label: 'a colour of sportbet seeder', value: '#d96c6c' },
    { label: 'black', value: '#000000' },
    { label: 'digits only', value: '#123456' },
    { label: 'the highest value', value: '#ffffff' },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'no hash', value: 'd96c6c' },
    { label: 'upper case', value: '#D96C6C' },
    { label: 'the short form', value: '#fff' },
    { label: 'one with an alpha pair', value: '#d96c6c26' },
    { label: 'a colour name', value: 'red' },
    { label: 'a non-hex digit', value: '#d96c6g' },
    { label: 'a quote', value: '#d96c6c"' },
    { label: 'a separator', value: '#d96c6c;x' },
    { label: 'a trailing newline', value: '#d96c6c\n' },
    { label: 'a space', value: ' #d96c6c' },
  ],
});

const chartColourSchema = chartColourInvariant.schema.brand<'ChartColour'>();

/** A validated `#rrggbb` colour; only `chartColour` makes one. */
export type ChartColour = z.infer<typeof chartColourSchema>;

/** The colour as a ChartColour, or a refusal for anything but the stored form. */
export function chartColour(value: unknown): Result<ChartColour, 'invalid'> {
  const parsed = chartColourSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('invalid');
}

/**
 * sportbet's colour code as a ChartColour: trimmed and lower-cased, then held
 * to the invariant. A code in any other form (a name, `#fff`, an alpha pair)
 * is refused, never repaired.
 */
export function normalizeChartColour(
  code: string,
): Result<ChartColour, 'invalid'> {
  return chartColour(code.trim().toLowerCase());
}
