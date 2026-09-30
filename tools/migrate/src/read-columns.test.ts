import { describe, expect, it } from 'vitest';
import { columnsOf, expectedType, SPORTBET_TABLES } from './read-columns';

/** Personal data and sign-in material: never selected from any table. */
const FORBIDDEN_COLUMNS: readonly string[] = [
  'surname',
  'email',
  'google_id',
  'remember_token',
  'ip_address',
  'password',
];

/** Tables the reader never reads at all. */
const UNREAD_TABLES: readonly string[] = [
  'audit_logins',
  'audit_prediction_games',
  'audit_prediction_survival',
  'login_codes',
  'sessions',
  'league_invites',
  'messages',
  'settings',
  'colors',
  'points_calculations',
  'league_game_odds',
];

describe('READ_COLUMNS', () => {
  it('reads exactly the id and the username of a user: never a name', () => {
    expect(columnsOf('users')).toEqual(['id', 'username']);
  });

  it('reads only which tournament a league belongs to, and who is in it', () => {
    expect(columnsOf('leagues')).toEqual(['id', 'tournament_id']);
    expect(columnsOf('league_members')).toEqual(['league_id', 'user_id']);
  });

  it('never reads an email, surname, Google id, token, IP address or password', () => {
    const read = SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).map((column) => ({ table, column })),
    );
    expect(
      read.filter(({ column }) => FORBIDDEN_COLUMNS.includes(column)),
    ).toEqual([]);
  });

  it('never reads an audit, sign-in, message or football table', () => {
    expect(
      SPORTBET_TABLES.filter((table) => UNREAD_TABLES.includes(table)),
    ).toEqual([]);
  });

  it("names a MySQL type for every column, as sportbet's migrations give it", () => {
    expect(expectedType('users', 'username')).toBe('varchar(255)');
    expect(expectedType('point_standings', 'group_position_points')).toBe(
      'double',
    );
    const untyped = SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).filter(
        (column) => !/^[a-z]/.test(expectedType(table, column)),
      ),
    );
    expect(untyped).toEqual([]);
  });
});
