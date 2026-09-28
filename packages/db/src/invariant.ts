import type { Invariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * The CHECK constraint that holds `invariant` on `column`: the column matches
 * the pattern and, if the invariant has one, is at most its maximum length.
 * The only place a pattern is spliced into SQL: `defineInvariant` has
 * already refused any pattern with a quote, so the literal cannot break out.
 */
export function invariantCheck(
  name: string,
  column: AnyPgColumn,
  invariant: Invariant,
) {
  const matches = sql`${column} ~ ${sql.raw(`'${invariant.pattern}'`)}`;
  return check(
    name,
    invariant.maxLength === undefined
      ? matches
      : sql`${matches} and char_length(${column}) <= ${sql.raw(String(invariant.maxLength))}`,
  );
}
