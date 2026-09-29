import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { MatchPrediction } from '../prediction/match-prediction';
import { scoreMatch } from '../prediction/match-scoring';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  score,
  scriptedDice,
  seededDice,
  tournamentKey,
  unwrap,
} from '../testing';
import {
  afterResultCorrection,
  fillIns,
  fillInScore,
  historyAfterResultCorrection,
  lateJoinerFillIns,
} from './fill-in';

const row = (name: string, home: number | null, away: number | null) =>
  unwrap(
    MatchPrediction.enter(
      { player: player(name), game: gameNo(1), home, away },
      sportbetRules,
    ),
  );

// Zalgiris - Olympiacos, 88-79, result entered at 20:00.
const zalOly = makeGame({
  id: 1,
  round: 1,
  home: 'ZAL',
  away: 'OLY',
  tipOff: '2026-10-02T18:00:00Z',
  result: [88, 79],
});
const resultEntered = at('2026-10-02T20:00:00Z');
// Every fill-in below is 80-81: rolls 9, 12, 4 and 17, 3, 5 give 80-80 and
// the coin moves the away side up.
const eighty = () =>
  scriptedDice([9, 12, 4, 17, 3, 5, 9, 12, 4, 17, 3, 5], [true, true]);

describe('FI-1', () => {
  it('fill-in: an unanswered prediction is filled in', () => {
    const made = fillIns(
      zalOly,
      [
        { prediction: row('ada', null, null), switchedOff: false },
        { prediction: row('ben', 85, 80), switchedOff: false },
      ],
      eighty(),
      resultEntered,
    );
    expect(made).toHaveLength(1);
    expect(made[0]?.player).toBe(player('ada'));
    expect(made[0]?.origin).toBe('fill-in');
    expect([made[0]?.home, made[0]?.away]).toEqual([80, 81]);
    expect(made[0]?.filledInAt).toBe(resultEntered);
  });

  it('fill-in (sportbet): a switched-off player gets no fill-in', () => {
    // R-32 keeps this rule for the ruled set: fillIns takes no rule set.
    const made = fillIns(
      zalOly,
      [{ prediction: row('tomas', null, null), switchedOff: true }],
      eighty(),
      resultEntered,
    );
    expect(made).toEqual([]);
  });
});

describe('MS-2', () => {
  it('fill-in (sportbet): an away-only prediction is overwritten by a fill-in', () => {
    const made = fillIns(
      zalOly,
      [
        { prediction: row('ada', null, 80), switchedOff: false },
        { prediction: row('ben', 85, null), switchedOff: false },
      ],
      eighty(),
      resultEntered,
    );
    expect(made.map((prediction) => prediction.player)).toEqual([
      player('ada'),
    ]);
    expect([made[0]?.home, made[0]?.away]).toEqual([80, 81]);
  });
});

describe('FI-2', () => {
  it('fill-in score: each side lies within 55-106', () => {
    expect(fillInScore(scriptedDice([0, 0, 0, 17, 17, 17]))).toEqual(
      score(55, 106),
    );
    const dice = seededDice(2026);
    for (let draw = 0; draw < 5_000; draw++) {
      const { home, away } = fillInScore(dice);
      expect(home).toBeGreaterThanOrEqual(55);
      expect(home).toBeLessThanOrEqual(106);
      // Only a level pair's nudged away side can reach 54 or 107.
      expect(away).toBeGreaterThanOrEqual(54);
      expect(away).toBeLessThanOrEqual(107);
      expect(home).not.toBe(away);
    }
  });

  it('fill-in score: a level pair is moved one point apart', () => {
    expect(fillInScore(scriptedDice([9, 12, 4, 17, 3, 5], [true]))).toEqual(
      score(80, 81),
    );
    expect(fillInScore(scriptedDice([9, 12, 4, 17, 3, 5], [false]))).toEqual(
      score(80, 79),
    );
  });

  it('fill-in score: a die outside 0-17 is a broken port', () => {
    expect(() => fillInScore(scriptedDice([18, 0, 0, 0, 0, 0]))).toThrow(
      /0-17/,
    );
  });
});

