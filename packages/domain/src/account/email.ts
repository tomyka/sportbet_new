import { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { ok, refuse, type Result } from '../shared/result';

const EMAIL_MAX_LENGTH = 255;

/**
 * An email address as an account stores it (sportbet's EmailIdentity,
 * #41, #42): trimmed and lower case, at most 255 characters (`users.email`
 * is varchar(255)), one @ with something on each side and no whitespace.
 * Only the ASCII capitals are refused here - the two regex dialects share
 * no wider class - and normalizeEmail lowers every letter on every write.
 * It is not RFC 5322: sportbet's `email` rule also takes a quoted local
 * part with a space or an @, which this refuses; the reader counts any
 * such production row and never fixes it (spec 4b).
 */
export const emailInvariant = defineInvariant({
  name: 'email address',
  pattern: '^[^\\t\\n\\v\\f\\r @A-Z]+@[^\\t\\n\\v\\f\\r @A-Z]+$',
  maxLength: EMAIL_MAX_LENGTH,
  accepts: [
    { label: 'a realistic address', value: 'jonas@example.lt' },
    { label: 'a Lithuanian letter', value: 'žukauskas@example.lt' },
    { label: 'a plus and dots', value: 'jonas.k+bet@gmail.com' },
    {
      label: 'a domain without a dot, as sportbet accepts',
      value: 'jonas@localhost',
    },
    {
      label: 'the maximum length',
      value: `${'a'.repeat(EMAIL_MAX_LENGTH - 12)}@example.com`,
    },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'no @', value: 'jonas.example.lt' },
    { label: 'nothing before the @', value: '@example.lt' },
    { label: 'nothing after the @', value: 'jonas@' },
    { label: 'two @', value: 'jonas@example@lt' },
    { label: 'a capital letter', value: 'Jonas@example.lt' },
    { label: 'a leading space', value: ' jonas@example.lt' },
    { label: 'a trailing tab', value: 'jonas@example.lt\t' },
    { label: 'a space inside', value: 'jo nas@example.lt' },
    {
      label: 'too long',
      value: `${'a'.repeat(EMAIL_MAX_LENGTH - 11)}@example.com`,
    },
  ],
});

const emailSchema = emailInvariant.schema.brand<'EmailAddress'>();

/** An address in its stored form; only emailAddress and storedEmailAddress make one. */
export type EmailAddress = z.infer<typeof emailSchema>;

/** What PHP's trim() strips: space, tab, newline, carriage return, NUL and vertical tab. */
const PHP_TRIM = ' \t\n\r\0\u000b';

function phpTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && PHP_TRIM.includes(value.charAt(start))) start += 1;
  while (end > start && PHP_TRIM.includes(value.charAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

/**
 * sportbet's EmailIdentity::normalize: PHP's trim(), then lower case
 * (Str::lower). Applied to every address that is typed, before it is
 * stored or looked up. Nothing folds accents: 'Žukauskas@' becomes
 * 'žukauskas@', never 'zukauskas@'.
 */
export function normalizeEmail(typed: string): string {
  return phpTrim(typed).toLowerCase();
}

/** A typed address in its stored form, or a refusal when that is no address. */
export function emailAddress(
  typed: string,
): Result<EmailAddress, 'not-an-email'> {
  return storedEmailAddress(normalizeEmail(typed));
}

/**
 * A stored address, read as it is: never normalized, so a row that is not
 * in the stored form is refused rather than silently changed (spec 4b).
 */
export function storedEmailAddress(
  value: string,
): Result<EmailAddress, 'not-an-email'> {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('not-an-email');
}

/** The combining marks NFKD splits an accented letter into. */
const COMBINING_MARKS = /[\u0300-\u036f]/gu;

/**
 * utf8mb4_unicode_ci's base letters and expansions for the letters that do
 * not decompose. email_fold() (migration 0006) holds the same table.
 */
const FOLDED_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ı: 'i',
  þ: 'th',
};

const FOLDED_LETTER = new RegExp(
  `[${Object.keys(FOLDED_LETTERS).join('')}]`,
  'gu',
);

/**
 * The address with its accents dropped, toward sportbet's
 * utf8mb4_unicode_ci: NFKD (which also turns a full-width letter into the
 * letter), every combining mark (U+0300 to U+036F) removed, then
 * FOLDED_LETTERS, so 'žukauskas@' and 'zukauskas@', 'straße@' and
 * 'strasse@', 'łukasz@' and 'lukasz@' fold alike. The key of the unique
 * index that refuses a second spelling, as sportbet's index does; never a
 * lookup key - sign-in matches the exact address (#41). The database's
 * email_fold() is the same function, proved equal on every BMP character
 * but those Node's Unicode knows and Postgres's does not yet (listed in
 * packages/db/test/email-fold.test.ts).
 *
 * Known gaps against the collation, none of them in a realistic address:
 * combining marks outside U+0300 to U+036F are kept; letters the collation
 * also equates beyond FOLDED_LETTERS (e.g. 'ŋ', 'ħ', 'ŧ') are kept; and
 * nothing is lowered here, as a stored address is already lower case
 * (normalizeEmail) and only an NFKD expansion of a lower-case letter could
 * bring a capital back.
 */
export function foldEmail(email: string): string {
  return email
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(FOLDED_LETTER, (letter) => FOLDED_LETTERS[letter] ?? letter);
}
