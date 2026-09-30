import { defineRangeInvariant } from '../invariant/range-invariant';
import type { TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import type { FinalPlace, StandingsStage } from './standings-prediction';

/**
 * A team's regular-season place as an admin entered it: from 1. sportbet's
 * 0 for an undecided place is mapped to null by `sportbetColumns` first.
 */
export const outcomePlaceInvariant = defineRangeInvariant({
  name: 'team place',
  min: 1,
  accepts: [
    { label: 'first', value: 1 },
    { label: 'twentieth', value: 20 },
  ],
  refuses: [
    { label: "zero, sportbet's undecided", value: 0 },
    { label: 'a negative place', value: -1 },
  ],
});

/** What a team actually did, as the admin entered it. */
export interface TeamOutcome {
  readonly team: TeamId;
  /** Its regular-season place; null until the table is entered. */
  readonly place: number | null;
  readonly playOffs: boolean;
  readonly finalFour: boolean;
  readonly finalPlace: FinalPlace | null;
}

export type TeamOutcomesRefusal =
  | 'duplicate-team'
  | 'place-not-positive'
  | 'duplicate-place'
  | 'final-place-out-of-range'
  | 'duplicate-final-place';

/** Every team's outcome in one tournament. */
export class TeamOutcomes {
  readonly teams: readonly TeamOutcome[];
  /** The table was entered after round 38: the final regular-season table (R-14). */
  readonly tableIsFinal: boolean;

  private constructor(teams: readonly TeamOutcome[], tableIsFinal: boolean) {
    this.teams = Object.freeze([...teams]);
    this.tableIsFinal = tableIsFinal;
    Object.freeze(this);
  }

  /**
   * The outcomes as an admin enters them: each team once, each place a
   * positive whole number held by one team, and a Euroleague final's
   * champion (1) and runner-up (2) once each.
   */
  static enter(
    teams: readonly TeamOutcome[],
    tableIsFinal: boolean,
  ): Result<TeamOutcomes, TeamOutcomesRefusal> {
    const shape = shapeProblem(teams);
    if (shape !== null) {
      return refuse(shape);
    }
    const places = teams.flatMap(({ place }) =>
      place === null ? [] : [place],
    );
    if (new Set(places).size !== places.length) {
      return refuse('duplicate-place');
    }
    const finals = teams.flatMap(({ finalPlace }) =>
      finalPlace === null ? [] : [finalPlace],
    );
    if (finals.some((place) => place !== 1 && place !== 2)) {
      return refuse('final-place-out-of-range');
    }
    if (new Set(finals).size !== finals.length) {
      return refuse('duplicate-final-place');
    }
    return ok(new TeamOutcomes(teams, tableIsFinal));
  }

  /**
   * Stored outcomes read back as sportbet scores them. Its admin form
   * checks neither that places differ nor the final box, which it shares
   * with football's four places (TeamController::updateTeams), so a shared
   * place and a final place of 3 or 4 are kept, as StandingsPrediction.stored
   * keeps them; only the row's shape is checked. sportbet's 0 for an
   * undecided place is mapped to null by `sportbetColumns`, before this.
   */
  static stored(
    teams: readonly TeamOutcome[],
    tableIsFinal: boolean,
  ): Result<TeamOutcomes, 'duplicate-team' | 'place-not-positive'> {
    const shape = shapeProblem(teams);
    return shape === null
      ? ok(new TeamOutcomes(teams, tableIsFinal))
      : refuse(shape);
  }

  outcomeOf(team: TeamId): TeamOutcome | undefined {
    return this.teams.find((outcome) => outcome.team === team);
  }

  /** ST-6: a stage is live once any team holds its tick. */
  stageDecided(stage: StandingsStage): boolean {
    return this.teams.some((outcome) => outcome[stage]);
  }

  /** ST-6: the final is live once any team has a final place. */
  finalDecided(): boolean {
    return this.teams.some((outcome) => outcome.finalPlace !== null);
  }
}

/** Each team once, each place a positive whole number. */
function shapeProblem(
  teams: readonly TeamOutcome[],
): 'duplicate-team' | 'place-not-positive' | null {
  if (new Set(teams.map(({ team }) => team)).size !== teams.length) {
    return 'duplicate-team';
  }
  const badPlace = teams.some(
    ({ place }) =>
      place !== null && !outcomePlaceInvariant.schema.safeParse(place).success,
  );
  return badPlace ? 'place-not-positive' : null;
}
