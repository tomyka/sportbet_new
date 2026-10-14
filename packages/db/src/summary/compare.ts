import {
  comparePlayers,
  type CompareRefusal,
  type Comparison,
  type PlayerId,
  type Result,
  type RuleSet,
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
    readonly rules: RuleSet;
  },
): Promise<Result<Comparison, CompareRefusal>> {
  const { viewer, other, tournament, rules } = input;
  const { table, season, standing, roundNames } = await loadLeagueView(
    db,
    tournament,
    { selectedBy: viewer },
    rules,
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
