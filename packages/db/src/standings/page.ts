import {
  standingsLadder,
  type Instant,
  type PlayerId,
  type StandingsPage,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';
import { playerRowsIn } from './repository';

/**
 * PredictionStandingController::getPredictionStandingsUser: the
 * tournament's teams with the player's own rows (a team with none shown
 * blank), and the deadline (Season.standingsDeadline, ST-2), as
 * standingsLadder lays them out.
 */
export async function loadStandingsPage(
  db: Executor,
  input: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    readonly now: Instant;
  },
): Promise<StandingsPage> {
  const { player, tournament, now } = input;
  const teams = await listTeams(db, tournament);
  const rows = await playerRowsIn(db, player, tournament);
  const season = await loadSeason(db, tournament);
  return standingsLadder({ teams, rows, now, season });
}
