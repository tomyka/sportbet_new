import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { refuse } from '../shared/result';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  roundNo,
  score,
  unwrap,
} from '../testing';
import { Season } from './season';

const END = at('2027-05-31T00:00:00Z');

describe('LR-3', () => {
  // Round 8's other game has been played; Baskonia - Partizan (11-13) has
  // no result: postponed and not yet given a new date. Round 9 starts 11-18.
  const season = unwrap(
    Season.create({
      rounds: [makeRound({ number: 8 }), makeRound({ number: 9 })],
      games: [
        makeGame({
          id: 1,
          round: 8,
          home: 'ZAL',
          away: 'OLY',
          tipOff: '2026-11-12T18:00:00Z',
          result: [88, 79],
        }),
        makeGame({
          id: 2,
          round: 8,
          home: 'BAS',
          away: 'PAR',
          tipOff: '2026-11-13T18:00:00Z',
        }),
        makeGame({
          id: 3,
          round: 9,
          home: 'MON',
          away: 'VIR',
          tipOff: '2026-11-18T18:00:00Z',
        }),
      ],
      endsAt: END,
    }),
  );
  const nov14 = at('2026-11-14T12:00:00Z');

  it('round (sportbet): a postponed game holds the current round', () => {
    expect(season.currentRound(nov14, sportbetRules)).toBe(8);
  });

  it('round (ruled): the current round is the one whose next game starts soonest', () => {
    expect(season.currentRound(nov14, ruledRules)).toBe(9);
    // Postponed on 11-12, before its tip-off, and given its new date on
    // 11-14, the game reopens (R-13, R-41): it is round 8's next game.
    const game = season.game(gameNo(2));
    const moved =
      game === undefined
        ? season
        : season.withGame(
            unwrap(
              game.postpone(at('2026-11-12T12:00:00Z'), ruledRules),
            ).reschedule(at('2026-12-10T18:00:00Z'), nov14, ruledRules),
          );
    expect(moved.currentRound(nov14, ruledRules)).toBe(9);
    expect(moved.currentRound(at('2026-11-19T12:00:00Z'), ruledRules)).toBe(8);
    // Moved only after its tip-off, it stays locked and is never a next
    // game: once round 9 has tipped off, the site shows round 9 (R-40).
    const locked =
      game === undefined
        ? season
        : season.withGame(
            game.reschedule(at('2026-12-10T18:00:00Z'), nov14, ruledRules),
          );
    expect(locked.currentRound(at('2026-11-19T12:00:00Z'), ruledRules)).toBe(9);
  });

  it('round (ruled): with no game open, the round of the most recently tipped-off game', () => {
    expect(season.currentRound(at('2026-11-18T19:00:00Z'), ruledRules)).toBe(9);
  });

  it('round (ruled): a game locked after a move is never a next game', () => {
    // Round 8's game had already tipped off (11-13) when it was moved to
    // 11-24, so R-13 keeps it locked; round 10's games open from 11-25.
    const locked = unwrap(
      Season.create({
        rounds: [8, 10].map((number) => makeRound({ number })),
        games: [
          makeGame({
            id: 1,
            round: 8,
            home: 'ZAL',
            away: 'BAS',
            tipOff: '2026-11-13T18:00:00Z',
          }).reschedule(
            at('2026-11-24T18:00:00Z'),
            at('2026-11-14T12:00:00Z'),
            ruledRules,
          ),
          makeGame({
            id: 2,
            round: 10,
            home: 'MON',
            away: 'VIR',
            tipOff: '2026-11-25T18:00:00Z',
          }),
        ],
        endsAt: END,
      }),
    );
    expect(locked.currentRound(at('2026-11-22T12:00:00Z'), ruledRules)).toBe(
      10,
    );
  });

  it('round: a postponed game is never a next game (R-41)', () => {
    // On 11-12 round 8's Baskonia - Partizan (11-13) is postponed with no
    // new date; round 9 starts 11-18.
    const postponed = unwrap(
      makeGame({
        id: 1,
        round: 8,
        home: 'BAS',
        away: 'PAR',
        tipOff: '2026-11-13T18:00:00Z',
      }).postpone(at('2026-11-12T10:00:00Z'), ruledRules),
    );
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 8 }), makeRound({ number: 9 })],
        games: [
          postponed,
          makeGame({
            id: 2,
            round: 9,
            home: 'MON',
            away: 'VIR',
            tipOff: '2026-11-18T18:00:00Z',
          }),
        ],
        endsAt: END,
      }),
    );
    const nov12 = at('2026-11-12T12:00:00Z');
    expect(season.currentRound(nov12, ruledRules)).toBe(9);
    // sportbet has no postponed state: an unscored game holds its round.
    expect(season.currentRound(nov12, sportbetRules)).toBe(8);
  });

  it('round (ruled): with no game open, a later postponed game does not pull the site forward (R-40)', () => {
    // Round 9 was played on 11-18; round 10's only game (12-01) was
    // postponed on 11-20 with no new date. On 11-25 no game is open: the
    // last round played is 9, not round 10 by its old date.
    const season = unwrap(
      Season.create({
        rounds: [makeRound({ number: 9 }), makeRound({ number: 10 })],
        games: [
          makeGame({
            id: 1,
            round: 9,
            home: 'MON',
            away: 'VIR',
            tipOff: '2026-11-18T18:00:00Z',
            result: [80, 70],
          }),
          unwrap(
            makeGame({
              id: 2,
              round: 10,
              home: 'BAS',
              away: 'PAR',
              tipOff: '2026-12-01T18:00:00Z',
            }).postpone(at('2026-11-20T12:00:00Z'), ruledRules),
          ),
        ],
        endsAt: END,
      }),
    );
    expect(season.currentRound(at('2026-11-25T12:00:00Z'), ruledRules)).toBe(9);
    // Before anything has tipped off, the latest scheduled game's round.
    expect(season.currentRound(at('2026-11-01T12:00:00Z'), ruledRules)).toBe(9);
  });

  it('round (sportbet): a season with every game scored has no current round', () => {
    const finished = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-02T18:00:00Z',
            result: [88, 79],
          }),
        ],
        endsAt: END,
      }),
    );
    expect(finished.currentRound(END, sportbetRules)).toBeNull();
  });

  it('round (ruled): with every game scored, the last round played', () => {
    // R-40: when no game is left to come because every game of the season
    // has a result, the current round is the round of the most recent game.
    const finished = unwrap(
      Season.create({
        rounds: [makeRound({ number: 1 }), makeRound({ number: 2 })],
        games: [
          makeGame({
            id: 1,
            round: 1,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-02T18:00:00Z',
            result: [88, 79],
          }),
          makeGame({
            id: 2,
            round: 2,
            home: 'BAS',
            away: 'PAR',
            tipOff: '2026-10-09T18:00:00Z',
            result: [80, 70],
          }),
        ],
        endsAt: END,
      }),
    );
    expect(finished.currentRound(END, ruledRules)).toBe(2);
  });
});

