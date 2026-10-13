import {
  resultsSummary,
  type Instant,
  type ResultsSummary,
  type RuleSet,
  type TeamId,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { readLeagueTable } from '../dashboard/league-table';
import { loadStartedPredictions } from '../prediction/repository';
import { loadRoundNames } from '../season/repository';
import { loadTeamNames } from '../team/repository';

/** The results summary as the domain decided it, with the team names it shows. */
export interface ResultsSummaryData {
  readonly summary: ResultsSummary;
  readonly teamNames: ReadonlyMap<TeamId, string>;
}

/**
 * PredictionResultController::getPredictionResultSummary over the request's
 * tournament (R-86): the league table's rows for the columns' order (R-102),
 * the listed players' predictions on games no longer open, and the round
 * names; resultsSummary decides everything shown. It only loads.
 */
export async function loadResultsSummary(
  db: Executor,
  input: {
    readonly tournament: Tournament;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<ResultsSummaryData> {
  const { tournament, now, rules } = input;
  const { table, season, standing } = await readLeagueTable(
    db,
    tournament,
    rules,
  );
  return {
    summary: resultsSummary({
      season,
      now,
      table: table.rows,
      rows: standing.rows,
      predictions: await loadStartedPredictions(db, {
        tournament,
        players: [...standing.listed],
        now,
      }),
      roundNames: await loadRoundNames(db, tournament),
      current: season.currentRound(now, rules),
    }),
    teamNames: await loadTeamNames(db, tournament),
  };
}
