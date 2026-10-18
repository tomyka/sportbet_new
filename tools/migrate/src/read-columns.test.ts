import { describe, expect, it } from 'vitest';
import { columnsOf, expectedType, SPORTBET_TABLES } from './read-columns';

/**
 * Sign-in material and Google's id (4c) and an address waiting for its code:
 * never selected from any table. (A league's payment details are read
 * since R-103, under these columns' rules.)
 */
const FORBIDDEN_COLUMNS: readonly string[] = [
  'google_id',
  'remember_token',
  'ip_address',
  'password',
  'pending_email',
  'use_league_odds',
];

/** Tables the reader never reads at all. */
const UNREAD_TABLES: readonly string[] = [
  'audit_logins',
  'audit_prediction_games',
  'audit_prediction_survival',
  'login_codes',
  'sessions',
  'settings',
  'points_calculations',
  'league_game_odds',
];

describe('READ_COLUMNS', () => {
  it("reads a user's id, username, name, surname, email and creation time (R-114) - the owner's consent for 4b - and never a pending address", () => {
    expect(columnsOf('users')).toEqual([
      'id',
      'username',
      'name',
      'surname',
      'email',
      'created_at',
    ]);
  });

  it("reads a tournament's profile - status, start date, sport, description, public switch - and never its cover image", () => {
    expect(columnsOf('tournaments')).toEqual([
      'id',
      'slug',
      'name',
      'standings_format',
      'standings_deadline_round',
      'end_date',
      'survival_game',
      'sport',
      'status',
      'start_date',
      'description',
      'is_public',
    ]);
  });

  it("reads a user's switch, admin level, locale and reminder opt-in from user_settings, and when a reminder was sent from prediction_results (R-97)", () => {
    expect(columnsOf('user_settings')).toEqual([
      'user_id',
      'active',
      'admin',
      'locale',
      'receive_reminders',
    ]);
    expect(columnsOf('prediction_results')).toContain('reminded_at');
  });

  it('reads what leagues are (#29, R-103): their names, fees and payment details, who is in them, the amounts paid, the pending invites and the messages', () => {
    expect(columnsOf('leagues')).toEqual([
      'id',
      'tournament_id',
      'name',
      'description',
      'is_public',
      'owner_id',
      'base_fee',
      'penalty_step',
      'reward_description',
      'payment_beneficiary',
      'payment_iban',
      'payment_note',
      'created_at',
    ]);
    expect(columnsOf('league_members')).toEqual([
      'id',
      'league_id',
      'user_id',
      'is_admin',
      'is_guest',
      'active',
      'paid_amount',
      'created_at',
    ]);
    expect(columnsOf('league_invites')).toEqual([
      'id',
      'league_id',
      'invited_user_id',
      'invited_by_id',
      'status',
      'created_at',
    ]);
    expect(columnsOf('messages')).toEqual([
      'id',
      'league_id',
      'message',
      'active',
    ]);
  });

  it("reads only a colour row's id and its code (R-136), nothing else of colors", () => {
    expect(columnsOf('colors')).toEqual(['id', 'color_code']);
    expect(expectedType('colors', 'color_code')).toBe('varchar(255)');
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

  it('never reads a Google id, token, IP address, password, pending email or a column nothing uses', () => {
    const read = SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).map((column) => ({ table, column })),
    );
    expect(
      read.filter(({ column }) => FORBIDDEN_COLUMNS.includes(column)),
    ).toEqual([]);
  });

  it('never reads an audit, sign-in or football table', () => {
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
