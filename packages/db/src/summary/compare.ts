import {
  comparePlayers,
  type CompareRefusal,
  type Comparison,
  type PlayerId,
  type Result,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadLeagueView } from './league-view';

/**
 * CompareController::show over the request's tournament: the league table's
 * rows (a player outside the listed players is `not-listed`) and the round
 * names; comparePlayers decides everything shown. It only loads.
 */
export async function loadCompare(
  db: Executor,
  input: {
    readonly viewer: PlayerId;
    readonly other: PlayerId;
    readonly tournament: Tournament;
  },
): Promise<Result<Comparison, CompareRefusal>> {
  const { viewer, other, tournament } = input;
  const { table, season, standing, roundNames } = await loadLeagueView(
    db,
    tournament,
    { selectedBy: viewer },
  );
  return comparePlayers({
    season,
    table: table.rows,
    rows: standing.rows,
    roundNames,
    viewer,
    other,
  });
}
