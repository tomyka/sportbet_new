import type { PlayerId, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';

/** A Euroleague final names a champion (1) and a runner-up (2). */
export type FinalPlace = 1 | 2;

/** The two stage ticks a Euroleague standings prediction has (ST-1). */
export type StandingsStage = 'playOffs' | 'finalFour';

/** How many teams each part of the prediction must name (ST-1). */
export const STANDINGS_COUNTS = Object.freeze({
  playOffs: 8,
  finalFour: 4,
  finalPlaces: 2,
});

/**
 * One team's row of a standings prediction, as the player saved it. Null
 * is a column never saved; false a tick saved as unticked.
 */
export interface TeamPick {
  readonly team: TeamId;
  readonly place: number | null;
  readonly playOffs: boolean | null;
  readonly finalFour: boolean | null;
  readonly finalPlace: FinalPlace | null;
}

export type StandingsProblem =
  | 'unplaced-team'
  | 'duplicate-place'
  | 'play-off-ticks'
  | 'final-four-ticks'
  | 'final-places'
  | 'duplicate-final-place';

/** One player's standings prediction for one tournament. */
export class StandingsPrediction {
  readonly player: PlayerId;
  readonly picks: readonly TeamPick[];

  private constructor(player: PlayerId, picks: readonly TeamPick[]) {
    this.player = player;
    this.picks = Object.freeze([...picks]);
    Object.freeze(this);
  }

  /**
   * Any rows, complete or not: sportbet scores whatever was saved, and
   * production holds partial predictions.
   */
  static of(
    player: PlayerId,
    picks: readonly TeamPick[],
  ): Result<StandingsPrediction, 'duplicate-team' | 'place-not-positive'> {
    if (new Set(picks.map((pick) => pick.team)).size !== picks.length) {
      return refuse('duplicate-team');
    }
    if (
      picks.some(
        ({ place }) =>
          place !== null && !(Number.isSafeInteger(place) && place > 0),
      )
    ) {
      return refuse('place-not-positive');
    }
    return ok(new StandingsPrediction(player, picks));
  }

  pick(team: TeamId): TeamPick | undefined {
    return this.picks.find((pick) => pick.team === team);
  }

  /** R-36: the player saved anything on the standings page. */
  savedAnything(): boolean {
    return this.picks.some(
      (pick) =>
        pick.place !== null ||
        pick.playOffs !== null ||
        pick.finalFour !== null ||
        pick.finalPlace !== null,
    );
  }

  /**
   * ST-1: everything wrong with the prediction as an entry: every team
   * placed, each place once, 8 play-off and 4 Final Four ticks, and the two
   * final places once each. A player with no rows is not playing, not
   * incomplete.
   */
  problems(teams: readonly TeamId[]): StandingsProblem[] {
    if (this.picks.length === 0) {
      return [];
    }
    const problems: StandingsProblem[] = [];
    if (teams.some((team) => (this.pick(team)?.place ?? null) === null)) {
      problems.push('unplaced-team');
    }
    const places = this.picks.flatMap(({ place }) =>
      place === null ? [] : [place],
    );
    if (new Set(places).size !== places.length) {
      problems.push('duplicate-place');
    }
    const ticked = (stage: StandingsStage) =>
      this.picks.filter((pick) => pick[stage] === true).length;
    if (ticked('playOffs') !== STANDINGS_COUNTS.playOffs) {
      problems.push('play-off-ticks');
    }
    if (ticked('finalFour') !== STANDINGS_COUNTS.finalFour) {
      problems.push('final-four-ticks');
    }
    const finals = this.picks.flatMap(({ finalPlace }) =>
      finalPlace === null ? [] : [finalPlace],
    );
    if (finals.length !== STANDINGS_COUNTS.finalPlaces) {
      problems.push('final-places');
    }
    if (new Set(finals).size !== finals.length) {
      problems.push('duplicate-final-place');
    }
    return problems;
  }
}
