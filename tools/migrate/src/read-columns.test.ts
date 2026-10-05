import { describe, expect, it } from 'vitest';
import { columnsOf, expectedType, SPORTBET_TABLES } from './read-columns';

/**
 * Sign-in material and Google's id (4c), an address waiting for its code
 * and a league's payment details (sportbet 3eb95e7): never selected from
 * any table.
 */
const FORBIDDEN_COLUMNS: readonly string[] = [
  'google_id',
  'remember_token',
  'ip_address',
  'password',
  'pending_email',
  'payment_beneficiary',
  'payment_iban',
  'payment_note',
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
  it("reads a user's id, username, name, surname and email - the owner's consent for 4b - and nothing else", () => {
    expect(columnsOf('users')).toEqual([
      'id',
      'username',
      'name',
      'surname',
      'email',
    ]);
  });

  it("reads a user's switch, admin level and locale from user_settings", () => {
    expect(columnsOf('user_settings')).toEqual([
      'user_id',
      'active',
      'admin',
      'locale',
    ]);
  });

  it('reads only which tournament a league belongs to, and who is in it', () => {
    expect(columnsOf('leagues')).toEqual(['id', 'tournament_id']);
    expect(columnsOf('league_members')).toEqual(['league_id', 'user_id']);
  });

  it("reads a points row's components, odds and serija bonus, and no odds_points (dropped in sportbet 5de13bd)", () => {
    expect(columnsOf('point_results')).toEqual([
      'id',
      'user_id',
      'game_id',
      'winner_points',
      'difference_points',
      'bingo_points',
      'odds',
      'full_points',
      'streak_bonus',
    ]);
  });

  it('never reads a Google id, token, IP address, password, pending email or payment detail', () => {
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