describe('FI-4', () => {
  // Partizan - Monaco tips off 11-20 18:00; the admin enters a result at
  // 16:00 by mistake and clears it.
  const parMon = makeGame({
    id: 1,
    round: 9,
    home: 'PAR',
    away: 'MON',
    tipOff: '2026-11-20T18:00:00Z',
  });
  const early = fillIns(
    parMon,
    [{ prediction: row('ada', null, null), switchedOff: false }],
    eighty(),
    at('2026-11-20T16:00:00Z'),
  );

  it('fill-in (ruled): fill-ins made by a mistaken early result are removed', () => {
    const after = afterResultCorrection(early, parMon, ruledRules);
    expect(after.map((prediction) => prediction.isAnswered())).toEqual([false]);
    // The row is blank again, so ada can still predict before 18:00.
    expect(after[0]?.origin).toBe('real');
  });

  it('fill-in (sportbet): fill-ins made by a mistaken early result stay', () => {
    expect(afterResultCorrection(early, parMon, sportbetRules)).toEqual(early);
  });

  it('fill-in: a fill-in made after tip-off survives a correction', () => {
    const late = fillIns(
      parMon,
      [{ prediction: row('ada', null, null), switchedOff: false }],
      eighty(),
      at('2026-11-20T20:00:00Z'),
    );
    expect(afterResultCorrection(late, parMon, ruledRules)).toEqual(late);
  });
});

describe('LR-5', () => {
  it('result (ruled): a correction replays the game as if the mistake never happened', () => {
    // Monaco - Virtus tips off at 18:00. At 16:00 the admin types 80-78 by
    // mistake: ada, who had not predicted yet, is filled in. At 20:30 the
    // real result, 78-80, replaces it.
    const scheduled = makeGame({
      id: 1,
      round: 9,
      home: 'MON',
      away: 'VIR',
      tipOff: '2026-11-20T18:00:00Z',
    });
    const mistaken = unwrap(scheduled.withResult(score(80, 78), ruledRules));
    const early = fillIns(
      mistaken,
      [{ prediction: row('ada', null, null), switchedOff: false }],
      scriptedDice([17, 8, 5, 0, 0, 0]),
      at('2026-11-20T16:00:00Z'),
    );
    expect([early[0]?.home, early[0]?.away]).toEqual([85, 55]);

    // The correction removes that fill-in; the replayed result fills her in
    // afresh, as if 16:00 never happened.
    const corrected = unwrap(scheduled.withResult(score(78, 80), ruledRules));
    const cleared = afterResultCorrection(early, corrected, ruledRules);
    const replayed = fillIns(
      corrected,
      cleared.map((prediction) => ({ prediction, switchedOff: false })),
      eighty(),
      at('2026-11-20T20:30:00Z'),
    );
    expect([replayed[0]?.home, replayed[0]?.away]).toEqual([80, 81]);
    const [refilled] = replayed;
    if (refilled === undefined) throw new Error('expected a fill-in');
    const points = scoreMatch(
      refilled,
      corrected,
      makeRound({ number: 9 }, ruledRules),
      CrowdOdds.forGame([], ruledRules),
    );
    // An away call on 78-80: the flat 50, and 50 - |-1 - -2| = 49.
    expect(points?.full.toString()).toBe('99.00');
  });
});

