import { describe, expect, it } from 'vitest';
import type { Game } from '../round/game';
import { makeGame, roundNo, score, team, unwrap } from '../testing';
import {
  foldSurvival,
  type SurvivalPick,
  type SurvivalRow,
} from './survival-fold';

// Every payment is doubled (R-138): 24 away, 20 at home.

/** Round n's game between two teams, tipping off on day n. */
const played = (
  round: number,
  home: string,
  away: string,
  result?: readonly [number, number],
): Game =>
  makeGame({
    id: round * 100 + home.charCodeAt(0),
    round,
    home,
    away,
    tipOff: new Date(Date.UTC(2026, 9, round, 18))
      .toISOString()
      .replace('.000', ''),
    ...(result === undefined ? {} : { result }),
  });
const pick = (round: number, name: string): SurvivalPick => ({
  round: roundNo(round),
  team: team(name),
});
const stored = (rows: readonly SurvivalRow[]) =>
  rows.map((row) => row.points?.toString() ?? row.state);

// Asta's usual run: an away win, a home win, an away win.
const run = [
  played(1, 'REA', 'FEN', [70, 95]),
  played(2, 'ZAL', 'OLY', [88, 79]),
  played(3, 'MON', 'OLY', [80, 84]),
];
const astaPicks = [pick(1, 'FEN'), pick(2, 'ZAL'), pick(3, 'OLY')];

describe('SU-1', () => {
  it('survival: an away win pays 12, doubled to 24 (R-138)', () => {
    expect(stored(foldSurvival([pick(1, 'FEN')], run))).toEqual(['24.00']);
  });

  it('survival: a home win pays 10, doubled to 20 (R-138)', () => {
    expect(stored(foldSurvival([pick(2, 'ZAL')], run))).toEqual(['20.00']);
  });
});

describe('R-138 survival multiplier', () => {
  it("foldSurvival: the run's running total doubles, a loss still stores 0", () => {
    expect(stored(foldSurvival(astaPicks, run))).toEqual([
      '24.00',
      '44.00',
      '68.00',
    ]);
    const lost = [...run.slice(0, 2), played(3, 'MON', 'OLY', [90, 84])];
    expect(stored(foldSurvival(astaPicks, lost))).toEqual([
      '24.00',
      '44.00',
      '0.00',
    ]);
  });

  it('foldSurvival: a total behind a pending pick is doubled too (provisional, R-34)', () => {
    const waiting = [
      played(1, 'REA', 'FEN', [70, 95]),
      played(2, 'ZAL', 'OLY'),
      played(3, 'MON', 'OLY', [80, 84]),
    ];
    const rows = foldSurvival(astaPicks, waiting);
    expect(stored(rows)).toEqual(['24.00', 'pending', '48.00']);
    expect(rows.map((row) => row.provisional)).toEqual([false, false, true]);
  });
});

describe('SU-2', () => {
  it("survival: a round stores the run's running total", () => {
    expect(stored(foldSurvival(astaPicks, run))).toEqual([
      '24.00',
      '44.00',
      '68.00',
    ]);
  });
});

describe('SU-3', () => {
  const games = [
    ...run,
    played(4, 'BAS', 'PAR', [70, 80]),
    played(5, 'VIR', 'EFE', [90, 80]),
  ];

  it('survival: a loss stores 0', () => {
    expect(
      stored(
        foldSurvival([pick(1, 'FEN'), pick(2, 'ZAL'), pick(4, 'BAS')], games),
      ),
    ).toEqual(['24.00', '44.00', '0.00']);
  });

  it('survival: the run after a loss starts from zero', () => {
    expect(
      stored(
        foldSurvival(
          [pick(1, 'FEN'), pick(2, 'ZAL'), pick(4, 'BAS'), pick(5, 'VIR')],
          games,
        ),
      ),
    ).toEqual(['24.00', '44.00', '0.00', '20.00']);
  });
});

describe('a team with two games in a round', () => {
  it('survival: the earlier game decides and pays, whatever order the games come in', () => {
    const first = played(1, 'ZAL', 'OLY', [90, 80]);
    const second = makeGame({
      id: 999,
      round: 1,
      home: 'MON',
      away: 'ZAL',
      tipOff: '2026-10-05T18:00:00Z',
      result: [90, 80],
    });
    for (const games of [
      [first, second],
      [second, first],
    ]) {
      expect(stored(foldSurvival([pick(1, 'ZAL')], games))).toEqual(['20.00']);
    }
  });
});

describe('SU-6', () => {
  it('survival: a round without a pick does not end the run', () => {
    // Zalgiris at home in round 3 (20), no pick in round 4, Olympiacos away
    // in round 5 (win): 44 (R-33).
    const games = [
      played(3, 'ZAL', 'MON', [85, 80]),
      played(5, 'VIR', 'OLY', [70, 75]),
    ];
    expect(
      stored(foldSurvival([pick(3, 'ZAL'), pick(5, 'OLY')], games)),
    ).toEqual(['20.00', '44.00']);
  });
});

