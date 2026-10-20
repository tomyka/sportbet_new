import { roundUnits } from '../points/fixed-point';
import type { Points } from '../points/points';
import type { TournamentTotal } from '../recalculation/recalculation';
import type { PlayerId } from '../shared/ids';

/**
 * One player's points in one tournament (recalculateTournament's total),
 * with what the page shows them by.
 */
export interface PlayerTotals extends TournamentTotal {
  readonly username: string;
  /** Shown in tables: not switched off, not hidden by an admin (RA-4). */
  readonly listed: boolean;
}

export interface RankedRow {
  readonly player: PlayerId;
  readonly username: string;
  readonly rank: number;
  /** The total the page ranks by, to the cent (R-31). */
  readonly totalCents: number;
  /** Match points without the serija, to the cent: the tie-break. */
  readonly matchCents: number;
}

/** Hundredths as ten-thousandths, so every part adds exactly. */
const exact = (points: Points): number => points.hundredths * 100;

/**
 * RA-1, R-18: every page ranks by the full total, match + serija + standings
 * + survival.
 */
function totalCents(row: PlayerTotals): number {
  const tenThousandths =
    exact(row.match) +
    exact(row.serija) +
    row.standings.tenThousandths +
    exact(row.survival);
  return roundUnits(tenThousandths, 2);
}

const codePoints = (text: string, fold: boolean): number[] =>
  Array.from(text, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return fold && code >= 65 && code <= 90 ? code + 32 : code;
  });

/**
 * PHP's strcasecmp then strcmp on UTF-8: bytes compared in order (which is
 * code point order), ASCII letters folded first. Every accented letter
 * sorts after z.
 */
function byteOrder(a: string, b: string): number {
  for (const fold of [true, false]) {
    const left = codePoints(a, fold);
    const right = codePoints(b, fold);
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      if (difference !== 0) return difference;
    }
    if (left.length !== right.length) return left.length - right.length;
  }
  return 0;
}

const lithuanian = new Intl.Collator('lt');
/** Close to MySQL's accent-insensitive collation: "Š" reads as "S". */
const accentBlind = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * MySQL's utf8mb4_unicode_ci, as near as an ICU collator comes: case and
 * accents ignored ("Š" reads as "S"), byte order breaking what it calls
 * equal. sportbet's Lyderiai tie order and its medal count's team order.
 */
export function unicodeCiCompare(a: string, b: string): number {
  return accentBlind.compare(a, b) || byteOrder(a, b);
}

const lithuanianOrder = (a: string, b: string): number =>
  lithuanian.compare(a, b) || byteOrder(a, b);

/**
 * RA-3, R-30: how tied players are listed on every page, and how a list of
 * usernames is ordered by name outside a ranking (the activity feed's bingo
 * players): Lithuanian, byte order breaking what it calls equal.
 */
export function usernameOrder(): (a: string, b: string) => number {
  return lithuanianOrder;
}

/**
 * RA-1 to RA-4: the listed players by total, then match points without the
 * serija, both to the cent; players equal on both share a rank (1, 2, 2,
 * 4) and are listed in the tie order (usernameOrder).
 */
export function rankPlayers(
  rows: readonly PlayerTotals[],
): readonly RankedRow[] {
  const byName = usernameOrder();
  const ranked = rows
    .filter((row) => row.listed)
    .map((row) => ({
      player: row.player,
      username: row.username,
      totalCents: totalCents(row),
      matchCents: row.match.hundredths,
    }))
    .sort(
      (a, b) =>
        b.totalCents - a.totalCents ||
        b.matchCents - a.matchCents ||
        byName(a.username, b.username),
    );
  // Sorted, so players equal on both are next to each other: each takes
  // the rank of the first of them.
  const withRanks: RankedRow[] = [];
  for (const [index, row] of ranked.entries()) {
    const previous = withRanks.at(-1);
    const rank =
      previous?.totalCents === row.totalCents &&
      previous.matchCents === row.matchCents
        ? previous.rank
        : index + 1;
    withRanks.push(Object.freeze({ ...row, rank }));
  }
  return Object.freeze(withRanks);
}
