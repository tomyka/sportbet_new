import { describe, expect, it } from 'vitest';
import { fillIns, historyAfterResultCorrection } from '../fill-in/fill-in';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import {
  MatchPrediction,
  type PredictionOrigin,
} from '../prediction/match-prediction';
import { rankPlayers } from '../ranking/league-table';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import { refuse } from '../shared/result';
import type { TournamentId } from '../shared/ids';
import {
  at,
  gameNo,
  makeGame,
  player,
  seededDice,
  tournamentKey,
  unwrap,
} from '../testing';
import { PlayerStatus, type PredictionWrite } from './player-status';

const EUROLEAGUE = tournamentKey('euroleague-2026-27');
const EURO_2024 = tournamentKey('euro-2024');
const EURO_2028 = tournamentKey('euro-2028');

const missed = (
  status: PlayerStatus,
  times: number,
  rules: RuleSet,
  tournament = EUROLEAGUE,
  origin: 'fill-in' | 'late-fill-in' = 'fill-in',
): PlayerStatus =>
  Array.from({ length: times }).reduce<PlayerStatus>(
    (current) => current.afterFillIn(tournament, origin, rules),
    status,
  );

describe('PL-1', () => {
  it('player (sportbet): 5 fill-ins across tournaments switch a player off', () => {
    // Missed 3 games at Euro 2024, then 2 in the Euroleague.
    const euro = missed(PlayerStatus.NEW, 3, sportbetRules, EURO_2024);
    expect(missed(euro, 1, sportbetRules).switchedOff).toBe(false);
    const off = missed(euro, 2, sportbetRules);
    expect(off.switchedOff).toBe(true);

    // A save switches them back on without resetting the count, so the
    // next miss switches them off again.
    const back = off.afterRealPrediction(EUROLEAGUE, sportbetRules);
    expect(back.switchedOff).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
    expect(missed(back, 1, sportbetRules).switchedOff).toBe(true);
  });

  it('player (ruled): 20 fill-ins in a tournament switch a player off', () => {
    expect(missed(PlayerStatus.NEW, 19, ruledRules).switchedOff).toBe(false);
    expect(missed(PlayerStatus.NEW, 20, ruledRules).switchedOff).toBe(true);
    // The count starts from zero in each tournament.
    const elsewhere = missed(PlayerStatus.NEW, 19, ruledRules, EURO_2028);
    expect(missed(elsewhere, 1, ruledRules).switchedOff).toBe(false);
  });

  it('player (ruled): a real prediction resets the count', () => {
    const off = missed(PlayerStatus.NEW, 20, ruledRules);
    const back = off.afterRealPrediction(EUROLEAGUE, ruledRules);
    expect(back.switchedOff).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, ruledRules)).toBe(0);
    expect(missed(back, 19, ruledRules).switchedOff).toBe(false);
    expect(missed(back, 20, ruledRules).switchedOff).toBe(true);
  });

  it("player (ruled): a late joiner's fill-ins do not count", () => {
    const late = missed(
      PlayerStatus.NEW,
      25,
      ruledRules,
      EUROLEAGUE,
      'late-fill-in',
    );
    expect(late.switchedOff).toBe(false);
    expect(late.fillInCount(EUROLEAGUE, ruledRules)).toBe(0);
  });
});

describe('FI-1 and R-32', () => {
  it('fill-in (ruled): a switched-off player gets no fill-in', () => {
    const tomas = missed(PlayerStatus.NEW, 20, ruledRules);
    const game = makeGame({
      id: 1,
      round: 13,
      home: 'ZAL',
      away: 'REA',
      tipOff: '2027-01-08T18:00:00Z',
      result: [88, 79],
    });
    const blank = unwrap(
      MatchPrediction.enter(
        { player: player('tomas'), game: gameNo(1), home: null, away: null },
        ruledRules,
      ),
    );
    expect(tomas.getsFillIns()).toBe(false);
    expect(
      fillIns(
        game,
        [{ prediction: blank, switchedOff: !tomas.getsFillIns() }],
        seededDice(1),
        at('2027-01-08T20:00:00Z'),
      ),
    ).toEqual([]);
  });
});

