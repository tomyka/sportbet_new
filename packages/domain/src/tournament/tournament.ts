import { z } from 'zod';
import { FORMATS } from './format';

/**
 * Shared with the database CHECK constraint (packages/db), so both agree;
 * written without any quote character so it can be embedded in SQL.
 * Matches sportbet's slug validation (max 100, [a-z0-9-]), so every
 * migrated slug is valid.
 */
export const SLUG_PATTERN = '^[a-z0-9-]+$';
export const SLUG_MAX_LENGTH = 100;

/**
 * A character that is not whitespace, as JavaScript's \s defines it. Shared
 * with the database CHECK constraint, and written without any quote
 * character so it can be embedded in SQL.
 */
export const NAME_NOT_BLANK_PATTERN =
  '[^\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';

export const slugSchema = z
  .string()
  .max(SLUG_MAX_LENGTH)
  .regex(new RegExp(SLUG_PATTERN));

export const tournamentSchema = z.object({
  id: z.int().positive(),
  slug: slugSchema,
  name: z.string().regex(new RegExp(NAME_NOT_BLANK_PATTERN)),
  format: z.enum(FORMATS),
});

export type Tournament = z.infer<typeof tournamentSchema>;

/** A row not yet inserted: every `Tournament` field but the generated `id`. */
export const newTournamentSchema = tournamentSchema.omit({ id: true });

export type NewTournament = z.infer<typeof newTournamentSchema>;
