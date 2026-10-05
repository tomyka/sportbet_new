import { foldEmail } from '@sportbet/domain';
import { everyBmpCharacter } from '@sportbet/domain/testing';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDatabase } from '../src/testing';

const { client } = useTestDatabase();

const folded = z.array(z.object({ value: z.string(), folded: z.string() }));

it('email_fold() drops the accents of Lithuanian letters', async () => {
  const result = await client.query(
    'select $1::text as value, email_fold($1) as folded',
    ['ąčęėįšųūž@example.lt'],
  );
  expect(folded.parse(result.rows)).toEqual([
    { value: 'ąčęėįšųūž@example.lt', folded: 'aceeisuuz@example.lt' },
  ]);
});

it.each([
  ['straße@example.de', 'strasse@example.de'],
  ['łukasz@example.pl', 'lukasz@example.pl'],
  ['ｊonas@example.lt', 'jonas@example.lt'],
  ['þór.ærø.cœur.søren.đorđe.yıldız@x', 'thor.aero.coeur.soren.dorde.yildiz@x'],
])('email_fold() folds %s as %s', async (value, expected) => {
  const result = await client.query(
    'select $1::text as value, email_fold($1) as folded',
    [value],
  );
  expect(folded.parse(result.rows)).toEqual([{ value, folded: expected }]);
});

/**
 * The code points whose NFKD Node's Unicode knows and Postgres's does not
 * yet, where the two folds must differ: U+A7F1 (modifier letter capital S,
 * Unicode 17) decomposes to 'S' in Node 24 and not in Postgres 18.6
 * (Unicode 16). Tied to both versions below, so an upgrade on either side
 * fails the test until this list is brought up to date.
 */
const UNICODE_VERSION_GAPS: readonly number[] = [0xa7f1];

// The unique index's key and the domain's foldEmail are one function: on
// every BMP character, in the middle of an address, they agree, except
// where the two sides' Unicode versions differ.
it('email_fold() is foldEmail on every BMP character', async () => {
  const versions = await client.query('select unicode_version() as version');
  expect({
    node: process.versions['unicode'],
    postgres: z.array(z.object({ version: z.string() })).parse(versions.rows),
  }).toEqual({ node: '17.0', postgres: [{ version: '16.0' }] });
  const values = everyBmpCharacter().map((character) => `a${character}@x`);
  const result = await client.query(
    'select value, email_fold(value) as folded from unnest($1::text[]) as value',
    [values],
  );
  const rows = folded.parse(result.rows);
  expect(rows).toHaveLength(values.length);
  const differ = rows
    .filter(({ value, folded: sql }) => sql !== foldEmail(value))
    .map(({ value }) =>
      Array.from(value).map((character) => character.codePointAt(0)),
    );
  expect(differ).toEqual(
    UNICODE_VERSION_GAPS.map((codePoint) => [97, codePoint, 64, 120]),
  );
});
