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
import {
  fillInCountInvariant,
  PlayerStatus,
  type PredictionWrite,
} from './player-status';

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

/** Switched off in the Euroleague, unless another tournament is named. */
const off = (status: PlayerStatus, rules: RuleSet, tournament = EUROLEAGUE) =>
  status.isSwitchedOffIn(tournament, rules);

describe('PL-1', () => {
  it('player (sportbet): 5 fill-ins across tournaments switch a player off', () => {
    // Missed 3 games at Euro 2024, then 2 in the Euroleague.
    const euro = missed(PlayerStatus.NEW, 3, sportbetRules, EURO_2024);
    expect(off(missed(euro, 1, sportbetRules), sportbetRules)).toBe(false);
    const five = missed(euro, 2, sportbetRules);
    expect(off(five, sportbetRules)).toBe(true);
    // One switch: off in every tournament.
    expect(off(five, sportbetRules, EURO_2024)).toBe(true);

    // A save switches them back on without resetting the count, so the
    // next miss switches them off again.
    const back = five.afterRealPrediction(EUROLEAGUE, sportbetRules);
    expect(off(back, sportbetRules)).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
    expect(off(missed(back, 1, sportbetRules), sportbetRules)).toBe(true);
  });

  it('player (ruled): 20 fill-ins in a tournament switch a player off', () => {
    expect(off(missed(PlayerStatus.NEW, 19, ruledRules), ruledRules)).toBe(
      false,
    );
    expect(off(missed(PlayerStatus.NEW, 20, ruledRules), ruledRules)).toBe(
      true,
    );
    // The count starts from zero in each tournament.
    const elsewhere = missed(PlayerStatus.NEW, 19, ruledRules, EURO_2028);
    const plusOne = missed(elsewhere, 1, ruledRules);
    expect(off(plusOne, ruledRules)).toBe(false);
    expect(off(plusOne, ruledRules, EURO_2028)).toBe(false);
  });

  it('player (ruled): a real prediction resets the count', () => {
    const twenty = missed(PlayerStatus.NEW, 20, ruledRules);
    const back = twenty.afterRealPrediction(EUROLEAGUE, ruledRules);
    expect(off(back, ruledRules)).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, ruledRules)).toBe(0);
    expect(off(missed(back, 19, ruledRules), ruledRules)).toBe(false);
    expect(off(missed(back, 20, ruledRules), ruledRules)).toBe(true);
  });

  it("player (ruled): a late joiner's fill-ins do not count", () => {
    const late = missed(
      PlayerStatus.NEW,
      25,
      ruledRules,
      EUROLEAGUE,
      'late-fill-in',
    );
    expect(off(late, ruledRules)).toBe(false);
    expect(late.fillInCount(EUROLEAGUE, ruledRules)).toBe(0);
  });
});

describe('PL-1 and R-7: switched off per tournament', () => {
  it('player (ruled): switched off in one tournament, still on in another', () => {
    const status = missed(PlayerStatus.NEW, 20, ruledRules);
    expect(off(status, ruledRules)).toBe(true);
    expect(off(status, ruledRules, EURO_2028)).toBe(false);
    expect(status.isListedIn(EUROLEAGUE, ruledRules)).toBe(false);
    expect(status.isListedIn(EURO_2028, ruledRules)).toBe(true);
  });

  it('player (ruled): a real save in another tournament does not switch them back on', () => {
    const status = missed(PlayerStatus.NEW, 20, ruledRules).afterRealPrediction(
      EURO_2028,
      ruledRules,
    );
    expect(off(status, ruledRules)).toBe(true);
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(20);
    // A save in the Euroleague itself does.
    expect(
      off(status.afterRealPrediction(EUROLEAGUE, ruledRules), ruledRules),
    ).toBe(false);
  });

  it('player (sportbet): a real save in any tournament switches them back on everywhere', () => {
    const status = missed(PlayerStatus.NEW, 5, sportbetRules);
    expect(off(status, sportbetRules, EURO_2028)).toBe(true);
    const back = status.afterRealPrediction(EURO_2028, sportbetRules);
    expect(off(back, sportbetRules)).toBe(false);
    expect(back.isListedIn(EUROLEAGUE, sportbetRules)).toBe(true);
  });

  it('player (ruled): the history switches them off per tournament too', () => {
    const history = [
      ...Array.from({ length: 20 }, (_, n) => write(n, n + 1, 'fill-in')),
      write(30, 101, 'real', EURO_2028),
    ];
    const status = PlayerStatus.fromHistory(history, ruledRules);
    expect(off(status, ruledRules)).toBe(true);
    expect(off(status, ruledRules, EURO_2028)).toBe(false);
    // Under sportbet the save anywhere switches the one switch back on.
    expect(
      off(PlayerStatus.fromHistory(history, sportbetRules), sportbetRules),
    ).toBe(false);
  });
});

