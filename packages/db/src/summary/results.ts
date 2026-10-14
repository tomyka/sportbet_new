import {
  resultsSummary,
  type Instant,
  type PlayerId,
  type ResultsSummary,
  type RuleSet,
  type TeamId,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadStartedPredictions } from '../prediction/repository';
import { loadLeagueView } from './league-view';

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
    readonly viewer: PlayerId;
    readonly tournament: Tournament;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<ResultsSummaryData> {
  const { viewer, tournament, now, rules } = input;
  const { table, season, standing, roundNames, teamNames } =
    await loadLeagueView(db, tournament, { selectedBy: viewer }, rules);
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
      roundNames,
      current: season.currentRound(now, rules),
    }),
    teamNames,
  };
}
