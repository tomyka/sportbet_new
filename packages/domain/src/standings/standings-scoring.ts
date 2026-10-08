import { standingsOddsTenThousandths } from '../odds/crowd-ratio';
import {
  standingsOddsOfTenThousandths,
  type StandingsOdds,
} from '../points/odds';
import {
  standingsPointsOfTenThousandths,
  standingsPointsWhole,
  type StandingsPoints,
} from '../points/standings-points';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId, TeamId } from '../shared/ids';
import type {
  FinalPlace,
  StandingsStage,
  StandingsPrediction,
  TeamPick,
} from './standings-prediction';
import type { TeamOutcomes } from './team-outcomes';

/** Euroleague's standings points (sportbet config/standings.php, #92). */
export const STANDINGS_POINTS = Object.freeze({
  placeBase: 190,
  placeStep: 10,
  playOffs: 60,
  finalFour: 120,
});

/**
 * sportbet's final matrix, [predicted][actual] (ST-7,
 * StandingScoringService::calculateFinalPoints). A Euroleague entry uses its
 * top-left corner; places 3 and 4 reach it only from stored rows.
 */
const FINAL_POINTS: Readonly<
  Record<FinalPlace, Readonly<Record<FinalPlace, number>>>
> = Object.freeze({
  1: Object.freeze({ 1: 36, 2: 27, 3: 18, 4: 9 }),
  2: Object.freeze({ 1: 27, 2: 30, 3: 21, 4: 12 }),
  3: Object.freeze({ 1: 18, 2: 21, 3: 24, 4: 15 }),
  4: Object.freeze({ 1: 9, 2: 12, 3: 15, 4: 18 }),
});

/**
 * One stored points column and its odds column. Null points: a stage
 * nobody has reached yet (ST-6). Null odds: no crowd bonus was computed.
 */
export interface StandingsLine {
  readonly points: StandingsPoints | null;
  readonly odds: StandingsOdds | null;
}

/** One team's standings points for one prediction (a point_standings row). */
export interface TeamStandings {
  readonly team: TeamId;
  readonly place: StandingsLine;
  readonly playOffs: StandingsLine;
  readonly finalFour: StandingsLine;
  readonly final: StandingsLine;
}

/** One player's standings points for one team: a `point_standings` row. */
export interface StandingsRow extends TeamStandings {
  readonly player: PlayerId;
}

const UNDECIDED: StandingsLine = Object.freeze({ points: null, odds: null });

const flat = (base: number): StandingsLine =>
  Object.freeze({ points: standingsPointsWhole(base), odds: null });

/**
 * base x (1 + odds), odds = log2(counted / same) to four places; odds 0
 * pays the plain base (ST-4, ST-5, ST-7). A crowd of nobody computes none.
 */
function withCrowdBonus(
  base: number,
  counted: number,
  same: number,
): StandingsLine {
  if (counted === 0) {
    return flat(base);
  }
  const odds = same > 0 ? standingsOddsTenThousandths(counted, same) : 0;
  return Object.freeze({
    points: standingsPointsOfTenThousandths(base * (10_000 + odds)),
    odds: standingsOddsOfTenThousandths(odds),
  });
}

/** What every line of a scoring run reads: the crowd, the outcomes, the rules. */
interface ScoringRun {
  readonly everyone: readonly StandingsPrediction[];
  readonly outcomes: TeamOutcomes;
  readonly rules: RuleSet;
  /** R-36: the players who saved anything on the standings page. */
  readonly standingsPlayers: number;
}

/** Every prediction's row for `team` (undefined where a player has none). */
const crowdOf = (run: ScoringRun, team: TeamId): (TeamPick | undefined)[] =>
  run.everyone.map((each) => each.pick(team));

/** R-3, R-36: who the stage and final bonus counts. */
function countedFor(
  run: ScoringRun,
  team: TeamId,
  saved: (pick: TeamPick) => boolean,
): number {
  return run.rules.standingsBonusPopulation === 'saved-anything'
    ? run.standingsPlayers
    : crowdOf(run, team).filter((pick) => pick !== undefined && saved(pick))
        .length;
}

