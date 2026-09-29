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

  static of(
    teams: readonly TeamOutcome[],
    tableIsFinal: boolean,
  ): Result<TeamOutcomes, 'duplicate-team'> {
    return new Set(teams.map(({ team }) => team)).size === teams.length
      ? ok(new TeamOutcomes(teams, tableIsFinal))
      : refuse('duplicate-team');
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
