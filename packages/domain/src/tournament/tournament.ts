import { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { roundNumberSchema } from '../shared/ids';
import { FORMATS } from './format';

const SLUG_MAX_LENGTH = 100;

/**
 * Matches sportbet's slug validation (max 100, [a-z0-9-]), so every migrated
 * slug is valid.
 */
export const slugInvariant = defineInvariant({
  name: 'slug',
  pattern: '^[a-z0-9-]+$',
  maxLength: SLUG_MAX_LENGTH,
  accepts: [
    { label: 'a single character', value: 'a' },
    { label: 'a realistic slug', value: 'euroleague-2026-27' },
    { label: 'hyphenated numbers', value: 'euroleague-2025-26' },
    { label: 'the maximum length', value: 'a'.repeat(SLUG_MAX_LENGTH) },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'too long', value: 'a'.repeat(SLUG_MAX_LENGTH + 1) },
    { label: 'uppercase', value: 'Euroleague-2026' },
    { label: 'a space', value: 'euroleague 2026' },
    { label: 'an underscore', value: 'euroleague_2026' },
    { label: 'a slash', value: 'euroleague/2026' },
  ],
});

/**
 * A name holds at least one character that is not whitespace, as
 * JavaScript's \s defines it; surrounding spaces are allowed.
 */
export const tournamentNameInvariant = defineInvariant({
  name: 'tournament name',
  pattern:
    '[^\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]',
  accepts: [
    { label: 'a realistic name', value: 'Euroleague 2026/27' },
    {
      label: 'leading and trailing spaces',
      value: '  Euroleague 2026/27  ',
    },
    { label: 'a single character', value: 'x' },
    { label: 'a character above the BMP', value: '\u{1F600}' },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'only spaces', value: '   ' },
    { label: 'only no-break spaces', value: '\u00a0\u00a0' },
    { label: 'only a byte-order mark', value: '\ufeff' },
  ],
});

export const slugSchema = slugInvariant.schema;

export const tournamentSchema = z.object({
  id: z.int().positive(),
  slug: slugSchema,
  name: tournamentNameInvariant.schema,
  format: z.enum(FORMATS),
  /**
   * The last day of the tournament, `YYYY-MM-DD` in UTC (R-21): it stays
   * on for the whole of that day (`dayAfter` is when its season ends).
   * Null when it has none yet, as sportbet allows: a Euroleague season's
   * depends on its playoffs (the owner, 2026-09-30), and it is not
   * finished until one is set.
   */
  endsOn: z.iso.date().nullable(),
  /** The admin's standings deadline round; null is the format's (ST-2). */
  standingsDeadlineRound: roundNumberSchema.nullable(),
  /** Survival is played (sportbet's `survival_game`). */
  survival: z.boolean(),
  /** The standings table entered is the final regular-season table (R-14). */
  standingsTableFinal: z.boolean(),
});

export type Tournament = z.infer<typeof tournamentSchema>;

/** A row not yet inserted: every `Tournament` field but the generated `id`. */
export const newTournamentSchema = tournamentSchema.omit({ id: true });

export type NewTournament = z.infer<typeof newTournamentSchema>;
