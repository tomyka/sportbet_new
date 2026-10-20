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
import type { PlayerId, TeamId } from '../shared/ids';
import {
  STANDINGS_COUNTS,
  type FinalPlace,
  type StandingsStage,
  type StandingsPrediction,
  type TeamPick,
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

/** What every line of a scoring run reads: the crowd and the outcomes. */
interface ScoringRun {
  readonly everyone: readonly StandingsPrediction[];
  readonly outcomes: TeamOutcomes;
  /** R-36: the players who saved anything on the standings page. */
  readonly standingsPlayers: number;
}

/** Every prediction's row for `team` (undefined where a player has none). */
const crowdOf = (run: ScoringRun, team: TeamId): (TeamPick | undefined)[] =>
  run.everyone.map((each) => each.pick(team));

/**
 * ST-4: a predicted place's base points: 190 less 10 a place off, never
 * below 0 (before any crowd bonus). Split out of placeLine so the rules page
 * reads the same figures (internal to the domain).
 */
export function placePoints(predicted: number, actual: number): number {
  return Math.max(
    0,
    STANDINGS_POINTS.placeBase -
      STANDINGS_POINTS.placeStep * Math.abs(actual - predicted),
  );
}

/**
 * ST-7: a final place's base points from sportbet's matrix (before any crowd
 * bonus). Split out of finalLine for the rules page (internal).
 */
export function finalPoints(predicted: FinalPlace, actual: FinalPlace): number {
  return FINAL_POINTS[predicted][actual];
}

/** ST-4, ST-6, ST-8: a predicted place against the table. */
function placeLine(run: ScoringRun, pick: TeamPick): StandingsLine {
  const { outcomes } = run;
  // ST-8, R-14: places are paid only from the final table.
  const actual = outcomes.tableIsFinal
    ? (outcomes.outcomeOf(pick.team)?.place ?? null)
    : null;
  // ST-6: with no place to score from yet, null (not scored yet).
  if (actual === null) {
    return UNDECIDED;
  }
  if (pick.place === null) {
    return flat(0);
  }
  // ST-4, R-35: no place, exact or not, gets the crowd bonus.
  return flat(placePoints(pick.place, actual));
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
  return withCrowdBonus(STANDINGS_POINTS[stage], run.standingsPlayers, same);
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
  const base = finalPoints(pick.finalPlace, actual);
  // ST-7: only the exact final place gets the crowd bonus.
  if (pick.finalPlace !== actual) {
    return flat(base);
  }
  const same = crowdOf(run, pick.team).filter(
    (each) => each?.finalPlace === pick.finalPlace,
  ).length;
  return withCrowdBonus(base, run.standingsPlayers, same);
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
): readonly StandingsRow[] {
  const run: ScoringRun = {
    everyone,
    outcomes,
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

export interface PlaceExample {
  readonly miss: number;
  readonly points: number;
  /** "N or more": the row has reached the floor, where every further miss pays 0. */
  readonly last: boolean;
}

export interface BracketRow {
  readonly stage: 'playOffs' | 'finalFour';
  readonly points: number;
  readonly count: number;
}

/** The places a Euroleague final awards (STANDINGS_COUNTS.finalPlaces). */
const FINAL_PLACES = [1, 2] as const;

/** The most places a miss is listed for, then "continues" (GRID_MAX_MISS). */
const PLACE_MISS_ROWS = 7;

/** ScoringRules::positionMissExamples: how far out, what it pays, down to the floor or seven. */
function placeExamples(): readonly PlaceExample[] {
  const anchor = 1;
  let rows = 0;
  while (rows < PLACE_MISS_ROWS && placePoints(anchor + rows, anchor) > 0) {
    rows += 1;
  }
  return Array.from({ length: rows + 1 }, (_, miss) => {
    const points = placePoints(anchor + miss, anchor);
    return { miss, points, last: miss === rows && points === 0 };
  });
}

/**
 * The standings' figures on /rules (slice 18, #35, R-100): what a miss pays,
 * the bracket and the finals grid, from the scorer's own constants and
 * functions (`placePoints`, `finalPoints`), so the page cannot drift from
 * scoring.
 */
export function publishedStandingsFigures(): {
  readonly placeExamples: readonly PlaceExample[];
  /** The rule keeps falling past the last row drawn. */
  readonly placesContinue: boolean;
  readonly placeStep: number;
  readonly bracket: readonly BracketRow[];
  /** [predicted][actual] over places 1 and 2. */
  readonly finalsGrid: readonly (readonly number[])[];
} {
  const places = placeExamples();
  const last = places.at(-1);
  return {
    placeExamples: places,
    placesContinue: last !== undefined && last.points > 0,
    placeStep: STANDINGS_POINTS.placeStep,
    bracket: [
      {
        stage: 'playOffs',
        points: STANDINGS_POINTS.playOffs,
        count: STANDINGS_COUNTS.playOffs,
      },
      {
        stage: 'finalFour',
        points: STANDINGS_POINTS.finalFour,
        count: STANDINGS_COUNTS.finalFour,
      },
    ],
    finalsGrid: FINAL_PLACES.map((predicted) =>
      FINAL_PLACES.map((actual) => finalPoints(predicted, actual)),
    ),
  };
}
