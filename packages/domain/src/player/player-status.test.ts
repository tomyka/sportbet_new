import { describe, expect, it } from 'vitest';
import { fillIns, historyAfterResultCorrection } from '../fill-in/fill-in';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import {
  MatchPrediction,
  type PredictionOrigin,
} from '../prediction/match-prediction';
import { rankPlayers } from '../ranking/league-table';
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
  listedPlayers,
  PlayerStatus,
  SWITCH_OFF_AFTER_FILL_INS,
  type PredictionWrite,
} from './player-status';

const EUROLEAGUE = tournamentKey('euroleague-2026-27');
const EURO_2024 = tournamentKey('euro-2024');
const EURO_2028 = tournamentKey('euro-2028');

/** `times` fill-ins, in the Euroleague as `fill-in` unless `where` says otherwise. */
const missed = (
  status: PlayerStatus,
  times: number,
  {
    tournament = EUROLEAGUE,
    origin = 'fill-in',
  }: {
    readonly tournament?: typeof EUROLEAGUE;
    readonly origin?: 'fill-in' | 'late-fill-in';
  } = {},
): PlayerStatus =>
  Array.from({ length: times }).reduce<PlayerStatus>(
    (current) => current.afterFillIn(tournament, origin),
    status,
  );

/** Switched off in the Euroleague, unless another tournament is named. */
const off = (status: PlayerStatus, tournament = EUROLEAGUE) =>
  status.isSwitchedOffIn(tournament);

describe('PL-1', () => {
  it('player: the switch-off count is 20 (R-7, R-32)', () => {
    expect(SWITCH_OFF_AFTER_FILL_INS).toBe(20);
  });

  it('player: 20 fill-ins in a tournament switch a player off', () => {
    expect(off(missed(PlayerStatus.NEW, 19))).toBe(false);
    expect(off(missed(PlayerStatus.NEW, 20))).toBe(true);
    // The count starts from zero in each tournament.
    const elsewhere = missed(PlayerStatus.NEW, 19, {
      tournament: EURO_2028,
    });
    const plusOne = missed(elsewhere, 1);
    expect(off(plusOne)).toBe(false);
    expect(off(plusOne, EURO_2028)).toBe(false);
  });

  it('player: a real prediction resets the count', () => {
    const twenty = missed(PlayerStatus.NEW, 20);
    const back = twenty.afterRealPrediction(EUROLEAGUE);
    expect(off(back)).toBe(false);
    expect(back.fillInCount(EUROLEAGUE)).toBe(0);
    expect(off(missed(back, 19))).toBe(false);
    expect(off(missed(back, 20))).toBe(true);
  });

  it("player: a late joiner's fill-ins do not count", () => {
    const late = missed(PlayerStatus.NEW, 25, {
      origin: 'late-fill-in',
    });
    expect(off(late)).toBe(false);
    expect(late.fillInCount(EUROLEAGUE)).toBe(0);
  });
});

describe('PL-1 and R-7: switched off per tournament', () => {
  it('player: switched off in one tournament, still on in another', () => {
    const status = missed(PlayerStatus.NEW, 20);
    expect(off(status)).toBe(true);
    expect(off(status, EURO_2028)).toBe(false);
    expect(status.isListedIn(EUROLEAGUE)).toBe(false);
    expect(status.isListedIn(EURO_2028)).toBe(true);
  });

  it('player: a real save in another tournament does not switch them back on', () => {
    const status = missed(PlayerStatus.NEW, 20).afterRealPrediction(EURO_2028);
    expect(off(status)).toBe(true);
    expect(status.fillInCount(EUROLEAGUE)).toBe(20);
    // A save in the Euroleague itself does.
    expect(off(status.afterRealPrediction(EUROLEAGUE))).toBe(false);
  });

  it('player: the history switches them off per tournament too', () => {
    const history = [
      ...Array.from({ length: 20 }, (_, n) => write(n, n + 1, 'fill-in')),
      write(30, 101, 'real', EURO_2028),
    ];
    const status = PlayerStatus.fromHistory(history);
    expect(off(status)).toBe(true);
    expect(off(status, EURO_2028)).toBe(false);
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
          switchedOff: !status.getsFillInsIn(tournament),
        },
      ],
      seededDice(1),
      at('2027-01-08T20:00:00Z'),
    );

  it('fill-in: a switched-off player gets no fill-in', () => {
    const tomas = missed(PlayerStatus.NEW, 20);
    expect(tomas.getsFillInsIn(EUROLEAGUE)).toBe(false);
    expect(filledIn(tomas, EUROLEAGUE)).toEqual([]);
  });

  it('fill-in: switched off in one tournament, still filled in in another (R-32 per tournament)', () => {
    const tomas = missed(PlayerStatus.NEW, 20, {
      tournament: EURO_2028,
    });
    expect(tomas.getsFillInsIn(EURO_2028)).toBe(false);
    expect(tomas.getsFillInsIn(EUROLEAGUE)).toBe(true);
    expect(filledIn(tomas, EUROLEAGUE)).toHaveLength(1);
  });
});

