import { describe, expect, it } from 'vitest';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { player } from '../testing';
import { rankPlayers, type PlayerTotals } from './league-table';

const totals = (
  username: string,
  match: number,
  standingsTenThousandths = 0,
  extra: { serija?: number; survival?: number; listed?: boolean } = {},
): PlayerTotals => ({
  player: player(username),
  username,
  match: Points.ofHundredths(match * 100),
  serija: Points.whole(extra.serija ?? 0),
  standings: StandingsPoints.ofTenThousandths(standingsTenThousandths),
  survival: Points.whole(extra.survival ?? 0),
  listed: extra.listed ?? true,
});
const order = (rows: ReturnType<typeof rankPlayers>) =>
  rows.map((row) => `${String(row.rank)} ${row.username}`);

describe('RA-1', () => {
  it('ranking: the ranked rows cannot be changed', () => {
    const rows = rankPlayers([totals('A', 1)], 'league-table', ruledRules);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every((row) => Object.isFrozen(row))).toBe(true);
  });

  // A: 2,100 match points and 631.16 standings (2,731.16). B: 2,500 match.
  const a = totals('A', 2100, 6_311_600);
  const b = totals('B', 2500);

  it('ranking: the total adds match, serija, standings and survival', () => {
    const rows = rankPlayers(
      [totals('C', 2000, 0, { serija: 60, survival: 46 }), a, b],
      'league-table',
      sportbetRules,
    );
    expect(order(rows)).toEqual(['1 A', '2 B', '3 C']);
    expect(rows.map((row) => row.totalCents)).toEqual([
      273_116, 250_000, 210_600,
    ]);
  });

  it('ranking (ruled): every page ranks by the same total', () => {
    expect(order(rankPlayers([a, b], 'lyderiai', ruledRules))).toEqual([
      '1 A',
      '2 B',
    ]);
    expect(order(rankPlayers([a, b], 'league-table', ruledRules))).toEqual([
      '1 A',
      '2 B',
    ]);
  });

  it('ranking (sportbet): Lyderiai ranks by match and serija only', () => {
    expect(order(rankPlayers([a, b], 'lyderiai', sportbetRules))).toEqual([
      '1 B',
      '2 A',
    ]);
  });
});

describe('RA-2', () => {
  it('ranking: equal totals are split by match points', () => {
    const rows = rankPlayers(
      [totals('B', 2050, 6_811_600), totals('A', 2100, 6_311_600)],
      'league-table',
      ruledRules,
    );
    expect(order(rows)).toEqual(['1 A', '2 B']);
  });

  it('ranking: equal on both share a rank and the next skips', () => {
    const rows = rankPlayers(
      [
        totals('E', 1000),
        totals('C', 2000, 7_000_000),
        totals('A', 2100, 6_311_600),
        totals('D', 2000, 7_000_000),
        totals('B', 2050, 6_811_600),
      ],
      'league-table',
      ruledRules,
    );
    expect(order(rows)).toEqual(['1 A', '2 B', '3 C', '3 D', '5 E']);
  });

  it('ranking: totals are compared to the cent', () => {
    // 2,731.164 and 2,731.158 are both 2,731.16.
    const rows = rankPlayers(
      [totals('B', 2100, 6_311_580), totals('A', 2100, 6_311_640)],
      'league-table',
      ruledRules,
    );
    expect(order(rows)).toEqual(['1 A', '1 B']);
  });

  it('ranking: negative totals sort last, with no floor', () => {
    const rows = rankPlayers(
      [totals('A', -45), totals('B', 0), totals('C', 10)],
      'league-table',
      ruledRules,
    );
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

  it('ranking (ruled): ties are listed with Š after S and before T', () => {
    for (const page of ['league-table', 'lyderiai'] as const) {
      expect(names(rankPlayers(tied, page, ruledRules))).toEqual([
        'Saulius',
        'Šarūnas',
        'Tomas',
      ]);
    }
  });

  it('ranking (sportbet): each page lists ties its own way', () => {
    expect(names(rankPlayers(tied, 'league-table', sportbetRules))).toEqual([
      'Saulius',
      'Tomas',
      'Šarūnas',
    ]);
    expect(names(rankPlayers(tied, 'lyderiai', sportbetRules))).toEqual([
      'Šarūnas',
      'Saulius',
      'Tomas',
    ]);
  });
});

describe('RA-4', () => {
  it('ranking: a switched-off player is not listed', () => {
    const rows = rankPlayers(
      [totals('A', 1800, 0, { listed: false }), totals('B', 900)],
      'league-table',
      sportbetRules,
    );
    expect(order(rows)).toEqual(['1 B']);
  });
});
