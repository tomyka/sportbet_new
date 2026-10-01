import { describe, expect, it } from 'vitest';
import {
  columnsOf,
  expectedNullable,
  expectedType,
  SPORTBET_TABLES,
} from './read-columns';
import { driftOf, type FoundColumn } from './sportbet-read';

/** Every read column as sportbet's migrations at 1ac955f give it. */
const asMigrated = () =>
  new Map(
    SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).map((column): [string, FoundColumn] => [
        `${table}.${column}`,
        {
          type: expectedType(table, column),
          nullable: expectedNullable(table, column),
        },
      ]),
    ),
  );

describe('the schema drift check', () => {
  it("finds none in sportbet's schema at 1ac955f, whatever columns it added besides", () => {
    const found = asMigrated();
    found.set('users.locale', { type: 'varchar(5)', nullable: true });
    found.set('games.reminder_sent', { type: 'tinyint(1)', nullable: false });
    expect(driftOf(found)).toEqual([]);
  });

  it('names a read column that is missing', () => {
    const found = asMigrated();
    found.delete('users.username');
    expect(driftOf(found)).toEqual(['users.username: missing']);
  });

  it('names a read column whose type changed', () => {
    const found = asMigrated();
    found.set('point_standings.final_points', {
      type: 'decimal(10,4)',
      nullable: true,
    });
    expect(driftOf(found)).toEqual([
      'point_standings.final_points: expected double, found decimal(10,4)',
    ]);
  });

  it('names a read column that became nullable, or stopped being so', () => {
    const found = asMigrated();
    found.set('users.username', { type: 'varchar(255)', nullable: true });
    found.set('games.home_team_score', { type: 'smallint', nullable: false });
    expect(driftOf(found)).toEqual([
      'games.home_team_score: expected nullable, found not null',
      'users.username: expected not null, found nullable',
    ]);
  });
});