describe('PL-2', () => {
  // Jonas joins in round 3: two games have been played, one has not.
  const played = [
    zalOly,
    makeGame({
      id: 2,
      round: 1,
      home: 'REA',
      away: 'FEN',
      tipOff: '2026-10-02T20:00:00Z',
      result: [70, 95],
    }),
  ];
  const upcoming = makeGame({
    id: 3,
    round: 3,
    home: 'MON',
    away: 'VIR',
    tipOff: '2026-10-16T18:00:00Z',
  });
  const joined = at('2026-10-14T12:00:00Z');

  it('late joiner (ruled): each played game gets a fill-in', () => {
    const made = lateJoinerFillIns(
      player('jonas'),
      [...played, upcoming],
      scriptedDice([9, 12, 6, 17, 1, 3, 0, 0, 0, 17, 17, 17]),
      joined,
      ruledRules,
    );
    expect(made.map((prediction) => prediction.game)).toEqual([
      gameNo(1),
      gameNo(2),
    ]);
    expect(
      made.every((prediction) => prediction.origin === 'late-fill-in'),
    ).toBe(true);
    // The one on 88-79 is 82-76: 97 points (FI-3).
    const [first] = made;
    if (first === undefined) throw new Error('expected a fill-in');
    const points = scoreMatch(
      first,
      zalOly,
      makeRound({ number: 1 }, ruledRules),
      CrowdOdds.forGame([], ruledRules),
    );
    expect(points?.full.toString()).toBe('97.00');
    expect(points?.extendsSerija).toBe(false);
  });

  it("late joiner (ruled): the fill-ins change nobody else's odds", () => {
    const others = [row('ada', 85, 80), row('ben', 79, 88), row('cai', 90, 80)];
    const late = lateJoinerFillIns(
      player('jonas'),
      [zalOly],
      scriptedDice([0, 0, 0, 17, 17, 17]),
      joined,
      ruledRules,
    );
    expect(CrowdOdds.forGame([...others, ...late], ruledRules)).toEqual(
      CrowdOdds.forGame(others, ruledRules),
    );
  });

  it('late joiner (ruled): a game under way without a result gets a late fill-in too', () => {
    // Jonas joins at 18:30 while Monaco - Virtus is being played: he can no
    // longer predict it, and its result-entry fill-in would count toward
    // R-7. A game postponed before its tip-off will reopen, so it waits.
    const inPlay = at('2026-10-16T18:30:00Z');
    const postponed = unwrap(
      makeGame({
        id: 4,
        round: 3,
        home: 'BAS',
        away: 'PAR',
        tipOff: '2026-10-16T18:00:00Z',
      }).postpone(at('2026-10-15T12:00:00Z'), ruledRules),
    );
    const made = lateJoinerFillIns(
      player('jonas'),
      [upcoming, postponed],
      scriptedDice([0, 0, 0, 17, 17, 17]),
      inPlay,
      ruledRules,
    );
    expect(made.map((prediction) => prediction.game)).toEqual([gameNo(3)]);
    expect(made[0]?.origin).toBe('late-fill-in');
    // At the result, his row is no longer blank: no ordinary fill-in.
    const scored = unwrap(upcoming.withResult(score(80, 70), ruledRules));
    expect(
      fillIns(
        scored,
        made.map((prediction) => ({ prediction, switchedOff: false })),
        seededDice(1),
        at('2026-10-16T20:00:00Z'),
      ),
    ).toEqual([]);
  });

  it('late joiner (sportbet): nobody joins late, so nobody is filled in', () => {
    expect(
      lateJoinerFillIns(
        player('jonas'),
        played,
        seededDice(1),
        joined,
        sportbetRules,
      ),
    ).toEqual([]);
  });
});

describe('fill-in results', () => {
  it('fill-in: every list returned is frozen', () => {
    const candidates = [
      { prediction: row('ada', null, null), switchedOff: false },
    ];
    const made = fillIns(zalOly, candidates, eighty(), resultEntered);
    const lists = [
      made,
      afterResultCorrection(made, zalOly, ruledRules),
      historyAfterResultCorrection(
        [
          {
            tournament: tournamentKey('EL'),
            game: gameNo(1),
            origin: 'real',
            at: resultEntered,
          },
        ],
        zalOly,
        ruledRules,
      ),
      lateJoinerFillIns(
        player('jonas'),
        [zalOly],
        seededDice(1),
        resultEntered,
        ruledRules,
      ),
      lateJoinerFillIns(
        player('jonas'),
        [zalOly],
        seededDice(1),
        resultEntered,
        sportbetRules,
      ),
    ];
    for (const list of lists) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });
});
