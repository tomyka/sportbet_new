import type { PlayerId, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';

/**
 * A finishing place in the final: a Euroleague entry names a champion (1)
 * and a runner-up (2). 3 and 4 exist only in stored rows: sportbet's final
 * box and scoring matrix are shared with football's four places.
 */
export type FinalPlace = 1 | 2 | 3 | 4;

/** The final places a Euroleague entry may name (ST-1). */
const ENTERED_FINAL_PLACES: readonly FinalPlace[] = [1, 2];
const STORED_FINAL_PLACES: readonly FinalPlace[] = [1, 2, 3, 4];

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

/**
 * One team's standings prediction row as stored: a TeamPick whose place may
 * be 0 and whose final place may be 3 or 4, as sportbet's rows hold them
 * (sportbetColumns.teamPick maps its columns to this).
 */
export interface StoredTeamPick {
  readonly team: TeamId;
  readonly place: number | null;
  readonly playOffs: boolean | null;
  readonly finalFour: boolean | null;
  readonly finalPlace: number | null;
}

export type StoredStandingsRefusal =
  'duplicate-team' | 'bad-place' | 'bad-final-place';

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
  static enter(
    player: PlayerId,
    picks: readonly TeamPick[],
  ): Result<
    StandingsPrediction,
    'duplicate-team' | 'place-not-positive' | 'final-place-out-of-range'
  > {
    if (new Set(picks.map((pick) => pick.team)).size !== picks.length) {
      return refuse('duplicate-team');
    }
    if (
      picks.some(
        ({ finalPlace }) =>
          finalPlace !== null && !ENTERED_FINAL_PLACES.includes(finalPlace),
      )
    ) {
      return refuse('final-place-out-of-range');
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

  /**
   * Stored rows read back as sportbet scores them. A stored place is kept
   * as it is, 0 included: sportbet scores a place 0 as a place (190 - 10 x
   * the actual place) and counts it among the players who placed the team.
   * A final place of 3 or 4 is kept too. sportbet's `final` of 0, no final
   * place, is mapped to null by `sportbetColumns`, before this.
   */
  static stored(
    player: PlayerId,
    rows: readonly StoredTeamPick[],
  ): Result<StandingsPrediction, StoredStandingsRefusal> {
    if (new Set(rows.map((row) => row.team)).size !== rows.length) {
      return refuse('duplicate-team');
    }
    const picks: TeamPick[] = [];
    for (const row of rows) {
      if (
        row.place !== null &&
        !(Number.isSafeInteger(row.place) && row.place >= 0)
      ) {
        return refuse('bad-place');
      }
      let finalPlace: FinalPlace | null = null;
      if (row.finalPlace !== null) {
        const known = STORED_FINAL_PLACES.find(
          (place) => place === row.finalPlace,
        );
        if (known === undefined) {
          return refuse('bad-final-place');
        }
        finalPlace = known;
      }
      picks.push({ ...row, finalPlace });
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