describe('RA-4', () => {
  const hidden = (rules: RuleSet) =>
    PlayerStatus.NEW.hiddenByAdmin(rules).afterRealPrediction(
      EUROLEAGUE,
      rules,
    );
  const table = (status: PlayerStatus, rules: RuleSet) =>
    rankPlayers(
      [
        {
          player: player('ada'),
          username: 'ada',
          match: Points.whole(1800),
          serija: Points.ZERO,
          standings: StandingsPoints.ZERO,
          survival: Points.ZERO,
          listed: status.isListed(),
        },
      ],
      'league-table',
      rules,
    ).map((row) => row.username);

  it('ranking (ruled): an admin-hidden player stays hidden after saving a prediction', () => {
    expect(hidden(ruledRules).isListed()).toBe(false);
    expect(table(hidden(ruledRules), ruledRules)).toEqual([]);
  });

  it('ranking (sportbet): saving a prediction brings an admin-hidden player back', () => {
    expect(PlayerStatus.NEW.hiddenByAdmin(sportbetRules).isListed()).toBe(
      false,
    );
    expect(table(hidden(sportbetRules), sportbetRules)).toEqual(['ada']);
  });

  it('ranking: a hidden player keeps their points for when they come back', () => {
    const off = missed(PlayerStatus.NEW, 20, ruledRules);
    expect(table(off, ruledRules)).toEqual([]);
    expect(
      table(off.afterRealPrediction(EUROLEAGUE, ruledRules), ruledRules),
    ).toEqual(['ada']);
  });
});

/** A write to one prediction row, a minute after the one before. */
const write = (
  index: number,
  game: number,
  origin: PredictionOrigin,
  tournament = EUROLEAGUE,
): PredictionWrite => ({
  tournament,
  game: gameNo(game),
  origin,
  at: at(`2026-10-01T10:${String(index).padStart(2, '0')}:00Z`),
});
const writes = (
  entries: readonly (readonly [number, PredictionOrigin, TournamentId?])[],
) =>
  entries.map(([game, origin, tournament], index) =>
    write(index, game, origin, tournament),
  );

describe('PL-1: the status from the prediction history', () => {
  it.each([
    ['sportbet', sportbetRules],
    ['ruled', ruledRules],
  ] as const)(
    'player: the history gives the status the steps give (%s)',
    (_, rules) => {
      const history = writes([
        [1, 'fill-in', EURO_2024],
        [2, 'fill-in', EURO_2024],
        [3, 'fill-in', EURO_2024],
        [11, 'fill-in'],
        [12, 'fill-in'],
        [13, 'real'],
        [14, 'fill-in'],
        [15, 'late-fill-in'],
      ]);
      const steps: ((status: PlayerStatus) => PlayerStatus)[] = [
        (status) => missed(status, 3, rules, EURO_2024),
        (status) => missed(status, 2, rules),
        (status) => status.afterRealPrediction(EUROLEAGUE, rules),
        (status) => missed(status, 1, rules),
        (status) => missed(status, 1, rules, EUROLEAGUE, 'late-fill-in'),
      ];
      const stepped = steps.reduce(
        (status, step) => step(status),
        PlayerStatus.NEW,
      );
      const derived = PlayerStatus.fromHistory(history, rules);
      expect(derived.switchedOff).toBe(stepped.switchedOff);
      for (const tournament of [EUROLEAGUE, EURO_2024]) {
        expect(derived.fillInCount(tournament, rules)).toBe(
          stepped.fillInCount(tournament, rules),
        );
      }
    },
  );

  it('player (sportbet): the count is the stored fill-in rows, over every tournament', () => {
    // Five fill-ins switch the player off; one of them is later overwritten
    // by a real save, so COUNT(generated = 1) is 4 until the next fill-in.
    const history = writes([
      [1, 'fill-in', EURO_2024],
      [2, 'fill-in', EURO_2024],
      [11, 'fill-in'],
      [12, 'fill-in'],
      [13, 'fill-in'],
      [13, 'real'],
    ]);
    const back = PlayerStatus.fromHistory(history, sportbetRules);
    expect(back.switchedOff).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, sportbetRules)).toBe(4);
    const again = PlayerStatus.fromHistory(
      [...history, write(59, 14, 'fill-in')],
      sportbetRules,
    );
    expect(again.switchedOff).toBe(true);
    expect(again.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
  });

  it('player (ruled): an admin hide is kept apart from the history', () => {
    const hidden = PlayerStatus.fromHistory(
      writes([[11, 'real']]),
      ruledRules,
      { adminHidden: true },
    );
    expect(hidden.adminHidden).toBe(true);
    expect(hidden.switchedOff).toBe(false);
    expect(hidden.isListed()).toBe(false);
  });
});

