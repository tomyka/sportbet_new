import { describe, expect, it } from 'vitest';
import type { Game } from '../round/game';
import { makeGame, roundNo, score, team, unwrap } from '../testing';
import {
  foldSurvival,
  survivalAtResultEntry,
  type SurvivalPick,
  type SurvivalRow,
} from './survival-fold';

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
  it('survival: an away win pays 12', () => {
    expect(stored(foldSurvival([pick(1, 'FEN')], run))).toEqual(['12.00']);
  });

  it('survival: a home win pays 10', () => {
    expect(stored(foldSurvival([pick(2, 'ZAL')], run))).toEqual(['10.00']);
  });
});

describe('SU-2', () => {
  it("survival: a round stores the run's running total", () => {
    expect(stored(foldSurvival(astaPicks, run))).toEqual([
      '12.00',
      '22.00',
      '34.00',
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
    ).toEqual(['12.00', '22.00', '0.00']);
  });

  it('survival: the run after a loss starts from zero', () => {
    expect(
      stored(
        foldSurvival(
          [pick(1, 'FEN'), pick(2, 'ZAL'), pick(4, 'BAS'), pick(5, 'VIR')],
          games,
        ),
      ),
    ).toEqual(['12.00', '22.00', '0.00', '10.00']);
  });
});

describe('SU-6', () => {
  it('survival (sportbet): a round without a pick does not end the run', () => {
    // Zalgiris at home in round 3 (10), no pick in round 4, Olympiacos away
    // in round 5 (win): 22. R-33 rules the same for the ruled set, so the
    // fold takes no rule set.
    const games = [
      played(3, 'ZAL', 'MON', [85, 80]),
      played(5, 'VIR', 'OLY', [70, 75]),
    ];
    expect(
      stored(foldSurvival([pick(3, 'ZAL'), pick(5, 'OLY')], games)),
    ).toEqual(['10.00', '22.00']);
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
    expect(stored(waiting)).toEqual(['pending', '10.00', '22.00']);
    expect(waiting.map((row) => row.provisional)).toEqual([false, true, true]);

    // December: a Baskonia win makes rounds 8-10 read 12, 22, 34 (R-34).
    const won = unwrap(postponed.withResult(score(80, 85)));
    const decided = foldSurvival(picks, [won, ...later]);
    expect(stored(decided)).toEqual(['12.00', '22.00', '34.00']);
    expect(decided.some((row) => row.provisional)).toBe(false);

    // A loss ends the run at round 8; rounds 9 onwards were a new run.
    const lost = unwrap(postponed.withResult(score(85, 80)));
    expect(stored(foldSurvival(picks, [lost, ...later]))).toEqual([
      '0.00',
      '10.00',
      '22.00',
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
    expect(stored(waiting)).toEqual(['10.00', 'pending', '20.00']);
    expect(waiting.map((row) => row.provisional)).toEqual([false, false, true]);
  });

  it('survival (ruled): a loss of the pending pick drops the prior total too', () => {
    const lost = unwrap(postponed.withResult(score(80, 90)));
    expect(stored(foldSurvival(picks, [...around, lost]))).toEqual([
      '10.00',
      '0.00',
      '10.00',
    ]);
  });
});

describe('SU-9', () => {
  it('survival (ruled): a corrected result restores the run it ended', () => {
    // A Virtus picker on 12, 22, 34; the admin types Monaco - Virtus 80-78,
    // really 78-80, an away win.
    const mistaken = played(4, 'MON', 'VIR', [80, 78]);
    const picks = [...astaPicks, pick(4, 'VIR')];
    expect(stored(foldSurvival(picks, [...run, mistaken]))).toEqual([
      '12.00',
      '22.00',
      '34.00',
      '0.00',
    ]);
    const corrected = unwrap(mistaken.withResult(score(78, 80)));
    expect(stored(foldSurvival(picks, [...run, corrected]))).toEqual([
      '12.00',
      '22.00',
      '34.00',
      '46.00',
    ]);
  });
});

describe('SU-10', () => {
  it('survival (sportbet): the fold reproduces the running totals of an in-order run', () => {
    const games = [
      ...run,
      played(4, 'BAS', 'PAR', [70, 80]),
      played(5, 'VIR', 'EFE', [90, 80]),
    ];
    const picks = [...astaPicks, pick(4, 'BAS'), pick(5, 'VIR')];
    expect(survivalAtResultEntry(picks, games)).toEqual(
      foldSurvival(picks, games),
    );
  });

  it('survival (sportbet): the fold differs from the running total after a re-pick', () => {
    // Home wins in rounds 1-4, round 1 on Zalgiris; in round 5 Zalgiris is
    // picked again and wins away.
    const games = [
      played(1, 'ZAL', 'OLY', [90, 80]),
      played(2, 'REA', 'FEN', [90, 80]),
      played(3, 'MON', 'VIR', [90, 80]),
      played(4, 'BAS', 'PAR', [90, 80]),
      played(5, 'EFE', 'ZAL', [80, 90]),
    ];
    const picks = [
      pick(1, 'ZAL'),
      pick(2, 'REA'),
      pick(3, 'MON'),
      pick(4, 'BAS'),
      pick(5, 'ZAL'),
    ];
    expect(stored(survivalAtResultEntry(picks, games))).toEqual([
      '10.00',
      '20.00',
      '30.00',
      '40.00',
      '42.00',
    ]);
    expect(stored(foldSurvival(picks, games))).toEqual([
      '10.00',
      '20.00',
      '30.00',
      '40.00',
      '52.00',
    ]);
  });
});

describe('survival invariants', () => {
  it('survival: the stored rows cannot be changed from outside', () => {
    for (const rows of [
      foldSurvival(astaPicks, run),
      survivalAtResultEntry(astaPicks, run),
    ]) {
      expect(Object.isFrozen(rows)).toBe(true);
      expect(rows.every((row) => Object.isFrozen(row))).toBe(true);
    }
  });

  it('survival: running totals never decrease within a run', () => {
    let state = 7;
    const next = () =>
      (state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0);
    const broken: string[] = [];
    for (let trial = 0; trial < 200; trial++) {
      const games: Game[] = [];
      const picks: SurvivalPick[] = [];
      for (let round = 1; round <= 30; round++) {
        if (next() % 4 === 0) continue; // a skipped round
        const homeWins = next() % 3 !== 0;
        games.push(played(round, 'ZAL', 'OLY', homeWins ? [90, 80] : [80, 90]));
        picks.push(pick(round, next() % 2 === 0 ? 'ZAL' : 'OLY'));
      }
      let previous = 0;
      for (const row of foldSurvival(picks, games)) {
        const value = row.points?.hundredths ?? 0;
        const holds = row.state === 'survived' ? value > previous : value === 0;
        if (!holds)
          broken.push(`trial ${String(trial)} round ${String(row.round)}`);
        previous = value;
      }
    }
    expect(broken).toEqual([]);
  });

  it('survival (sportbet): with no team picked twice in a run, both passes agree', () => {
    // Random runs over 20 teams, each picked at most once per run (a loss
    // starts a new run), with skipped rounds, home and away wins and
    // losses, every game decided in round order.
    let state = 11;
    const next = () =>
      (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0);
    const teams = Array.from({ length: 20 }, (_, n) => `T${String(n + 1)}`);
    for (let trial = 0; trial < 300; trial++) {
      const games: Game[] = [];
      const picks: SurvivalPick[] = [];
      let used = new Set<string>();
      for (let round = 1; round <= 38; round++) {
        const free = teams.filter((each) => !used.has(each));
        if (next() % 4 === 0 || free.length === 0) continue; // a skip
        const picked = free[next() % free.length] ?? 'T1';
        const atHome = next() % 2 === 0;
        const wins = next() % 4 !== 0;
        const opponent = `X${String(round)}`;
        games.push(
          played(
            round,
            atHome ? picked : opponent,
            atHome ? opponent : picked,
            atHome === wins ? [90, 80] : [80, 90],
          ),
        );
        picks.push(pick(round, picked));
        used = wins ? new Set([...used, picked]) : new Set();
      }
      const folded = foldSurvival(picks, games);
      expect(folded.some((row) => row.state === 'pending')).toBe(false);
      expect(survivalAtResultEntry(picks, games)).toEqual(folded);
    }
  });

  it('survival: a run holds one pick per round', () => {
    expect(() => foldSurvival([pick(1, 'FEN'), pick(1, 'ZAL')], run)).toThrow(
      /one pick per round/,
    );
  });
});
