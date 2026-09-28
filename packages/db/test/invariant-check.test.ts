import { defineInvariant, slugInvariant } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { tournaments } from '../src/schema';
import { useTestDatabase } from '../src/testing';
import {
  invariantDisagreements,
  type InvariantCheck,
} from '../src/testing/invariant-check';

const { client } = useTestDatabase();

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
