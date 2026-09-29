import { standingsOddsTenThousandths } from '../points/crowd-ratio';
import { StandingsOdds } from '../points/odds';
import { StandingsPoints } from '../points/standings-points';
import type { RuleSet } from '../rules/rule-set';
import type { TeamId } from '../shared/ids';
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

const UNDECIDED: StandingsLine = Object.freeze({ points: null, odds: null });

const flat = (base: number): StandingsLine =>
  Object.freeze({ points: StandingsPoints.whole(base), odds: null });

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
    points: StandingsPoints.ofTenThousandths(base * (10_000 + odds)),
    odds: StandingsOdds.ofTenThousandths(odds),
  });
}

/**
 * ST-3 to ST-9 for one player's prediction, against everyone's predictions
 * in the tournament (the crowd) and the teams' outcomes. One row per team
 * the player has a row for.
 */
export function scoreStandings(
  prediction: StandingsPrediction,
  everyone: readonly StandingsPrediction[],
  outcomes: TeamOutcomes,
  rules: RuleSet,
): TeamStandings[] {
  const crowd = (team: TeamId): (TeamPick | undefined)[] =>
    everyone.map((each) => each.pick(team));
  const standingsPlayers = everyone.filter((each) =>
    each.savedAnything(),
  ).length;

  // R-3, R-36: who the stage and final bonus counts.
  const counted = (team: TeamId, saved: (pick: TeamPick) => boolean): number =>
    rules.standingsBonusPopulation === 'saved-anything'
      ? standingsPlayers
      : crowd(team).filter((pick) => pick !== undefined && saved(pick)).length;

  const placeLine = (pick: TeamPick): StandingsLine => {
    // ST-8, R-14: the ruled set pays places only from the final table.
    const actual =
      rules.placesScoredOnlyFromFinalTable && !outcomes.tableIsFinal
        ? null
        : (outcomes.outcomeOf(pick.team)?.place ?? null);
    if (actual === null || pick.place === null) {
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
    const placed = crowd(pick.team).filter(
      (each) => (each?.place ?? null) !== null,
    ).length;
    const same = crowd(pick.team).filter(
      (each) => each?.place === pick.place,
    ).length;
    return withCrowdBonus(base, placed, same);
  };

  const stageLine = (pick: TeamPick, stage: StandingsStage): StandingsLine => {
    if (!outcomes.stageDecided(stage)) {
      return UNDECIDED;
    }
    // ST-5: a tick for a team that did not get there, or no tick for one
    // that did, scores 0.
    if (
      outcomes.outcomeOf(pick.team)?.[stage] !== true ||
      pick[stage] !== true
    ) {
      return flat(0);
    }
    const same = crowd(pick.team).filter(
      (each) => each?.[stage] === true,
    ).length;
    return withCrowdBonus(
      STANDINGS_POINTS[stage],
      counted(pick.team, (each) => each[stage] !== null),
      same,
    );
  };

  const finalLine = (pick: TeamPick): StandingsLine => {
    if (!outcomes.finalDecided()) {
      return UNDECIDED;
    }
    const actual = outcomes.outcomeOf(pick.team)?.finalPlace ?? null;
    if (actual === null || pick.finalPlace === null) {
      return flat(0);
    }
    const base = FINAL_POINTS[pick.finalPlace][actual];
    // ST-7: only the exact final place gets the crowd bonus.
    if (pick.finalPlace !== actual) {
      return flat(base);
    }
    const same = crowd(pick.team).filter(
      (each) => each?.finalPlace === pick.finalPlace,
    ).length;
    return withCrowdBonus(
      base,
      counted(pick.team, (each) => each.finalPlace !== null),
      same,
    );
  };

  return prediction.picks.map((pick) =>
    Object.freeze({
      team: pick.team,
      place: placeLine(pick),
      playOffs: stageLine(pick, 'playOffs'),
      finalFour: stageLine(pick, 'finalFour'),
      final: finalLine(pick),
    }),
  );
}
