import { emailInvariant, type EmailChangeRefusal } from '@sportbet/domain';
import { z } from 'zod';

/** The account form's fields, which a refusal names and whose typed values come back (Laravel's old input). */
export const ACCOUNT_FIELDS = ['username', 'name', 'surname', 'email'] as const;

/**
 * Why a field of the account form was refused: the domain's problems, the
 * database's `taken`, the address change's `send-failed` and `throttled`.
 * The texts are the profile components' (decision 13).
 */
const accountErrorSchema = z.enum([
  'required',
  'blank',
  'too-long',
  'not-an-email',
  'taken',
  'send-failed',
  'throttled',
]);

export type AccountError = z.infer<typeof accountErrorSchema>;

/**
 * Why a code box (the address change's) or the danger zone was refused: the
 * domain's EmailChangeRefusal (the db and the page share that vocabulary), a
 * send that failed, and the last superadmin's deletion (R-131). The texts
 * are a complete table over it (profile-texts.ts), so a refusal the domain
 * adds needs its text.
 */
export type CodeError = EmailChangeRefusal | 'send-failed' | 'last-superadmin';

const CODE_ERRORS = [
  'none',
  'invalid',
  'taken',
  'send-failed',
  'last-superadmin',
] as const satisfies readonly CodeError[];

const codeErrorSchema = z.enum(CODE_ERRORS);

/**
 * A typed value kept in the cookie, cut to this many bytes as the cookie
 * holds them (a cookie is 4 KB, and four fields of astral characters or
 * control characters must still fit sealed).
 */
const MAX_VALUE_BYTES = 400;

/**
 * `text` cut to at most MAX_VALUE_BYTES of what JSON stores of it (a
 * character may be four bytes, a control character six), never in the
 * middle of a character.
 */
export function cutToBytes(text: string): string {
  let bytes = 0;
  let kept = '';
  for (const character of text) {
    bytes += Buffer.byteLength(JSON.stringify(character)) - 2;
    if (bytes > MAX_VALUE_BYTES) break;
    kept += character;
  }
  return kept;
}

const valueSchema = z.string().max(MAX_VALUE_BYTES);

const accountErrorsSchema = z
  .object({
    username: accountErrorSchema,
    name: accountErrorSchema,
    surname: accountErrorSchema,
    email: accountErrorSchema,
  })
  .partial()
  .strict()
  .refine((errors) => Object.keys(errors).length > 0);

const valuesSchema = z.object({
  username: valueSchema,
  name: valueSchema,
  surname: valueSchema,
  email: valueSchema,
});

/**
 * A refused profile post, by the bag Laravel keeps it in: the account form
 * (`account-refused`: its fields' errors with the typed values and the
 * minutes a throttled address change waits), or the one refusal of a code
 * box or of the danger zone (`code-refused`). Anything a bag does not have
 * opens as nothing.
 */
export const profileRefusedSchemas = [
  z
    .object({
      kind: z.literal('account-refused'),
      errors: accountErrorsSchema,
      values: valuesSchema,
      minutes: z.int().positive().optional(),
    })
    .readonly(),
  z
    .object({
      kind: z.literal('code-refused'),
      bag: z.enum(['emailChange', 'userDeletion']),
      error: codeErrorSchema,
    })
    .strict()
    .readonly(),
] as const;

const bare = <Kind extends string>(kind: Kind) =>
  z.object({ kind: z.literal(kind) }).readonly();

/**
 * The profile's one-time messages that are sportbet's `session('info')`:
 * the one list of them. The flash, the guard and the texts all derive from
 * it, and a component's text table is keyed by it, so a new outcome is
 * added here and its text is then required.
 */
export const profileInfoSchema = z.discriminatedUnion('kind', [
  bare('profile-updated'),
  z
    .object({
      kind: z.literal('email-change-requested'),
      email: emailInvariant.schema,
    })
    .readonly(),
  bare('email-changed'),
  bare('email-change-cancelled'),
  bare('deletion-code-sent'),
  bare('notifications-saved'),
]);

export type ProfileInfo = z.infer<typeof profileInfoSchema>;