/** ST-4, ST-6, ST-8: a predicted place against the table. */
function placeLine(run: ScoringRun, pick: TeamPick): StandingsLine {
  const { rules, outcomes } = run;
  // ST-8, R-14: the ruled set pays places only from the final table.
  const actual =
    rules.placesScoredOnlyFromFinalTable && !outcomes.tableIsFinal
      ? null
      : (outcomes.outcomeOf(pick.team)?.place ?? null);
  // ST-6: with no place to score from yet, the ruled set stores null (not
  // scored yet); sportbet stores 0.
  if (actual === null) {
    return rules.unscoredPlaceStoresNull ? UNDECIDED : flat(0);
  }
  if (pick.place === null) {
    return flat(0);
  }
  const base = Math.max(
    0,
    STANDINGS_POINTS.placeBase -
      STANDINGS_POINTS.placeStep * Math.abs(actual - pick.place),
  );
  // ST-4: only an exact place gets the crowd bonus, and under R-35 none does.
  if (pick.place !== actual || !rules.positionsGetCrowdBonus) {
    return flat(base);
  }
  const crowd = crowdOf(run, pick.team);
  const placed = crowd.filter((each) => (each?.place ?? null) !== null).length;
  const same = crowd.filter((each) => each?.place === pick.place).length;
  return withCrowdBonus(base, placed, same);
}

/** ST-5: a stage tick against the stage's outcome. */
function stageLine(
  run: ScoringRun,
  pick: TeamPick,
  stage: StandingsStage,
): StandingsLine {
  if (!run.outcomes.stageDecided(stage)) {
    return UNDECIDED;
  }
  // ST-5: a tick for a team that did not get there, or no tick for one
  // that did, scores 0.
  if (
    run.outcomes.outcomeOf(pick.team)?.[stage] !== true ||
    pick[stage] !== true
  ) {
    return flat(0);
  }
  const same = crowdOf(run, pick.team).filter(
    (each) => each?.[stage] === true,
  ).length;
  return withCrowdBonus(
    STANDINGS_POINTS[stage],
    countedFor(run, pick.team, (each) => each[stage] !== null),
    same,
  );
}

/** ST-7: a final place against the final's outcome. */
function finalLine(run: ScoringRun, pick: TeamPick): StandingsLine {
  if (!run.outcomes.finalDecided()) {
    return UNDECIDED;
  }
  const actual = run.outcomes.outcomeOf(pick.team)?.finalPlace ?? null;
  if (actual === null || pick.finalPlace === null) {
    return flat(0);
  }
  const base = FINAL_POINTS[pick.finalPlace][actual];
  // ST-7: only the exact final place gets the crowd bonus.
  if (pick.finalPlace !== actual) {
    return flat(base);
  }
  const same = crowdOf(run, pick.team).filter(
    (each) => each?.finalPlace === pick.finalPlace,
  ).length;
  return withCrowdBonus(
    base,
    countedFor(run, pick.team, (each) => each.finalPlace !== null),
    same,
  );
}

/**
 * ST-3 to ST-9 for every standings prediction of a tournament (the crowd:
 * every count is over all of them) against the teams' outcomes. One row per
 * team each player has a row for, in the order of the predictions and
 * their rows. Internal to the recalculation (recalculateTournament).
 */
export function scoreStandings(
  everyone: readonly StandingsPrediction[],
  outcomes: TeamOutcomes,
  rules: RuleSet,
): readonly StandingsRow[] {
  const run: ScoringRun = {
    everyone,
    outcomes,
    rules,
    standingsPlayers: everyone.filter((each) => each.savedAnything()).length,
  };
  return Object.freeze(
    everyone.flatMap((prediction) =>
      prediction.picks.map((pick) =>
        Object.freeze({
          player: prediction.player,
          team: pick.team,
          place: placeLine(run, pick),
          playOffs: stageLine(run, pick, 'playOffs'),
          finalFour: stageLine(run, pick, 'finalFour'),
          final: finalLine(run, pick),
        }),
      ),
    ),
  );
}