describe('RA-4', () => {
  const hidden = () =>
    PlayerStatus.NEW.hiddenByAdmin().afterRealPrediction(EUROLEAGUE);
  const table = (status: PlayerStatus) =>
    rankPlayers([
      {
        player: player('ada'),
        username: 'ada',
        match: unwrap(Points.whole(1800)),
        serija: Points.ZERO,
        standings: StandingsPoints.ZERO,
        survival: Points.ZERO,
        listed: status.isListedIn(EUROLEAGUE),
      },
    ]).map((row) => row.username);

  it('ranking: an admin-hidden player stays hidden after saving a prediction', () => {
    expect(hidden().isListedIn(EUROLEAGUE)).toBe(false);
    expect(table(hidden())).toEqual([]);
  });

  it('listedPlayers: the players listed in the tournament', () => {
    const statuses = new Map([
      [player('ada'), PlayerStatus.NEW],
      [player('ben'), missed(PlayerStatus.NEW, 20)],
      [player('cai'), missed(PlayerStatus.NEW, 20, { tournament: EURO_2024 })],
    ]);
    expect(listedPlayers(statuses, EUROLEAGUE)).toEqual(
      new Set([player('ada'), player('cai')]),
    );
  });

  it('ranking: a hidden player keeps their points for when they come back', () => {
    const twenty = missed(PlayerStatus.NEW, 20);
    expect(table(twenty)).toEqual([]);
    expect(table(twenty.afterRealPrediction(EUROLEAGUE))).toEqual(['ada']);
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
  it('player: the history gives the status the steps give', () => {
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
      (status) => missed(status, 3, { tournament: EURO_2024 }),
      (status) => missed(status, 2),
      (status) => status.afterRealPrediction(EUROLEAGUE),
      (status) => missed(status, 1),
      (status) => missed(status, 1, { origin: 'late-fill-in' }),
    ];
    const stepped = steps.reduce(
      (status, step) => step(status),
      PlayerStatus.NEW,
    );
    const derived = PlayerStatus.fromHistory(history);
    for (const tournament of [EUROLEAGUE, EURO_2024]) {
      expect(off(derived, tournament)).toBe(off(stepped, tournament));
      expect(derived.fillInCount(tournament)).toBe(
        stepped.fillInCount(tournament),
      );
    }
  });

  it('player: an admin hide is kept apart from the history', () => {
    const hidden = PlayerStatus.fromHistory(writes([[11, 'real']]), {
      adminHidden: true,
    });
    expect(hidden.adminHidden).toBe(true);
    expect(off(hidden)).toBe(false);
    expect(hidden.isListedIn(EUROLEAGUE)).toBe(false);
  });
});

describe('R-5: a correction undoes the switch-off it caused', () => {
  // Monaco - Virtus (game 20) tips off at 18:00; at 16:00 the admin enters
  // a result by mistake and the player, who had not predicted it, is filled
  // in. The correction removes that fill-in (FI-4).
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

  it('player: the mistaken fill-in no longer counts', () => {
    const history = [...before(19), mistaken];
    expect(off(PlayerStatus.fromHistory(history))).toBe(true);
    const corrected = PlayerStatus.fromHistory(
      historyAfterResultCorrection(history, monVir),
    );
    expect(off(corrected)).toBe(false);
    expect(corrected.fillInCount(EUROLEAGUE)).toBe(19);
  });
});

describe('PlayerStatus.stored: a stored status read back', () => {
  it('player: keeps each tournament count and switch as stored', () => {
    const status = unwrap(
      PlayerStatus.stored({
        switchedOffIn: new Set([EUROLEAGUE]),
        adminHidden: true,
        fillIns: new Map([
          [EUROLEAGUE, 20],
          [EURO_2028, 3],
        ]),
      }),
    );
    expect(off(status)).toBe(true);
    expect(off(status, EURO_2028)).toBe(false);
    expect(status.adminHidden).toBe(true);
    expect(status.fillInCount(EUROLEAGUE)).toBe(20);
    expect(status.fillInCount(EURO_2028)).toBe(3);
  });

  it.each([
    ['a negative count', -1],
    ['a fractional count', 1.5],
  ])('player: refuses %s', (_, count) => {
    expect(
      PlayerStatus.stored({
        switchedOffIn: new Set(),
        adminHidden: false,
        fillIns: new Map([[EUROLEAGUE, count]]),
      }),
    ).toEqual(refuse('bad-count'));
  });
});

describe('PlayerStatus', () => {
  it('player: the counts and switches cannot be changed from outside', () => {
    const status = missed(PlayerStatus.NEW, 3);
    expect(Object.isFrozen(status)).toBe(true);
    expect('fillIns' in status).toBe(false);
    expect('switchedOff' in status).toBe(false);
    expect(status.fillInCount(EUROLEAGUE)).toBe(3);
  });
});

describe('PlayerStatus.stored and fillInCountInvariant', () => {
  it('accepts and refuses a count exactly as the invariant does', () => {
    const stored = (count: number) =>
      PlayerStatus.stored({
        switchedOffIn: new Set(),
        adminHidden: false,
        fillIns: new Map([[EUROLEAGUE, count]]),
      });
    for (const { value } of fillInCountInvariant.accepts) {
      expect(stored(value).ok).toBe(true);
    }
    for (const { value } of fillInCountInvariant.refuses) {
      expect(stored(value)).toEqual(refuse('bad-count'));
    }
  });
});

// A player's tournament_players rows read as one status and written back
// (PlayerStatus.fromRows / toRows): the one place rows and status meet.
describe('PlayerStatus rows (fromRows, toRows)', () => {
  const T = tournamentKey('41');
  const U = tournamentKey('42');
  const rows = (
    t: { off: boolean; hidden: boolean; count: number },
    u: { off: boolean; hidden: boolean; count: number },
  ) => [
    {
      tournament: T,
      switchedOff: t.off,
      adminHidden: t.hidden,
      fillIns: t.count,
    },
    {
      tournament: U,
      switchedOff: u.off,
      adminHidden: u.hidden,
      fillIns: u.count,
    },
  ];

  it('rows: read and written back unchanged', () => {
    const before = rows(
      { off: false, hidden: false, count: 2 },
      { off: false, hidden: false, count: 1 },
    );
    const status = PlayerStatus.fromRows(before, T);
    expect(status.toRows(before, T)).toEqual(before);
  });

  it('rows (R-7): a fill-in counts on its tournament row only; the 20th switches it off there', () => {
    const before = rows(
      { off: false, hidden: true, count: 19 },
      { off: false, hidden: false, count: 3 },
    );
    const after = PlayerStatus.fromRows(before, T).afterFillIn(T, 'fill-in');
    expect(after.toRows(before, T)).toEqual(
      rows(
        { off: true, hidden: true, count: 20 },
        { off: false, hidden: false, count: 3 },
      ),
    );
  });

  it('rows: a stored status that is refused is a corrupt table and throws', () => {
    expect(() =>
      PlayerStatus.fromRows(
        rows(
          { off: false, hidden: false, count: -1 },
          { off: false, hidden: false, count: 0 },
        ),
        T,
      ),
    ).toThrow('a stored status is bad-count');
  });
});

describe('PlayerStatus.afterFillInWithdrawn (FI-4, R-5)', () => {
  const T = tournamentKey('41');

  it('withdrawn: the count falls by one, and below 20 the player is switched back on', () => {
    const at20 = PlayerStatus.fromRows(
      [{ tournament: T, switchedOff: true, adminHidden: false, fillIns: 20 }],
      T,
    );
    const after = at20.afterFillInWithdrawn(T);
    expect(after.fillInCount(T)).toBe(19);
    expect(after.isSwitchedOffIn(T)).toBe(false);
  });

  it('withdrawn: never below 0, and still off while at the threshold or above', () => {
    const none = PlayerStatus.fromRows(
      [{ tournament: T, switchedOff: false, adminHidden: false, fillIns: 0 }],
      T,
    ).afterFillInWithdrawn(T);
    expect(none.fillInCount(T)).toBe(0);
    const at21 = PlayerStatus.fromRows(
      [{ tournament: T, switchedOff: true, adminHidden: false, fillIns: 21 }],
      T,
    ).afterFillInWithdrawn(T);
    expect(at21.isSwitchedOffIn(T)).toBe(true);
  });
});
