import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import type { TeamPick } from './standings-prediction';

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

/** Which of a row's boxes the page may change: all shut once closed. */
export interface StandingsBoxes {
  readonly playOffs: boolean;
  readonly finalFour: boolean;
  readonly finalPlace: boolean;
}

/** One shown row: the team's columns, mended to R-78's chain, and its boxes. */
export interface StandingsViewRow extends TeamPick {
  readonly name: string;
  readonly boxes: StandingsBoxes;
}

/**
 * What /prediction/standings shows a player, as plain data (it crosses to
 * the page): the rows in the shown order, the counters, R-79's and R-80's
 * states. StandingsTable.fromView rebuilds the table from it.
 */
export interface StandingsView {
  readonly rows: readonly StandingsViewRow[];
  /** R-79: any of the player's places is saved. */
  readonly placesSaved: boolean;
  /** The ladder may be reordered: open (ST-2). */
  readonly reorderable: boolean;
  /** R-79: open, and no place saved yet - offer saving the shown order. */
  readonly offerSaveShown: boolean;
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
 * standings.blade.php's order: by saved place, unplaced teams last, ties by
 * name (its `sortBy(sprintf('%04d', place ?? 9999).team)`).
 */
export function sportbetOrder(
  rows: readonly (Pick<TeamPick, 'team' | 'place'> & {
    readonly name: string;
  })[],
): TeamId[] {
  return [...rows]
    .sort(
      (a, b) =>
        (a.place ?? Number.MAX_SAFE_INTEGER) -
          (b.place ?? Number.MAX_SAFE_INTEGER) || byteOrder(a.name, b.name),
    )
    .map((row) => row.team);
}

/**
 * The ladder's counters (standings.blade.php's badges): saved places,
 * ticked play-off and Final Four boxes, and named final places. An
 * unticked or never-saved box is not counted.
 */
export function standingsCounts(
  rows: readonly Omit<TeamPick, 'team'>[],
): StandingsCounts {
  const count = (test: (row: Omit<TeamPick, 'team'>) => boolean) =>
    rows.filter(test).length;
  return {
    places: count((row) => row.place !== null),
    playOffs: count((row) => row.playOffs === true),
    finalFour: count((row) => row.finalFour === true),
    finalPlaces: count((row) => row.finalPlace !== null),
  };
}
