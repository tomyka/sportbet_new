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
import { readLeagueTable } from '../dashboard/league-table';
import { loadRoundNames } from '../season/repository';

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
  const { table, season, standing } = await readLeagueTable(
    db,
    tournament,
    rules,
  );
  return comparePlayers({
    season,
    table: table.rows,
    rows: standing.rows,
    roundNames: await loadRoundNames(db, tournament),
    viewer,
    other,
  });
}
