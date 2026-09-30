import type { StoredTable } from '@sportbet/db';
import { describe, expect, it } from 'vitest';
import type { TableCount } from './map';
import { LOADED_INTO, reconcile } from './reconcile';
import { SPORTBET_TABLES } from './read-columns';

/** Every sportbet table read, loaded and stored as `loaded`, nothing else. */
const counts = (loaded: number): TableCount[] =>
  SPORTBET_TABLES.map((table) => ({
    table,
    read: loaded,
    loaded,
    skipped: {},
    refused: {},
    refusals: [],
  }));

const stored = (rows: number): Record<StoredTable, number> => ({
  tournaments: rows,
  rounds: rows,
  teams: rows,
  team_outcomes: rows,
  games: rows,
  players: rows,
  tournament_players: rows,
  match_predictions: rows,
  standings_predictions: rows,
  survival_picks: rows,
  game_odds: rows,
  match_points: rows,
  standings_points: rows,
  survival_points: rows,
});

describe('reconcile', () => {
  it('finds nothing when every table reconciles and Postgres holds what was loaded', () => {
    expect(reconcile(counts(3), stored(3))).toEqual([]);
  });

  it('names a table whose rows read are not its loaded, skipped and refused rows', () => {
    const tables = counts(3).map((count) =>
      count.table === 'games'
        ? { ...count, read: 5, skipped: { 'not-euroleague': 1 } }
        : count,
    );
    expect(reconcile(tables, stored(3))).toEqual([
      'games: read 5, but loaded 3 + skipped 1 + refused 0 = 4',
    ]);
  });

  it('names a table whose loaded rows are not the rows Postgres holds', () => {
    expect(reconcile(counts(3), { ...stored(3), game_odds: 2 })).toEqual([
      'game_odds: loaded 3, but Postgres holds 2 (game_odds, production)',
    ]);
  });

  it('compares every sportbet table but leagues and league_members, which no table holds', () => {
    expect(
      SPORTBET_TABLES.filter((table) => LOADED_INTO[table] === null),
    ).toEqual(['leagues', 'league_members']);
  });
});
