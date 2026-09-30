import type { Invariant, RangeInvariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Further inputs, too many to list as examples, on which the domain and the
 * CHECK must also agree; the test entry (src/testing) generates them.
 */
export type InvariantSweep = 'every BMP character';

/**
 * A CHECK on one column that holds a domain invariant: a text rule
 * (`defineInvariant`) on a text column, or a whole-number range
 * (`defineRangeInvariant`) on a smallint, integer or numeric column. Each
 * area lists its own beside its table and builds the table's checks from
 * that list, so the constraint name is written once; `INVARIANT_CHECKS`
 * (src/schema.ts) gathers every area's list for the tests that prove them.
 */
export type InvariantCheck =
  | {
      readonly constraint: string;
      readonly column: AnyPgColumn;
      readonly invariant: Invariant;
      readonly sweep?: InvariantSweep;
    }
  | {
      readonly constraint: string;
      readonly column: AnyPgColumn;
      readonly invariant: RangeInvariant;
    };

/**
 * The CHECK constraint that holds `check.invariant` on `check.column`. A
 * text invariant: the column matches the pattern and, if the invariant has
 * one, is at most its maximum length - the only place a pattern is spliced
 * into SQL, and `defineInvariant` has already refused any pattern with a
 * quote, so the literal cannot break out. A range invariant: the column is
 * at least its minimum and, if it has one, at most its maximum - rendered
 * from integers `defineRangeInvariant` has validated, never from text.
 */
export function invariantCheck({
  constraint,
  column,
  invariant,
}: InvariantCheck) {
  if ('min' in invariant) {
    const atLeast = sql`${column} >= ${sql.raw(String(invariant.min))}`;
    return check(
      constraint,
      invariant.max === undefined
        ? atLeast
        : sql`${atLeast} and ${column} <= ${sql.raw(String(invariant.max))}`,
    );
  }
  const matches = sql`${column} ~ ${sql.raw(`'${invariant.pattern}'`)}`;
  return check(
    constraint,
    invariant.maxLength === undefined
      ? matches
      : sql`${matches} and char_length(${column}) <= ${sql.raw(String(invariant.maxLength))}`,
  );
}
