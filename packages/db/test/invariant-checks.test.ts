import { defineInvariant, slugInvariant } from '@sportbet/domain';
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { InvariantCheck } from '../src/invariant';
import { INVARIANT_CHECKS, tournaments } from '../src/schema';
import { describeInvariantCheck, useTestDatabase } from '../src/testing';
import { invariantDisagreements } from '../src/testing/invariant-check';

const { client } = useTestDatabase();

/**
 * `table.constraint` of each CHECK in the database that holds no domain
 * invariant, each with the reason it cannot be one. Empty today: every CHECK
 * is built from an invariant and listed in INVARIANT_CHECKS.
 */
const NON_INVARIANT_CHECKS: readonly string[] = [];

const qualified = ({ column, constraint }: InvariantCheck) =>
  `${getTableName(column.table)}.${constraint}`;

for (const check of INVARIANT_CHECKS) describeInvariantCheck(client, check);

describe('INVARIANT_CHECKS', () => {
  it('lists every CHECK in the database but the allowed others', async () => {
    const result = await client.query(
      `select conrelid::regclass::text || '.' || conname as name
       from pg_constraint
       where contype = 'c' and conrelid <> 0
         and connamespace = 'public'::regnamespace`,
    );
    const inDatabase = z
      .array(z.object({ name: z.string() }))
      .parse(result.rows)
      .map(({ name }) => name);
    expect(inDatabase.toSorted()).toEqual(
      [...INVARIANT_CHECKS.map(qualified), ...NON_INVARIANT_CHECKS].toSorted(),
    );
  });

  it('are what refuses a row that breaks an invariant, by name', async () => {
    await expect(
      client.query(
        'insert into tournaments (slug, name, format) values ($1, $2, $3)',
        ['Euro 2028', 'Euro 2028', 'football'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'tournaments_slug_format',
    });
  });
});

const slugCheck: InvariantCheck = {
  invariant: slugInvariant,
  column: tournaments.slug,
  constraint: 'tournaments_slug_format',
};

describe('invariantDisagreements', () => {
  it('finds none where the CHECK holds the invariant', async () => {
    const values = [...slugInvariant.accepts, ...slugInvariant.refuses].map(
      ({ value }) => value,
    );
    expect(await invariantDisagreements(client, slugCheck, values)).toEqual([]);
  });

  it('finds the inputs only the CHECK accepts', async () => {
    const stricter = defineInvariant({
      ...slugInvariant,
      maxLength: 50,
      accepts: [],
      refuses: [],
    });
    const long = 'a'.repeat(60);
    expect(
      await invariantDisagreements(
        client,
        { ...slugCheck, invariant: stricter },
        ['euro-2028', long],
      ),
    ).toEqual([long]);
  });

  it('finds the inputs only the domain accepts', async () => {
    const looser = defineInvariant({
      ...slugInvariant,
      pattern: '^[a-z0-9_-]+$',
      accepts: [],
      refuses: [],
    });
    expect(
      await invariantDisagreements(
        client,
        { ...slugCheck, invariant: looser },
        ['euro-2028', 'euro_2028'],
      ),
    ).toEqual(['euro_2028']);
  });

  it('fails when the table has no CHECK of that name', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, constraint: 'tournaments_no_such_check' },
        ['euro-2028'],
      ),
    ).rejects.toThrow(/tournaments_no_such_check/);
  });

  // The CHECK is evaluated over text values with the default collation, so
  // on any other column type its verdict would not be the table's.
  it('refuses a column that is not text', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.format },
        ['football'],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.format/);
  });

  it('fails when the CHECK is not on that column', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.name },
        ['euro-2028'],
      ),
    ).rejects.toThrow(/slug/);
  });
});
