import { describe, expect, it } from 'vitest';
import {
  columnsOf,
  expectedNullable,
  expectedType,
  SPORTBET_TABLES,
} from './read-columns';
import { driftOf, sportbetTypeCast, type FoundColumn } from './sportbet-read';

/** Every read column as sportbet's migrations at 3eb95e7 give it. */
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
  it("finds none in sportbet's schema at 3eb95e7, whatever columns it added besides", () => {
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

type CastField = Parameters<typeof sportbetTypeCast>[0];

/** A column as mysql2 hands it to typeCast; the value is read through `next`. */
const fieldOf = (type: CastField['type']): CastField => ({
  type,
  length: 0,
  db: 'sportbet',
  table: 'any',
  name: 'any',
  string: () => null,
  buffer: () => null,
  geometry: () => null,
});

describe('the connection typeCast', () => {
  it('keeps a TEXT column, which mysql2 types BLOB, as the text mysql2 decoded as utf8mb4', () => {
    const text = 'Sveiki ąčęėįšųūž ĄČĘĖĮŠŲŪŽ';
    expect(sportbetTypeCast(fieldOf('BLOB'), () => text)).toBe(text);
  });

  it('reads a binary BLOB one character per byte, so an unexpected byte is kept', () => {
    const bytes = Buffer.from([0x32, 0xc4, 0x97]);
    expect(sportbetTypeCast(fieldOf('BLOB'), () => bytes)).toBe('2Ä\u0097');
  });

  it('keeps a null BLOB or TEXT null', () => {
    expect(sportbetTypeCast(fieldOf('BLOB'), () => null)).toBeNull();
  });

  it('reads a double as its shortest text and leaves every other type to mysql2', () => {
    const double: CastField = { ...fieldOf('DOUBLE'), string: () => '0.1' };
    expect(sportbetTypeCast(double, () => 0.1)).toBe('0.1');
    expect(sportbetTypeCast(fieldOf('LONG'), () => 7)).toBe(7);
  });
});