describe('SU-8', () => {
  // Round 8: Asta picks Baskonia away; the game moves to December. Monaco at
  // home (round 9) and Fenerbahce away (round 10) win meanwhile.
  const later = [
    played(9, 'MON', 'PAR', [90, 80]),
    played(10, 'REA', 'FEN', [70, 95]),
  ];
  const picks = [pick(8, 'BAS'), pick(9, 'MON'), pick(10, 'FEN')];
  const postponed = played(8, 'ZAL', 'BAS');

  it('survival (ruled): a postponed pick is decided when its game is played', () => {
    const waiting = foldSurvival(picks, [postponed, ...later]);
    expect(stored(waiting)).toEqual(['pending', '20.00', '44.00']);
    expect(waiting.map((row) => row.provisional)).toEqual([false, true, true]);

    // December: a Baskonia win makes rounds 8-10 read 24, 44, 68 (R-34).
    const won = unwrap(postponed.withResult(score(80, 85)));
    const decided = foldSurvival(picks, [won, ...later]);
    expect(stored(decided)).toEqual(['24.00', '44.00', '68.00']);
    expect(decided.some((row) => row.provisional)).toBe(false);

    // A loss ends the run at round 8; rounds 9 onwards were a new run.
    const lost = unwrap(postponed.withResult(score(85, 80)));
    expect(stored(foldSurvival(picks, [lost, ...later]))).toEqual([
      '0.00',
      '20.00',
      '44.00',
    ]);
  });
});

describe('R-34: a pending pick after a prior total', () => {
  // Round 7: Zalgiris at home wins (10). Round 8: Baskonia's game is
  // postponed. Round 9: Monaco at home wins.
  const picks = [pick(7, 'ZAL'), pick(8, 'BAS'), pick(9, 'MON')];
  const postponed = played(8, 'BAS', 'PAR');
  const around = [
    played(7, 'ZAL', 'OLY', [90, 80]),
    played(9, 'MON', 'VIR', [90, 80]),
  ];

  it('survival (ruled): the round after the pending pick is provisional on the prior total', () => {
    const waiting = foldSurvival(picks, [...around, postponed]);
    expect(stored(waiting)).toEqual(['20.00', 'pending', '40.00']);
    expect(waiting.map((row) => row.provisional)).toEqual([false, false, true]);
  });

  it('survival (ruled): a loss of the pending pick drops the prior total too', () => {
    const lost = unwrap(postponed.withResult(score(80, 90)));
    expect(stored(foldSurvival(picks, [...around, lost]))).toEqual([
      '20.00',
      '0.00',
      '20.00',
    ]);
  });
});

describe('SU-9', () => {
  it('survival (ruled): a corrected result restores the run it ended', () => {
    // A Virtus picker on 24, 44, 68; the admin types Monaco - Virtus 80-78,
    // really 78-80, an away win.
    const mistaken = played(4, 'MON', 'VIR', [80, 78]);
    const picks = [...astaPicks, pick(4, 'VIR')];
    expect(stored(foldSurvival(picks, [...run, mistaken]))).toEqual([
      '24.00',
      '44.00',
      '68.00',
      '0.00',
    ]);
    const corrected = unwrap(mistaken.withResult(score(78, 80)));
    expect(stored(foldSurvival(picks, [...run, corrected]))).toEqual([
      '24.00',
      '44.00',
      '68.00',
      '92.00',
    ]);
  });
});

/** Random numbers from a seeded generator, as the property tests draw them. */
type Draw = () => number;

interface RandomSeason {
  readonly games: Game[];
  readonly picks: SurvivalPick[];
}

/** 30 rounds of ZAL - OLY, some skipped, a random winner and pick each. */
function zalOlySeason(next: Draw): RandomSeason {
  const games: Game[] = [];
  const picks: SurvivalPick[] = [];
  for (let round = 1; round <= 30; round++) {
    if (next() % 4 === 0) continue; // a skipped round
    const homeWins = next() % 3 !== 0;
    games.push(played(round, 'ZAL', 'OLY', homeWins ? [90, 80] : [80, 90]));
    picks.push(pick(round, next() % 2 === 0 ? 'ZAL' : 'OLY'));
  }
  return { games, picks };
}

/**
 * The rounds breaking the running total: a survival that did not raise it,
 * or a loss that did not reset it to 0.
 */
function roundsNotHolding(rows: ReturnType<typeof foldSurvival>): number[] {
  const broken: number[] = [];
  let previous = 0;
  for (const row of rows) {
    const value = row.points?.hundredths ?? 0;
    const holds = row.state === 'survived' ? value > previous : value === 0;
    if (!holds) broken.push(row.round);
    previous = value;
  }
  return broken;
}

describe('survival invariants', () => {
  it('survival: the stored rows cannot be changed from outside', () => {
    const rows = foldSurvival(astaPicks, run);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every((row) => Object.isFrozen(row))).toBe(true);
  });

  it('survival: running totals never decrease within a run', () => {
    let state = 7;
    const next = () =>
      (state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0);
    const broken = Array.from({ length: 200 }, (_, trial) => {
      const { games, picks } = zalOlySeason(next);
      return roundsNotHolding(foldSurvival(picks, games)).map(
        (round) => `trial ${String(trial)} round ${String(round)}`,
      );
    }).flat();
    expect(broken).toEqual([]);
  });

  it('survival: a run holds one pick per round', () => {
    expect(() => foldSurvival([pick(1, 'FEN'), pick(1, 'ZAL')], run)).toThrow(
      /one pick per round/,
    );
  });
});
