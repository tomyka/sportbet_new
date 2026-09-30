import { everyBmpCharacter } from '@sportbet/domain/testing';
import { getTableName } from 'drizzle-orm';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { InvariantCheck, InvariantSweep } from '../invariant';

const SWEEPS: Readonly<Record<InvariantSweep, () => string[]>> = {
  'every BMP character': everyBmpCharacter,
};

/** A value a CHECK is asked about: text for a text invariant, a whole number for a range. */
type Candidate = string | number;

const expressions = z.array(z.object({ expression: z.string() }));
const columnTypes = z.array(
  z.object({ type: z.string(), text: z.boolean(), whole: z.boolean() }),
);
const verdicts = z.array(z.object({ holds: z.boolean() }));

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * The column's SQL type, if an invariant CHECK can be evaluated on it: a
 * text invariant on text with the default collation, a range invariant on
 * smallint, integer or numeric. The values stand in for the column as that
 * type; on any other type or collation the verdict could differ from the
 * table's.
 */
async function candidateType(
  client: pg.Pool,
  { column, invariant }: InvariantCheck,
): Promise<string> {
  const table = getTableName(column.table);
  const described = await client.query(
    `select format_type(a.atttypid, a.atttypmod) as type,
            a.atttypid = 'text'::regtype
              and a.attcollation = (select oid from pg_collation where collname = 'default')
              as text,
            a.atttypid in ('smallint'::regtype, 'integer'::regtype, 'numeric'::regtype)
              as whole
     from pg_attribute a
     where a.attrelid = to_regclass(quote_ident($1)) and a.attname = $2
       and a.attnum > 0 and not a.attisdropped`,
    [table, column.name],
  );
  const [attribute] = columnTypes.parse(described.rows);
  if (attribute === undefined) {
    throw new Error(`table ${table} has no column ${column.name}`);
  }
  const range = 'min' in invariant;
  if (range ? !attribute.whole : !attribute.text) {
    throw new Error(
      `unsupported column ${table}.${column.name}: a text invariant CHECK is evaluated only on text with the default collation, a range invariant CHECK only on smallint, integer or numeric`,
    );
  }
  return attribute.type;
}

/**
 * The CHECK's verdict on each value, from the constraint as the migrated
 * database holds it (not as the TypeScript schema would build it). The
 * expression is evaluated over the values in one query, with each value
 * standing in for the column; like a CHECK, a null result counts as holding.
 */
async function checkVerdicts(
  client: pg.Pool,
  check: InvariantCheck,
  values: readonly Candidate[],
): Promise<boolean[]> {
  const { column, constraint } = check;
  const table = getTableName(column.table);
  const type = await candidateType(client, check);
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
     from unnest($1::${type}[]) with ordinality
       as candidate(${quoteIdentifier(column.name)}, invariant_check_ordinal)
     order by invariant_check_ordinal`,
    [values.map(String)],
  );
  return verdicts.parse(result.rows).map((row) => row.holds);
}

/** The values on which the domain schema and the database CHECK disagree. */
export async function invariantDisagreements(
  client: pg.Pool,
  check: InvariantCheck,
  values: readonly Candidate[],
): Promise<Candidate[]> {
  const database = await checkVerdicts(client, check, values);
  return values.filter(
    (value, index) =>
      check.invariant.schema.safeParse(value).success !== database[index],
  );
}

/** A value as code points, so an invisible character is readable in a failure. */
const codePoints = (value: Candidate) =>
  Array.from(
    String(value),
    (character) =>
      `U+${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  ).join(' ');

interface Example {
  readonly label: string;
  readonly value: Candidate;
}

/**
 * Registers the tests that prove the domain schema and the database CHECK
 * accept and refuse exactly the same inputs: every example the invariant
 * carries, one test each, and the check's sweep if it has one - further
 * inputs on which the two sides only have to agree.
 */
export function describeInvariantCheck(
  client: pg.Pool,
  check: InvariantCheck,
): void {
  const { invariant, constraint } = check;
  const accepts: readonly Example[] = invariant.accepts;
  const refuses: readonly Example[] = invariant.refuses;
  const sweep = 'sweep' in check ? SWEEPS[check.sweep]() : undefined;
  const verdict = async (value: Candidate) => {
    const [holds] = await checkVerdicts(client, check, [value]);
    return {
      domain: invariant.schema.safeParse(value).success,
      database: holds,
    };
  };

  describe(`the ${invariant.name} invariant and CHECK ${constraint}`, () => {
    it.each(accepts)('both accept $label', async ({ value }) => {
      expect(await verdict(value)).toEqual({ domain: true, database: true });
    });

    it.each(refuses)('both refuse $label', async ({ value }) => {
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
