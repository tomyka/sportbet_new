import { defineInvariant } from '../invariant/invariant';
import { defineRangeInvariant } from '../invariant/range-invariant';

/**
 * Any text of at least one character. Postgres reads `\S` inside a bracket
 * as illegal and `.` differently from JavaScript at a line break, so "a
 * space or not a space" is the one spelling both sides read the same way.
 */
const ANY_CHARACTER = '[\\s]|[^\\s]';
/** Any text, the empty one included: every string matches the start of itself. */
const ANY_TEXT = '^';

/** MySQL's INT, and so Postgres's integer: the most a whole-euro column holds. */
const INTEGER_MAX = 2_147_483_647;

/** The most a fee may be: what a whole-euro column holds. */
export const LEAGUE_FEE_MAX = INTEGER_MAX;

/**
 * A league's name: 1 to 255 characters, any text (sportbet's `varchar(255)`
 * column; its 100-character limit is the form's, not the column's, so a
 * migrated row may be longer).
 */
export const leagueNameInvariant = defineInvariant({
  name: 'league name',
  pattern: ANY_CHARACTER,
  maxLength: 255,
  accepts: [
    { label: 'a realistic name', value: 'Draugų lyga' },
    { label: 'the maximum length', value: 'Š'.repeat(255) },
    { label: 'a single character', value: 'x' },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'too long', value: 'Š'.repeat(256) },
  ],
});

/** A payment's beneficiary: up to 70 characters (`payment_beneficiary`). */
export const paymentBeneficiaryInvariant = defineInvariant({
  name: 'payment beneficiary',
  pattern: ANY_TEXT,
  maxLength: 70,
  accepts: [
    { label: 'a person', value: 'Jonas Jonaitis' },
    { label: 'the maximum length', value: 'Š'.repeat(70) },
  ],
  refuses: [{ label: 'too long', value: 'Š'.repeat(71) }],
});

/**
 * A payment's IBAN: up to 34 characters, stored compact (`payment_iban`);
 * the checksum is the payments form's to check.
 */
export const paymentIbanInvariant = defineInvariant({
  name: 'payment IBAN',
  pattern: ANY_TEXT,
  maxLength: 34,
  accepts: [
    { label: 'a Lithuanian IBAN', value: 'LT121000011101001000' },
    { label: 'the maximum length', value: 'L'.repeat(34) },
  ],
  refuses: [{ label: 'too long', value: 'L'.repeat(35) }],
});

/** The most characters a league message holds (`messages.message`). */
export const MESSAGE_TEXT_MAX = 10_000;

/** A league message: 1 to 10 000 characters (`messages.message`, R-127). */
export const messageTextInvariant = defineInvariant({
  name: 'message text',
  pattern: ANY_CHARACTER,
  maxLength: MESSAGE_TEXT_MAX,
  accepts: [
    { label: 'a notice', value: 'Lyga prasideda rytoj' },
    { label: 'the maximum length', value: 'Š'.repeat(10_000) },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'too long', value: 'Š'.repeat(10_001) },
  ],
});

/**
 * A fee in whole euros (`base_fee`, `penalty_step`): from 0, up to what an
 * integer column holds.
 */
export const leagueFeeInvariant = defineRangeInvariant({
  name: 'league fee',
  min: 0,
  max: LEAGUE_FEE_MAX,
  accepts: [
    { label: 'no fee', value: 0 },
    { label: 'a fee', value: 10 },
  ],
  refuses: [{ label: 'a negative fee', value: -1 }],
});

/**
 * An amount paid in cents (`decimal(8,2)` in sportbet: up to 999 999.99).
 */
export const paidCentsInvariant = defineRangeInvariant({
  name: 'paid amount',
  min: 0,
  max: 99_999_999,
  accepts: [
    { label: 'nothing paid yet', value: 0 },
    { label: 'twelve fifty', value: 1250 },
    { label: 'the most the column holds', value: 99_999_999 },
  ],
  refuses: [
    { label: 'a negative amount', value: -1 },
    { label: 'past the column', value: 100_000_000 },
  ],
});
