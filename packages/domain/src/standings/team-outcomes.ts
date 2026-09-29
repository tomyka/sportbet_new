import type { TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import type { FinalPlace, StandingsStage } from './standings-prediction';

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
   * Each team once, each place a positive whole number held by one team,
   * and a Euroleague final's champion (1) and runner-up (2) once each.
   * sportbet stores an undecided place as 0 or NULL and scores both as
   * nothing (StandingScoringService), so its reader maps a 0 to null.
   */
  static enter(
    teams: readonly TeamOutcome[],
    tableIsFinal: boolean,
  ): Result<TeamOutcomes, TeamOutcomesRefusal> {
    if (new Set(teams.map(({ team }) => team)).size !== teams.length) {
      return refuse('duplicate-team');
    }
    const places = teams.flatMap(({ place }) =>
      place === null ? [] : [place],
    );
    if (places.some((place) => !Number.isSafeInteger(place) || place <= 0)) {
      return refuse('place-not-positive');
    }
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
