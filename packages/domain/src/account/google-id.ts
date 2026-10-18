import type { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { ok, refuse, type Result } from '../shared/result';

const GOOGLE_ID_MAX_LENGTH = 255;

/**
 * A Google account's `sub` (the OpenID subject, sportbet's `users.google_id`):
 * 1 to 255 characters of letters, digits, `_` and `-`. Google's is a string of
 * digits in practice; the wider class keeps the CHECK honest without ever
 * letting a quote or a separator reach SQL. The same rule the column's CHECK
 * is built from (slice 19, #40).
 */
export const googleIdInvariant = defineInvariant({
  name: 'google id',
  pattern: '^[A-Za-z0-9_-]+$',
  maxLength: GOOGLE_ID_MAX_LENGTH,
  accepts: [
    { label: 'a realistic sub', value: '104520385693274017345' },
    { label: 'the maximum length', value: 'a'.repeat(GOOGLE_ID_MAX_LENGTH) },
    { label: 'letters, an underscore and a dash', value: 'a_b-C' },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'too long', value: 'a'.repeat(GOOGLE_ID_MAX_LENGTH + 1) },
    { label: 'a space', value: 'a b' },
    { label: 'a quote', value: "a'b" },
    { label: 'a separator', value: '1;2' },
  ],
});

const googleIdSchema = googleIdInvariant.schema.brand<'GoogleId'>();

/** A Google `sub`; only `googleId` makes one. */
export type GoogleId = z.infer<typeof googleIdSchema>;

/** The `sub` as a GoogleId, or a refusal for anything the invariant refuses. */
export function googleId(value: unknown): Result<GoogleId, 'invalid'> {
  const parsed = googleIdSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('invalid');
}
