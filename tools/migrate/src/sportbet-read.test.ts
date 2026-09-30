import { describe, expect, it } from 'vitest';
import { columnsOf, expectedType, SPORTBET_TABLES } from './read-columns';
import { driftOf } from './sportbet-read';

/** Every read column as sportbet's migrations at 0da316f give it. */
const asMigrated = () =>
  new Map(
    SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).map((column): [string, string] => [
        `${table}.${column}`,
        expectedType(table, column),
      ]),
    ),
  );

describe('the schema drift check', () => {
  it("finds none in sportbet's schema at 0da316f, whatever columns it added besides", () => {
    const found = asMigrated();
    found.set('users.locale', 'varchar(5)');
    found.set('games.reminder_sent', 'tinyint(1)');
    expect(driftOf(found)).toEqual([]);
  });

  it('names a read column that is missing', () => {
    const found = asMigrated();
    found.delete('users.username');
    expect(driftOf(found)).toEqual(['users.username: missing']);
  });

  it('names a read column whose type changed', () => {
    const found = asMigrated();
    found.set('point_standings.final_points', 'decimal(10,4)');
    expect(driftOf(found)).toEqual([
      'point_standings.final_points: expected double, found decimal(10,4)',
    ]);
  });
});
