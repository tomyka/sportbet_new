import { roundUnits } from '../points/fixed-point';
import type { Points } from '../points/points';
import type { TournamentTotal } from '../recalculation/recalculation';
import type { RuleSet } from '../rules/rule-set';
import type { PlayerId } from '../shared/ids';

/** The pages sportbet ranks on: the league table and the public Lyderiai. */
export type RankedPage = 'league-table' | 'lyderiai';

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
 * RA-1: the league table ranks by match + serija + standings + survival;
 * sportbet's Lyderiai by match + serija only. Under R-18 every page ranks
 * by the full total.
 */
function totalCents(
  row: PlayerTotals,
  page: RankedPage,
  rules: RuleSet,
): number {
  const full = page === 'league-table' || rules.everyPageRanksByFullTotal;
  const tenThousandths =
    exact(row.match) +
    exact(row.serija) +
    (full ? row.standings.tenThousandths + exact(row.survival) : 0);
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

/** RA-3: how tied players are listed. */
function tieOrder(
  page: RankedPage,
  rules: RuleSet,
): (a: string, b: string) => number {
  if (rules.tieOrder === 'lithuanian') {
    return (a, b) => lithuanian.compare(a, b) || byteOrder(a, b);
  }
  return page === 'league-table'
    ? byteOrder
    : (a, b) => accentBlind.compare(a, b) || byteOrder(a, b);
}

/**
 * RA-1 to RA-4: the listed players by total, then match points without the
 * serija, both to the cent; players equal on both share a rank (1, 2, 2,
 * 4) and are listed in the page's tie order.
 */
export function rankPlayers(
  rows: readonly PlayerTotals[],
  page: RankedPage,
  rules: RuleSet,
): readonly RankedRow[] {
  const byName = tieOrder(page, rules);
  const ranked = rows
    .filter((row) => row.listed)
    .map((row) => ({
      player: row.player,
      username: row.username,
      totalCents: totalCents(row, page, rules),
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
