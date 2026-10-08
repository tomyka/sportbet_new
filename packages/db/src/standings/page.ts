import {
  StandingsTable,
  type Instant,
  type PlayerId,
  type StandingsView,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';
import { playerRowsIn } from './repository';

/**
 * PredictionStandingController::getPredictionStandingsUser: the player's
 * standings table in the tournament - its teams, the player's own rows (a
 * team with none shown blank) and its season (ST-2) - as the page shows it
 * (StandingsTable.view). Unlocked: a page reads, a save locks its own.
 */
export async function loadStandingsPage(
  db: Executor,
  input: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    readonly now: Instant;
  },
): Promise<StandingsView> {
  const { player, tournament, now } = input;
  const teams = await listTeams(db, tournament);
  const rows = await playerRowsIn(db, player, tournament);
  const season = await loadSeason(db, tournament);
  return StandingsTable.at({ teams, rows, season, now }).view();
}
