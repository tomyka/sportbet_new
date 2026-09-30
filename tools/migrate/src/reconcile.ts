import { POINTS_TABLES, type StoredTable } from '@sportbet/db';
import type { TableCount } from './map';
import type { SportbetTable } from './read-columns';

/**
 * The Postgres table each sportbet table's loaded rows go to, whose row
 * count must equal them: a points table's `production` rows, each user's
 * one player (and one `user_settings` row, whose `active` becomes the
 * player's switch in each tournament). `leagues` and `league_members` are
 * read only to decide who plays a tournament, and no table holds them.
 */
export const LOADED_INTO: Readonly<Record<SportbetTable, StoredTable | null>> =
  {
    tournaments: 'tournaments',
    events: 'rounds',
    teams: 'teams',
    games: 'games',
    game_odds: 'game_odds',
    users: 'players',
    user_settings: 'players',
    leagues: null,
    league_members: null,
    prediction_results: 'match_predictions',
    prediction_standings: 'standings_predictions',
    prediction_survivals: 'survival_picks',
    point_results: 'match_points',
    point_standings: 'standings_points',
    point_survivals: 'survival_points',
  };

const POINTS: ReadonlySet<string> = new Set(POINTS_TABLES);

const total = (counts: Readonly<Record<string, number>>) =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

/**
 * Every way the load fails to reconcile, one line per table, counts only:
 * a table whose rows read are not its loaded, skipped and refused rows, or
 * whose loaded rows are not the rows Postgres holds (`stored`, the
 * `production` rows of a points table). Empty when the load reconciles.
 */
export function reconcile(
  tables: readonly TableCount[],
  stored: Readonly<Record<StoredTable, number>>,
): string[] {
  return tables.flatMap(({ table, read, loaded, skipped, refused }) => {
    const lines: string[] = [];
    const skips = total(skipped);
    const refusals = total(refused);
    if (read !== loaded + skips + refusals) {
      lines.push(
        `${table}: read ${String(read)}, but loaded ${String(loaded)} + skipped ${String(skips)} + refused ${String(refusals)} = ${String(loaded + skips + refusals)}`,
      );
    }
    const into = LOADED_INTO[table];
    if (into !== null && stored[into] !== loaded) {
      lines.push(
        `${table}: loaded ${String(loaded)}, but Postgres holds ${String(stored[into])} (${into}${POINTS.has(into) ? ', production' : ''})`,
      );
    }
    return lines;
  });
}
