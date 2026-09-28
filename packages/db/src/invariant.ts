import type { Invariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Further inputs, too many to list as examples, on which the domain and the
 * CHECK must also agree; the test entry (src/testing) generates them.
 */
export type InvariantSweep = 'every BMP character';

/**
 * A CHECK on one column that holds a domain invariant. Each area lists its
 * own beside its table and builds the table's checks from that list, so the
 * constraint name is written once; `INVARIANT_CHECKS` (src/schema.ts)
 * gathers every area's list for the tests that prove them.
 */
export interface InvariantCheck {
  readonly constraint: string;
  readonly column: AnyPgColumn;
  readonly invariant: Invariant;
  readonly sweep?: InvariantSweep;
}

/**
 * The CHECK constraint that holds `invariant` on `column`: the column matches
 * the pattern and, if the invariant has one, is at most its maximum length.
 * The only place a pattern is spliced into SQL: `defineInvariant` has
 * already refused any pattern with a quote, so the literal cannot break out.
 */
export function invariantCheck({
  constraint,
  column,
  invariant,
}: InvariantCheck) {
  const matches = sql`${column} ~ ${sql.raw(`'${invariant.pattern}'`)}`;
  return check(
    constraint,
    invariant.maxLength === undefined
      ? matches
      : sql`${matches} and char_length(${column}) <= ${sql.raw(String(invariant.maxLength))}`,
  );
}
