import type { StandingsDeadline } from '../round/season';
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { STANDINGS_COUNTS, type TeamPick } from './standings-prediction';

export interface LadderRow extends TeamPick {
  readonly name: string;
}

/** R-80: what the page says of the deadline. */
export type StandingsCloses =
  | { readonly state: 'open'; readonly at: Instant }
  | { readonly state: 'closed' }
  | { readonly state: 'never' };

/** The ladder's counters: places, the two ticks and the final places. */
export interface StandingsCounts {
  readonly places: number;
  readonly playOffs: number;
  readonly finalFour: number;
  readonly finalPlaces: number;
}

/** What /prediction/standings shows a player. */
export interface StandingsPage {
  readonly rows: readonly LadderRow[];
  /** R-79: any of the player's places is saved. */
  readonly placesSaved: boolean;
  readonly counts: StandingsCounts;
  readonly totals: StandingsCounts;
  readonly closes: StandingsCloses;
}

/**
 * PHP's strcmp on UTF-8, which sportbet's sortBy applies to the names:
 * bytes in order (code point order), case-sensitive, so "AS" before "Al"
 * and every accented letter after z.
 */
function byteOrder(a: string, b: string): number {
  const left = Array.from(a, (character) => character.codePointAt(0) ?? 0);
  const right = Array.from(b, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

/**
 * standings.blade.php's ladder: the tournament's teams with the player's
 * rows (a team with none shown blank), by saved place, unplaced teams last,
 * ties by name (its `sortBy(sprintf('%04d', place ?? 9999).team)`); the
 * counters; R-79's and R-80's states.
 */
export function standingsLadder(input: {
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly rows: readonly TeamPick[];
  readonly now: Instant;
  readonly season: StandingsDeadline;
}): StandingsPage {
  const { teams, rows, now, season } = input;
  const byTeam = new Map(rows.map((row) => [row.team, row]));
  const ladder = teams
    .map((team): LadderRow => {
      const row = byTeam.get(team.id);
      return {
        team: team.id,
        name: team.name,
        place: row?.place ?? null,
        playOffs: row?.playOffs ?? null,
        finalFour: row?.finalFour ?? null,
        finalPlace: row?.finalPlace ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.place ?? Number.MAX_SAFE_INTEGER) -
          (b.place ?? Number.MAX_SAFE_INTEGER) || byteOrder(a.name, b.name),
    );
  const count = (test: (row: LadderRow) => boolean) =>
    ladder.filter(test).length;
  const counts: StandingsCounts = {
    places: count((row) => row.place !== null),
    playOffs: count((row) => row.playOffs === true),
    finalFour: count((row) => row.finalFour === true),
    finalPlaces: count((row) => row.finalPlace !== null),
  };
  return {
    rows: ladder,
    placesSaved: counts.places > 0,
    counts,
    totals: {
      places: teams.length,
      playOffs: STANDINGS_COUNTS.playOffs,
      finalFour: STANDINGS_COUNTS.finalFour,
      finalPlaces: STANDINGS_COUNTS.finalPlaces,
    },
    closes: closesOf(season, now),
  };
}

/** R-80: no deadline game never closes; open until the deadline; then closed. */
function closesOf(season: StandingsDeadline, now: Instant): StandingsCloses {
  const deadline = season.standingsDeadline();
  if (deadline === null) return { state: 'never' };
  return season.isStandingsOpenAt(now)
    ? { state: 'open', at: deadline }
    : { state: 'closed' };
}