describe('R-5: a correction undoes the switch-off it caused', () => {
  // Monaco - Virtus (game 20) tips off at 18:00; at 16:00 the admin enters
  // a result by mistake and the player, who had not predicted it, is filled
  // in. The correction removes that fill-in under the ruled set (FI-4).
  const monVir = makeGame({
    id: 20,
    round: 9,
    home: 'MON',
    away: 'VIR',
    tipOff: '2026-11-20T18:00:00Z',
    result: [80, 78],
  });
  const mistaken: PredictionWrite = {
    tournament: EUROLEAGUE,
    game: gameNo(20),
    origin: 'fill-in',
    at: at('2026-11-20T16:00:00Z'),
  };
  const before = (count: number) =>
    Array.from({ length: count }, (_, n) => write(n, n + 1, 'fill-in'));

  it('player (ruled): the mistaken fill-in no longer counts', () => {
    const history = [...before(19), mistaken];
    expect(PlayerStatus.fromHistory(history, ruledRules).switchedOff).toBe(
      true,
    );
    const corrected = PlayerStatus.fromHistory(
      historyAfterResultCorrection(history, monVir, ruledRules),
      ruledRules,
    );
    expect(corrected.switchedOff).toBe(false);
    expect(corrected.fillInCount(EUROLEAGUE, ruledRules)).toBe(19);
  });

  it('player (sportbet): the mistaken fill-in keeps counting', () => {
    const history = [...before(4), mistaken];
    const corrected = PlayerStatus.fromHistory(
      historyAfterResultCorrection(history, monVir, sportbetRules),
      sportbetRules,
    );
    expect(corrected.switchedOff).toBe(true);
    expect(corrected.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
  });
});

describe('PlayerStatus.of: a stored status read back', () => {
  it('player (ruled): keeps each tournament count as stored', () => {
    const status = unwrap(
      PlayerStatus.of(
        {
          switchedOff: true,
          adminHidden: true,
          fillIns: new Map([
            [EUROLEAGUE, 20],
            [EURO_2028, 3],
          ]),
        },
        ruledRules,
      ),
    );
    expect(status.switchedOff).toBe(true);
    expect(status.adminHidden).toBe(true);
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(20);
    expect(status.fillInCount(EURO_2028, ruledRules)).toBe(3);
  });

  it('player (sportbet): the counts add up to one lifetime count', () => {
    const status = unwrap(
      PlayerStatus.of(
        {
          switchedOff: false,
          adminHidden: false,
          fillIns: new Map([
            [EUROLEAGUE, 2],
            [EURO_2024, 2],
          ]),
        },
        sportbetRules,
      ),
    );
    expect(status.fillInCount(EUROLEAGUE, sportbetRules)).toBe(4);
    expect(
      status.afterFillIn(EUROLEAGUE, 'fill-in', sportbetRules).switchedOff,
    ).toBe(true);
  });

  it.each([
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('player: refuses %s', (_, count) => {
    expect(
      PlayerStatus.of(
        {
          switchedOff: false,
          adminHidden: false,
          fillIns: new Map([[EUROLEAGUE, count]]),
        },
        ruledRules,
      ),
    ).toEqual(refuse('bad-count'));
  });

  it('player (sportbet): refuses an admin hide apart from the switch', () => {
    expect(
      PlayerStatus.of(
        { switchedOff: true, adminHidden: true, fillIns: new Map() },
        sportbetRules,
      ),
    ).toEqual(refuse('admin-hide-is-the-switch'));
  });
});

describe('PlayerStatus', () => {
  it('player: the counts cannot be changed from outside', () => {
    const status = missed(PlayerStatus.NEW, 3, ruledRules);
    expect(Object.isFrozen(status)).toBe(true);
    expect('fillIns' in status).toBe(false);
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(3);
  });
});
