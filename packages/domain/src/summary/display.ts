import type { StageCents } from '../dashboard/league-table-rows';
import type { CompareSide } from './compare';
import {
  STANDINGS_LINE_KEYS,
  type StandingsLineKey,
} from './standings-summary';

// Display facts the summaries and the comparison decide: whether a figure is
// shown, and which side of a pair wins. Components only render them.

/** One side of a pair against the other: the larger wins, the smaller loses, equals tie. */
export type Mark = 'win' | 'lose' | 'tie';

export function markOf(mine: number, theirs: number): Mark {
  if (mine > theirs) return 'win';
  return mine < theirs ? 'lose' : 'tie';
}

/** Points are shown only above 0: a sum, a cell's total or a stage with nothing earned is left blank. */
export function isEarned(points: number | undefined): points is number {
  return points !== undefined && points > 0;
}

/** A sum as it is shown: the value above 0, null (blank) otherwise. */
export function shownSum(points: number | undefined): number | null {
  return isEarned(points) ? points : null;
}

/** The stages with points above 0, in sportbet's stage order: the popover's lines. */
export function earnedStages(stages: StageCents): StandingsLineKey[] {
  return STANDINGS_LINE_KEYS.filter((stage) => isEarned(stages[stage]));
}

export type CompareStatKind =
  'match' | 'standings' | 'survival' | 'serija' | 'bingo';

/** One shown row of "Bendri statistikos": both sides' values and their marks. */
export interface CompareStat {
  readonly kind: CompareStatKind;
  /** Cents, except for `bingo`, a count. */
  readonly me: number;
  readonly them: number;
  readonly meMark: Mark;
  readonly themMark: Mark;
}

const STAT_VALUES: readonly {
  readonly kind: CompareStatKind;
  readonly of: (side: CompareSide) => number;
  /** Left out while both sides are at 0 (survival, `hide_if_zero`). */
  readonly hiddenAtZero?: true;
}[] = [
  { kind: 'match', of: (side) => side.matchCents },
  { kind: 'standings', of: (side) => side.standingsCents },
  { kind: 'survival', of: (side) => side.survivalCents, hiddenAtZero: true },
  { kind: 'serija', of: (side) => side.serijaCents },
  { kind: 'bingo', of: (side) => side.bingo },
];

/**
 * compare/_card.blade.php's "Bendri statistikos": match, standings,
 * survival (only when either side has some), serija and bingo, with the
 * winner of each pair marked.
 */
export function compareStats(
  me: CompareSide,
  them: CompareSide,
): readonly CompareStat[] {
  return STAT_VALUES.flatMap(({ kind, of, hiddenAtZero }) => {
    const mine = of(me);
    const theirs = of(them);
    if (hiddenAtZero === true && mine === 0 && theirs === 0) return [];
    return [
      Object.freeze({
        kind,
        me: mine,
        them: theirs,
        meMark: markOf(mine, theirs),
        themMark: markOf(theirs, mine),
      }),
    ];
  });
}