describe('LR-6', () => {
  const played = makeGame({
    id: 1,
    round: 1,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2027-05-20T18:00:00Z',
    result: [88, 79],
  });
  const unscored = makeGame({
    id: 2,
    round: 1,
    home: 'REA',
    away: 'FEN',
    tipOff: '2027-05-22T18:00:00Z',
  });
  const seasonOf = (games: (typeof played)[]) =>
    unwrap(
      Season.create({ rounds: [makeRound({ number: 1 })], games, endsAt: END }),
    );

  it('tournament (ruled): a finished tournament is not recalculated', () => {
    const season = seasonOf([played]);
    const after = at('2027-06-01T00:00:00Z');
    expect(season.mayRecalculateAt(after, ruledRules)).toBe(false);
    expect(season.mayRecalculateAt(after, sportbetRules)).toBe(true);
  });

  it('tournament (ruled): a tournament is finished only when its end date has passed and every game is scored', () => {
    const after = at('2027-06-01T00:00:00Z');
    expect(seasonOf([played]).isFinishedAt(at('2027-05-30T00:00:00Z'))).toBe(
      false,
    );
    expect(seasonOf([played, unscored]).isFinishedAt(after)).toBe(false);
    expect(
      seasonOf([played, unscored]).mayRecalculateAt(after, ruledRules),
    ).toBe(true);
    const scored = unwrap(unscored.withResult(score(80, 70), ruledRules));
    expect(seasonOf([played, scored]).isFinishedAt(after)).toBe(true);
  });
});

