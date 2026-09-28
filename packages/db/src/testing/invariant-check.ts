import type { Invariant } from '@sportbet/domain';
import { getTableName } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/** An invariant, and the CHECK on one column that holds it in the database. */
export interface InvariantCheck {
  readonly invariant: Invariant;
  readonly column: AnyPgColumn;
  /** The CHECK constraint's name, as `invariantCheck` was given it. */
  readonly constraint: string;
}

const expressions = z.array(z.object({ expression: z.string() }));
const columnSupport = z.array(z.object({ supported: z.boolean() }));
const verdicts = z.array(z.object({ holds: z.boolean() }));

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * The CHECK's verdict on each value, from the constraint as the migrated
 * database holds it (not as the TypeScript schema would build it). The
 * expression is evaluated over the values in one query, with each value
 * standing in for the column; like a CHECK, a null result counts as holding.
 */
async function checkVerdicts(
  client: pg.Pool,
  { column, constraint }: InvariantCheck,
  values: readonly string[],
): Promise<boolean[]> {
  const table = getTableName(column.table);
  // The values stand in for the column as `text` with the default collation;
  // on a column of any other type or collation the verdict could differ.
  const described = await client.query(
    `select a.atttypid = 'text'::regtype
            and a.attcollation = (select oid from pg_collation where collname = 'default')
            as supported
     from pg_attribute a
     where a.attrelid = to_regclass(quote_ident($1)) and a.attname = $2
       and a.attnum > 0 and not a.attisdropped`,
    [table, column.name],
  );
  const [attribute] = columnSupport.parse(described.rows);
  if (attribute === undefined) {
    throw new Error(`table ${table} has no column ${column.name}`);
  }
  if (!attribute.supported) {
    throw new Error(
      `unsupported column ${table}.${column.name}: an invariant CHECK is evaluated only on text with the default collation`,
    );
  }
  const found = await client.query(
    `select pg_get_expr(conbin, conrelid) as expression from pg_constraint
     where contype = 'c' and conname = $1 and conrelid = to_regclass(quote_ident($2))`,
    [constraint, table],
  );
  const [only, ...more] = expressions.parse(found.rows);
  if (only === undefined || more.length > 0) {
    throw new Error(`table ${table} has no CHECK named ${constraint}`);
  }
  const result = await client.query(
    `select coalesce((${only.expression}), true) as holds
     from unnest($1::text[]) with ordinality
       as candidate(${quoteIdentifier(column.name)}, invariant_check_ordinal)
     order by invariant_check_ordinal`,
    [values],
  );
  return verdicts.parse(result.rows).map((row) => row.holds);
}

/** The values on which the domain schema and the database CHECK disagree. */
export async function invariantDisagreements(
  client: pg.Pool,
  check: InvariantCheck,
  values: readonly string[],
): Promise<string[]> {
  const database = await checkVerdicts(client, check, values);
  return values.filter(
    (value, index) =>
      check.invariant.schema.safeParse(value).success !== database[index],
  );
}

/** A value as code points, so an invisible character is readable in a failure. */
const codePoints = (value: string) =>
  Array.from(
    value,
    (character) =>
      `U+${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  ).join(' ');

/**
 * Registers the tests that prove the domain schema and the database CHECK
 * accept and refuse exactly the same inputs: every example the invariant
 * carries, one test each, and, if given, `sweep` - further inputs (too many
 * to list as examples) on which the two sides only have to agree.
 */
export function describeInvariantCheck(
  client: pg.Pool,
  check: InvariantCheck,
  sweep?: readonly string[],
): void {
  const { invariant, constraint } = check;
  const verdict = async (value: string) => {
    const [holds] = await checkVerdicts(client, check, [value]);
    return {
      domain: invariant.schema.safeParse(value).success,
      database: holds,
    };
  };

  describe(`the ${invariant.name} invariant and CHECK ${constraint}`, () => {
    it.each(invariant.accepts)('both accept $label', async ({ value }) => {
      expect(await verdict(value)).toEqual({ domain: true, database: true });
    });

    it.each(invariant.refuses)('both refuse $label', async ({ value }) => {
      expect(await verdict(value)).toEqual({ domain: false, database: false });
    });

    if (sweep !== undefined) {
      it(`agree on ${String(sweep.length)} further inputs`, async () => {
        const disagreements = await invariantDisagreements(
          client,
          check,
          sweep,
        );
        expect(disagreements.map(codePoints)).toEqual([]);
      });
    }
  });
}
