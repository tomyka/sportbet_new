import type { Db } from '@sportbet/db';
import { JONAS_ACCOUNT } from './accounts';
import type { Browser } from './browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from './hub';
import {
  saveTournamentWithGames,
  type PlannedTournament,
} from './registration';

/** What the tests ask Postgres directly: the test database's pool. */
export interface Sql {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** `plan`'s two games (saveTournamentWithGames): round 1's and round 5's. */
export const gamesOf = (plan: PlannedTournament) =>
  [plan.id * 10 + 1, plan.id * 10 + 5] as const;

/**
 * Saves `plan` (each a tournament with two games, registration.ts) and
 * makes Jonas (player 1) one of its players with a blank row per game, as
 * joining writes.
 */
export async function savePlaying(
  db: Db,
  sql: Sql,
  ...plans: readonly PlannedTournament[]
): Promise<void> {
  for (const plan of plans) {
    await saveTournamentWithGames(db, plan);
    await withProfile(db, plan.tournament.slug, ACTIVE_PROFILE);
  }
  for (const plan of plans) {
    await sql.query(
      'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values ($1, 1, false, false, 0) on conflict do nothing',
      [plan.id],
    );
    for (const game of gamesOf(plan)) {
      await sql.query(
        "insert into match_predictions (player_id, game_id, origin) values (1, $1, 'real') on conflict do nothing",
        [game],
      );
    }
  }
}

/** Jonas, signed in, playing `plans` (savePlaying). */
export async function jonasPlaying(
  db: Db,
  sql: Sql,
  baseUrl: string,
  ...plans: readonly PlannedTournament[]
): Promise<Browser> {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await savePlaying(db, sql, ...plans);
  return browser;
}