describe('FI-1 and R-32', () => {
  const game = makeGame({
    id: 1,
    round: 13,
    home: 'ZAL',
    away: 'REA',
    tipOff: '2027-01-08T18:00:00Z',
    result: [88, 79],
  });
  const blank = unwrap(
    MatchPrediction.enter({
      player: player('tomas'),
      game: gameNo(1),
      home: null,
      away: null,
    }),
  );
  const filledIn = (status: PlayerStatus, tournament: TournamentId) =>
    fillIns(
      game,
      [
        {
          prediction: blank,
          switchedOff: !status.getsFillInsIn(tournament, ruledRules),
        },
      ],
      seededDice(1),
      at('2027-01-08T20:00:00Z'),
    );

  it('fill-in (ruled): a switched-off player gets no fill-in', () => {
    const tomas = missed(PlayerStatus.NEW, 20, ruledRules);
    expect(tomas.getsFillInsIn(EUROLEAGUE, ruledRules)).toBe(false);
    expect(filledIn(tomas, EUROLEAGUE)).toEqual([]);
  });

  it('fill-in (ruled): switched off in one tournament, still filled in in another (R-32 per tournament)', () => {
    const tomas = missed(PlayerStatus.NEW, 20, ruledRules, EURO_2028);
    expect(tomas.getsFillInsIn(EURO_2028, ruledRules)).toBe(false);
    expect(tomas.getsFillInsIn(EUROLEAGUE, ruledRules)).toBe(true);
    expect(filledIn(tomas, EUROLEAGUE)).toHaveLength(1);
  });

  it('fill-in (sportbet): switched off anywhere, no fill-ins anywhere', () => {
    const tomas = missed(PlayerStatus.NEW, 5, sportbetRules, EURO_2024);
    expect(tomas.getsFillInsIn(EUROLEAGUE, sportbetRules)).toBe(false);
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
          match: unwrap(Points.whole(1800)),
          serija: Points.ZERO,
          standings: StandingsPoints.ZERO,
          survival: Points.ZERO,
          listed: status.isListedIn(EUROLEAGUE, rules),
        },
      ],
      'league-table',
      rules,
    ).map((row) => row.username);

  it('ranking (ruled): an admin-hidden player stays hidden after saving a prediction', () => {
    expect(hidden(ruledRules).isListedIn(EUROLEAGUE, ruledRules)).toBe(false);
    expect(table(hidden(ruledRules), ruledRules)).toEqual([]);
  });

  it('ranking (sportbet): saving a prediction brings an admin-hidden player back', () => {
    expect(
      PlayerStatus.NEW.hiddenByAdmin(sportbetRules).isListedIn(
        EUROLEAGUE,
        sportbetRules,
      ),
    ).toBe(false);
    expect(table(hidden(sportbetRules), sportbetRules)).toEqual(['ada']);
  });

  it('ranking: a hidden player keeps their points for when they come back', () => {
    const twenty = missed(PlayerStatus.NEW, 20, ruledRules);
    expect(table(twenty, ruledRules)).toEqual([]);
    expect(
      table(twenty.afterRealPrediction(EUROLEAGUE, ruledRules), ruledRules),
    ).toEqual(['ada']);
  });
});

