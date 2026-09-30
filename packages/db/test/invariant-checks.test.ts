import {
  defineInvariant,
  defineRangeInvariant,
  roundNumberInvariant,
  slugInvariant,
} from '@sportbet/domain';
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
        `insert into tournaments (slug, name, format, ends_on, survival)
         values ($1, $2, $3, $4, $5)`,
        [
          'Euroleague 2026/27',
          'Euroleague 2026/27',
          'euroleague',
          '2027-05-23',
          true,
        ],
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

const deadlineCheck: InvariantCheck = {
  invariant: roundNumberInvariant,
  column: tournaments.standingsDeadlineRound,
  constraint: 'tournaments_deadline_round_positive',
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
        ['euroleague-2026-27', long],
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
        ['euroleague-2026-27', 'euroleague_2026'],
      ),
    ).toEqual(['euroleague_2026']);
  });

  it('fails when the table has no CHECK of that name', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, constraint: 'tournaments_no_such_check' },
        ['euroleague-2026-27'],
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
        ['euroleague'],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.format/);
  });

  it('refuses a text invariant on a column that is not text, and a range invariant on text', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.standingsDeadlineRound },
        ['euroleague-2026-27'],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.standings_deadline_round/);
    await expect(
      invariantDisagreements(
        client,
        { ...deadlineCheck, column: tournaments.slug },
        [1],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.slug/);
  });

  it('finds none where a range CHECK holds its invariant', async () => {
    const values = [
      ...roundNumberInvariant.accepts,
      ...roundNumberInvariant.refuses,
    ].map(({ value }) => value);
    expect(await invariantDisagreements(client, deadlineCheck, values)).toEqual(
      [],
    );
  });

  it('finds the whole numbers only one side of a range accepts', async () => {
    const capped = defineRangeInvariant({
      ...roundNumberInvariant,
      max: 3,
      accepts: [],
      refuses: [],
    });
    expect(
      await invariantDisagreements(
        client,
        { ...deadlineCheck, invariant: capped },
        [0, 1, 4],
      ),
    ).toEqual([4]);
  });

  it('fails when the CHECK is not on that column', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.name },
        ['euroleague-2026-27'],
      ),
    ).rejects.toThrow(/slug/);
  });
});
