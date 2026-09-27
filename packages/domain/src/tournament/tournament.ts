import { z } from 'zod';
import { FORMATS } from './format';

/** Shared with the database CHECK constraint (packages/db), so both agree. */
export const SLUG_PATTERN = '^[a-z0-9-]+$';
export const SLUG_MAX_LENGTH = 64;

export const slugSchema = z
  .string()
  .max(SLUG_MAX_LENGTH)
  .regex(new RegExp(SLUG_PATTERN));

export const tournamentSchema = z.object({
  id: z.int().positive(),
  slug: slugSchema,
  name: z.string().regex(/\S/),
  format: z.enum(FORMATS),
});

export type Tournament = z.infer<typeof tournamentSchema>;