describe('ST-2', () => {
  const round4 = makeGame({
    id: 1,
    round: 4,
    home: 'ZAL',
    away: 'OLY',
    tipOff: '2026-10-16T18:00:00Z',
  });
  const round6 = makeGame({
    id: 4,
    round: 6,
    home: 'BAS',
    away: 'PAR',
    tipOff: '2026-10-28T18:00:00Z',
  });
  const games = [
    round4,
    makeGame({
      id: 2,
      round: 5,
      home: 'REA',
      away: 'FEN',
      tipOff: '2026-10-21T17:00:00Z',
    }),
    makeGame({
      id: 3,
      round: 5,
      home: 'MON',
      away: 'VIR',
      tipOff: '2026-10-22T18:00:00Z',
    }),
    round6,
  ];
  const rounds = [4, 5, 6].map((number) => makeRound({ number }));

  it('standings deadline: the first game of round 5 or later closes standings', () => {
    const season = unwrap(Season.create({ rounds, games, endsAt: END }));
    expect(season.standingsDeadline()).toBe(at('2026-10-21T17:00:00Z'));
    expect(season.isStandingsOpenAt(at('2026-10-21T16:59:59Z'))).toBe(true);
    expect(season.isStandingsOpenAt(at('2026-10-21T17:00:00Z'))).toBe(false);

    // Round 5 rescheduled after round 6 has started: round 6 closes it.
    const moved = unwrap(
      Season.create({
        rounds,
        games: [
          round4,
          makeGame({
            id: 2,
            round: 5,
            home: 'REA',
            away: 'FEN',
            tipOff: '2026-11-05T17:00:00Z',
          }),
          makeGame({
            id: 3,
            round: 5,
            home: 'MON',
            away: 'VIR',
            tipOff: '2026-11-05T19:00:00Z',
          }),
          round6,
        ],
        endsAt: END,
      }),
    );
    expect(moved.standingsDeadline()).toBe(at('2026-10-28T18:00:00Z'));
  });

  it("standings deadline: the tournament's own round wins over the format's", () => {
    const season = unwrap(
      Season.create({
        rounds,
        games,
        endsAt: END,
        standingsDeadlineRound: roundNo(6),
      }),
    );
    expect(season.standingsDeadline()).toBe(at('2026-10-28T18:00:00Z'));
  });
});

describe('PL-2', () => {
  const season = unwrap(
    Season.create({
      rounds: [1, 5].map((number) => makeRound({ number })),
      games: [
        makeGame({
          id: 1,
          round: 1,
          home: 'ZAL',
          away: 'OLY',
          tipOff: '2026-10-01T18:00:00Z',
        }),
        makeGame({
          id: 2,
          round: 5,
          home: 'REA',
          away: 'FEN',
          tipOff: '2026-10-21T17:00:00Z',
        }),
      ],
      endsAt: END,
    }),
  );

  it('registration (ruled): open until round 5 starts', () => {
    expect(
      season.isRegistrationOpenAt(at('2026-10-10T12:00:00Z'), ruledRules),
    ).toBe(true);
    expect(
      season.isRegistrationOpenAt(at('2026-10-21T17:00:00Z'), ruledRules),
    ).toBe(false);
  });

  it('registration (sportbet): closes when the first game starts', () => {
    expect(
      season.isRegistrationOpenAt(at('2026-10-01T17:59:59Z'), sportbetRules),
    ).toBe(true);
    expect(
      season.isRegistrationOpenAt(at('2026-10-01T18:00:00Z'), sportbetRules),
    ).toBe(false);
  });
});

describe('Season.create', () => {
  it('refuses a game in a round it does not have', () => {
    expect(
      Season.create({
        rounds: [makeRound({ number: 1 })],
        games: [
          makeGame({
            id: 1,
            round: 2,
            home: 'ZAL',
            away: 'OLY',
            tipOff: '2026-10-01T18:00:00Z',
          }),
        ],
        endsAt: END,
      }),
    ).toEqual(refuse('game-in-unknown-round'));
  });
});
