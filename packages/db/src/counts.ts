import { count, eq } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Executor } from './client';
import { players, tournamentPlayers } from './player/schema';
import {
  gameOdds,
  matchPoints,
  standingsPoints,
  survivalPoints,
  type PointsSource,
} from './points/schema';
import { matchPredictions } from './prediction/schema';
import { games, rounds } from './season/schema';
import { standingsPredictions } from './standings/schema';
import { survivalPicks } from './survival/schema';
import { teamOutcomes, teams } from './team/schema';
import { tournaments } from './tournament/schema';

/** Every table a load writes, as the reader reconciles its counts. */
export const STORED_TABLES = [
  'tournaments',
  'rounds',
  'teams',
  'team_outcomes',
  'games',
  'players',
  'tournament_players',
  'match_predictions',
  'standings_predictions',
  'survival_picks',
  'game_odds',
  'match_points',
  'standings_points',
  'survival_points',
] as const;

export type StoredTable = (typeof STORED_TABLES)[number];

const counted = z.tuple([z.object({ rows: z.int() })]);

/**
 * The rows each table a load writes holds, across every tournament; a
 * points table's for the named `source` only, as its other sources are
 * derived rows, not loaded ones.
 */
export async function countStoredRows(
  db: Executor,
  source: PointsSource,
): Promise<Record<StoredTable, number>> {
  const all = async (table: AnyPgTable) => {
    const [{ rows }] = counted.parse(
      await db.select({ rows: count() }).from(table),
    );
    return rows;
  };
  const ofSource = async (
    table:
      | typeof gameOdds
      | typeof matchPoints
      | typeof standingsPoints
      | typeof survivalPoints,
  ) => {
    const [{ rows }] = counted.parse(
      await db
        .select({ rows: count() })
        .from(table)
        .where(eq(table.source, source)),
    );
    return rows;
  };
  return {
    tournaments: await all(tournaments),
    rounds: await all(rounds),
    teams: await all(teams),
    team_outcomes: await all(teamOutcomes),
    games: await all(games),
    players: await all(players),
    tournament_players: await all(tournamentPlayers),
    match_predictions: await all(matchPredictions),
    standings_predictions: await all(standingsPredictions),
    survival_picks: await all(survivalPicks),
    game_odds: await ofSource(gameOdds),
    match_points: await ofSource(matchPoints),
    standings_points: await ofSource(standingsPoints),
    survival_points: await ofSource(survivalPoints),
  };
}
