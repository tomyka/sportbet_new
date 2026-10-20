import { describe, expect, it } from 'vitest';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import { player, unwrap } from '../testing';
import {
  rankPlayers,
  unicodeCiCompare,
  usernameOrder,
  type PlayerTotals,
} from './league-table';

const totals = (
  username: string,
  match: number,
  standingsTenThousandths = 0,
  extra: { serija?: number; survival?: number; listed?: boolean } = {},
): PlayerTotals => ({
  player: player(username),
  username,
  match: unwrap(Points.ofHundredths(match * 100)),
  serija: unwrap(Points.whole(extra.serija ?? 0)),
  standings: unwrap(StandingsPoints.ofTenThousandths(standingsTenThousandths)),
  survival: unwrap(Points.whole(extra.survival ?? 0)),
  listed: extra.listed ?? true,
});
const order = (rows: ReturnType<typeof rankPlayers>) =>
  rows.map((row) => `${String(row.rank)} ${row.username}`);

describe('RA-1', () => {
  it('ranking: the ranked rows cannot be changed', () => {
    const rows = rankPlayers([totals('A', 1)]);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every((row) => Object.isFrozen(row))).toBe(true);
  });

  // A: 2,100 match points and 631.16 standings (2,731.16). B: 2,500 match.
  const a = totals('A', 2100, 6_311_600);
  const b = totals('B', 2500);

  it('ranking: the total adds match, serija, standings and survival', () => {
    const rows = rankPlayers([
      totals('C', 2000, 0, { serija: 60, survival: 46 }),
      a,
      b,
    ]);
    expect(order(rows)).toEqual(['1 A', '2 B', '3 C']);
    expect(rows.map((row) => row.totalCents)).toEqual([
      273_116, 250_000, 210_600,
    ]);
  });

  it('ranking: every page ranks by the full total, not match and serija only (R-18)', () => {
    expect(order(rankPlayers([a, b]))).toEqual(['1 A', '2 B']);
  });
});

describe('RA-2', () => {
  it('ranking: equal totals are split by match points', () => {
    const rows = rankPlayers([
      totals('B', 2050, 6_811_600),
      totals('A', 2100, 6_311_600),
    ]);
    expect(order(rows)).toEqual(['1 A', '2 B']);
  });

  it('ranking: equal on both share a rank and the next skips', () => {
    const rows = rankPlayers([
      totals('E', 1000),
      totals('C', 2000, 7_000_000),
      totals('A', 2100, 6_311_600),
      totals('D', 2000, 7_000_000),
      totals('B', 2050, 6_811_600),
    ]);
    expect(order(rows)).toEqual(['1 A', '2 B', '3 C', '3 D', '5 E']);
  });

  it('ranking: totals are compared to the cent', () => {
    // 2,731.164 and 2,731.158 are both 2,731.16.
    const rows = rankPlayers([
      totals('B', 2100, 6_311_580),
      totals('A', 2100, 6_311_640),
    ]);
    expect(order(rows)).toEqual(['1 A', '1 B']);
  });

  it('ranking: negative totals sort last, with no floor', () => {
    const rows = rankPlayers([
      totals('A', -45),
      totals('B', 0),
      totals('C', 10),
    ]);
    expect(order(rows)).toEqual(['1 C', '2 B', '3 A']);
    expect(rows[2]?.totalCents).toBe(-4_500);
  });
});

describe('RA-3', () => {
  // Šarūnas ties with Saulius and with Tomas.
  const tied = ['Tomas', 'Šarūnas', 'Saulius'].map((name) =>
    totals(name, 2000),
  );
  const names = (rows: ReturnType<typeof rankPlayers>) =>
    rows.map((row) => row.username);

  it('ranking: ties are listed with Š after S and before T', () => {
    expect(names(rankPlayers(tied))).toEqual(['Saulius', 'Šarūnas', 'Tomas']);
  });
});

describe('RA-4', () => {
  it('ranking: a switched-off player is not listed', () => {
    const rows = rankPlayers([
      totals('A', 1800, 0, { listed: false }),
      totals('B', 900),
    ]);
    expect(order(rows)).toEqual(['1 B']);
  });
});

describe('unicodeCiCompare', () => {
  it('ranking: reads accented letters as their base and ignores case, as utf8mb4_unicode_ci does, then byte order', () => {
    expect(
      ['Zenit', 'žalgiris', 'Barcelona', 'Žalgiris'].sort(unicodeCiCompare),
    ).toEqual(['Barcelona', 'Žalgiris', 'žalgiris', 'Zenit']);
  });
});

describe('usernameOrder', () => {
  it('ranking: lists names with Š after S and before T (R-30)', () => {
    expect(['Tomas', 'Šarūnas', 'Saulius'].sort(usernameOrder())).toEqual([
      'Saulius',
      'Šarūnas',
      'Tomas',
    ]);
  });
});