/** A write to one prediction row, a minute after the one before. */
function write(
  index: number,
  game: number,
  origin: PredictionOrigin,
  tournament = EUROLEAGUE,
): PredictionWrite {
  return {
    tournament,
    game: gameNo(game),
    origin,
    at: at(`2026-10-01T10:${String(index).padStart(2, '0')}:00Z`),
  };
}
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
      for (const tournament of [EUROLEAGUE, EURO_2024]) {
        expect(off(derived, rules, tournament)).toBe(
          off(stepped, rules, tournament),
        );
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
    expect(off(back, sportbetRules)).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, sportbetRules)).toBe(4);
    const again = PlayerStatus.fromHistory(
      [...history, write(59, 14, 'fill-in')],
      sportbetRules,
    );
    expect(off(again, sportbetRules)).toBe(true);
    expect(again.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
  });

  it('player (ruled): an admin hide is kept apart from the history', () => {
    const hidden = PlayerStatus.fromHistory(
      writes([[11, 'real']]),
      ruledRules,
      { adminHidden: true },
    );
    expect(hidden.adminHidden).toBe(true);
    expect(off(hidden, ruledRules)).toBe(false);
    expect(hidden.isListedIn(EUROLEAGUE, ruledRules)).toBe(false);
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
    expect(off(PlayerStatus.fromHistory(history, ruledRules), ruledRules)).toBe(
      true,
    );
    const corrected = PlayerStatus.fromHistory(
      historyAfterResultCorrection(history, monVir, ruledRules),
      ruledRules,
    );
    expect(off(corrected, ruledRules)).toBe(false);
    expect(corrected.fillInCount(EUROLEAGUE, ruledRules)).toBe(19);
  });

  it('player (sportbet): the mistaken fill-in keeps counting', () => {
    const history = [...before(4), mistaken];
    const corrected = PlayerStatus.fromHistory(
      historyAfterResultCorrection(history, monVir, sportbetRules),
      sportbetRules,
    );
    expect(off(corrected, sportbetRules)).toBe(true);
    expect(corrected.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
  });
});

describe('PlayerStatus.stored: a stored status read back', () => {
  it('player (ruled): keeps each tournament count and switch as stored', () => {
    const status = unwrap(
      PlayerStatus.stored(
        {
          switchedOffIn: new Set([EUROLEAGUE]),
          adminHidden: true,
          fillIns: new Map([
            [EUROLEAGUE, 20],
            [EURO_2028, 3],
          ]),
        },
        ruledRules,
      ),
    );
    expect(off(status, ruledRules)).toBe(true);
    expect(off(status, ruledRules, EURO_2028)).toBe(false);
    expect(status.adminHidden).toBe(true);
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(20);
    expect(status.fillInCount(EURO_2028, ruledRules)).toBe(3);
  });

  it('player (sportbet): the counts add up to one lifetime count, and one switch', () => {
    const status = unwrap(
      PlayerStatus.stored(
        {
          switchedOffIn: new Set(),
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
      off(
        status.afterFillIn(EUROLEAGUE, 'fill-in', sportbetRules),
        sportbetRules,
      ),
    ).toBe(true);
    const inactive = unwrap(
      PlayerStatus.stored(
        {
          switchedOffIn: new Set([EURO_2024]),
          adminHidden: false,
          fillIns: new Map(),
        },
        sportbetRules,
      ),
    );
    expect(off(inactive, sportbetRules)).toBe(true);
  });

  it.each([
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('player: refuses %s', (_, count) => {
    expect(
      PlayerStatus.stored(
        {
          switchedOffIn: new Set(),
          adminHidden: false,
          fillIns: new Map([[EUROLEAGUE, count]]),
        },
        ruledRules,
      ),
    ).toEqual(refuse('bad-count'));
  });

  it('player (sportbet): refuses an admin hide apart from the switch', () => {
    expect(
      PlayerStatus.stored(
        {
          switchedOffIn: new Set([EUROLEAGUE]),
          adminHidden: true,
          fillIns: new Map(),
        },
        sportbetRules,
      ),
    ).toEqual(refuse('admin-hide-is-the-switch'));
  });
});

describe('PlayerStatus', () => {
  it('player: the counts and switches cannot be changed from outside', () => {
    const status = missed(PlayerStatus.NEW, 3, ruledRules);
    expect(Object.isFrozen(status)).toBe(true);
    expect('fillIns' in status).toBe(false);
    expect('switchedOff' in status).toBe(false);
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(3);
  });
});

describe('PlayerStatus.stored and fillInCountInvariant', () => {
  it('accepts and refuses a count exactly as the invariant does', () => {
    const stored = (count: number) =>
      PlayerStatus.stored(
        {
          switchedOffIn: new Set(),
          adminHidden: false,
          fillIns: new Map([[EUROLEAGUE, count]]),
        },
        sportbetRules,
      );
    for (const { value } of fillInCountInvariant.accepts) {
      expect(stored(value).ok).toBe(true);
    }
    for (const { value } of fillInCountInvariant.refuses) {
      expect(stored(value)).toEqual(refuse('bad-count'));
    }
  });
});
