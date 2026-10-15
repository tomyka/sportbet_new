import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { refuse } from '../shared/result';
import type { RoundNumber } from '../shared/ids';
import {
  at,
  makeGame,
  makeRound,
  roundNo,
  score,
  team,
  unwrap,
} from '../testing';
import {
  gameDeletion,
  planGameChange,
  planNewGame,
  type GameScope,
} from './game-admin';
import type { GameFormEntry } from './game-form';
import { Season } from './season';

const open = { finished: false } as const;

// Round ids 101 and 102 are rounds 1 and 2; teams 1-4 are the tournament's.
const scope: GameScope = {
  teams: [team('1'), team('2'), team('3'), team('4')],
  rounds: new Map<number, RoundNumber>([
    [101, roundNo(1)],
    [102, roundNo(2)],
  ]),
};

const upcoming = makeGame({
  id: 7,
  round: 1,
  home: '1',
  away: '2',
  tipOff: '2026-10-10T18:00:00Z',
});
const other = makeGame({
  id: 8,
  round: 2,
  home: '3',
  away: '4',
  tipOff: '2026-10-17T18:00:00Z',
});

const season = unwrap(
  Season.create({
    rounds: [makeRound({ number: 1 }), makeRound({ number: 2 })],
    games: [upcoming, other],
    endsAt: null,
  }),
);

const entry = (overrides: Partial<GameFormEntry> = {}): GameFormEntry => ({
  tipOff: at('2026-10-24T18:00:00Z'),
  home: team('1'),
  away: team('3'),
  roundId: 101,
  ...overrides,
});

const beforeTipOff = at('2026-10-01T10:00:00Z');
const afterTipOff = at('2026-10-10T19:00:00Z');

describe('planNewGame (R-110, issue 272, D16(c))', () => {
  it('new game: a free pair in one of the tournament`s rounds is planned', () => {
    expect(planNewGame(season, entry(), { scope, ...open })).toEqual({
      ok: true,
      value: {
        roundId: 101,
        round: roundNo(1),
        home: team('1'),
        away: team('3'),
        tipOff: at('2026-10-24T18:00:00Z'),
      },
    });
  });

  it('new game: a finished tournament refuses it (R-110)', () => {
    expect(planNewGame(season, entry(), { scope, finished: true })).toEqual(
      refuse('tournament-finished'),
    );
  });

  it.each([
    ['a round of another tournament', { roundId: 999 }],
    ['a home team of another tournament', { home: team('90') }],
    ['an away team of another tournament', { away: team('91') }],
  ] as const)(
    'new game: %s is a mixed tournament (issue 272)',
    (_label, change) => {
      expect(planNewGame(season, entry(change), { scope, ...open })).toEqual(
        refuse('mixed-tournament'),
      );
    },
  );

  it('new game: one team on both sides is refused', () => {
    expect(
      planNewGame(season, entry({ away: team('1') }), { scope, ...open }),
    ).toEqual(refuse('same-team-twice'));
  });

  it('new game: the same pair, home and away, in the same round is refused (D16c)', () => {
    expect(
      planNewGame(season, entry({ home: team('1'), away: team('2') }), {
        scope,
        ...open,
      }),
    ).toEqual(refuse('duplicate-pair'));
  });

  it('new game: the reverse pair, or the pair in another round, is a different game', () => {
    expect(
      planNewGame(season, entry({ home: team('2'), away: team('1') }), {
        scope,
        ...open,
      }).ok,
    ).toBe(true);
    expect(
      planNewGame(
        season,
        entry({ home: team('1'), away: team('2'), roundId: 102 }),
        { scope, ...open },
      ).ok,
    ).toBe(true);
  });
});

const change = (
  overrides: Partial<GameFormEntry>,
  context: {
    readonly realPredictions?: number;
    readonly now?: typeof beforeTipOff;
    readonly finished?: boolean;
    readonly rules?: typeof ruledRules;
  } = {},
) =>
  planGameChange(
    season,
    upcoming,
    entry({
      home: team('1'),
      away: team('2'),
      tipOff: upcoming.tipOff,
      ...overrides,
    }),
    {
      scope,
      realPredictions: context.realPredictions ?? 0,
      now: context.now ?? beforeTipOff,
      rules: context.rules ?? ruledRules,
      finished: context.finished ?? false,
    },
  );

describe('planGameChange (R-90, R-13, R-110)', () => {
  it('game change: nothing changed is accepted as it was', () => {
    const changed = change({});
    expect(changed).toEqual({
      ok: true,
      value: { roundId: 101, game: upcoming },
    });
  });

  it('game change (R-90): before tip-off anything may change, even with real predictions', () => {
    const changed = change(
      { home: team('4'), away: team('3'), roundId: 102 },
      { realPredictions: 5 },
    );
    expect(changed.ok && changed.value.game).toMatchObject({
      id: upcoming.id,
      round: roundNo(2),
      home: team('4'),
      away: team('3'),
    });
    expect(changed.ok && changed.value.roundId).toBe(102);
  });

  it('game change (R-90): a started game without real predictions may change its teams', () => {
    const changed = change(
      { home: team('3') },
      { now: afterTipOff, realPredictions: 0 },
    );
    expect(changed.ok && changed.value.game.home).toBe(team('3'));
  });

  it('game change (R-90): a started game with a real prediction keeps its teams', () => {
    expect(
      change({ home: team('3') }, { now: afterTipOff, realPredictions: 1 }),
    ).toEqual(refuse('teams-fixed'));
    expect(
      change({ away: team('4') }, { now: afterTipOff, realPredictions: 1 }),
    ).toEqual(refuse('teams-fixed'));
  });

  it('game change (R-90): a started game with a real prediction still changes its date and round', () => {
    const changed = change(
      { tipOff: at('2026-10-12T18:00:00Z'), roundId: 102 },
      { now: afterTipOff, realPredictions: 4 },
    );
    expect(changed.ok && changed.value.game).toMatchObject({
      round: roundNo(2),
      tipOff: at('2026-10-12T18:00:00Z'),
    });
  });

  it('game change (R-90): swapping home and away is changing the teams', () => {
    expect(
      change(
        { home: team('2'), away: team('1') },
        { now: afterTipOff, realPredictions: 1 },
      ),
    ).toEqual(refuse('teams-fixed'));
  });

  it('game change (R-13, ruled): moved later after it locked, it stays locked', () => {
    const changed = change(
      { tipOff: at('2026-10-20T18:00:00Z') },
      { now: afterTipOff, rules: ruledRules },
    );
    expect(changed.ok && changed.value.game.lockedSince).toBe(upcoming.tipOff);
    expect(
      changed.ok && changed.value.game.isOpenAt(at('2026-10-11T00:00:00Z')),
    ).toBe(false);
  });

  it('game change (sportbet): moved later after tip-off, it reopens', () => {
    const changed = change(
      { tipOff: at('2026-10-20T18:00:00Z') },
      { now: afterTipOff, rules: sportbetRules },
    );
    expect(changed.ok && changed.value.game.lockedSince).toBeNull();
    expect(
      changed.ok && changed.value.game.isOpenAt(at('2026-10-11T00:00:00Z')),
    ).toBe(true);
  });

  it('game change (R-13, ruled): moved before tip-off, it stays open', () => {
    const changed = change(
      { tipOff: at('2026-10-20T18:00:00Z') },
      { now: beforeTipOff },
    );
    expect(changed.ok && changed.value.game.lockedSince).toBeNull();
  });

  it('game change: the date kept is not a move (a started game keeps its lock state)', () => {
    const changed = change({ home: team('3') }, { now: afterTipOff });
    expect(changed.ok && changed.value.game.lockedSince).toBeNull();
  });

  it('game change: a finished tournament refuses it (R-110)', () => {
    expect(change({}, { finished: true })).toEqual(
      refuse('tournament-finished'),
    );
  });

  it('game change: a team or round of another tournament is refused (issue 272)', () => {
    expect(change({ roundId: 999 })).toEqual(refuse('mixed-tournament'));
    expect(change({ home: team('90') })).toEqual(refuse('mixed-tournament'));
  });

  it('game change: one team on both sides is refused', () => {
    expect(change({ home: team('2') })).toEqual(refuse('same-team-twice'));
  });

  it('game change: another game`s pair in the round is refused, the game`s own is not', () => {
    expect(change({ home: team('3'), away: team('4'), roundId: 102 })).toEqual(
      refuse('duplicate-pair'),
    );
    expect(change({ roundId: 101 }).ok).toBe(true);
  });
});

describe('gameDeletion (R-89, R-110)', () => {
  it('game delete (R-89): blank rows only - it goes', () => {
    expect(
      gameDeletion(upcoming, {
        realPredictions: 0,
        resultHistory: false,
        ...open,
      }),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it('game delete (R-89): one real prediction keeps it', () => {
    expect(
      gameDeletion(upcoming, {
        realPredictions: 1,
        resultHistory: false,
        ...open,
      }),
    ).toEqual(refuse('has-real-predictions'));
  });

  it('game delete: a result keeps it, even with fill-ins only', () => {
    const scored = makeGame({
      id: 9,
      round: 1,
      home: '1',
      away: '2',
      tipOff: '2026-10-10T18:00:00Z',
      result: [88, 79],
    });
    expect(scored.result).toEqual(score(88, 79));
    expect(
      gameDeletion(scored, {
        realPredictions: 0,
        resultHistory: true,
        ...open,
      }),
    ).toEqual(refuse('has-result'));
  });

  it('game delete: a result entered once and cleared again keeps it, its audit rows stay (R-69)', () => {
    expect(
      gameDeletion(upcoming, {
        realPredictions: 0,
        resultHistory: true,
        finished: false,
      }),
    ).toEqual(refuse('has-result'));
  });

  it('game delete: a real prediction is named before a result when both hold', () => {
    const scored = makeGame({
      id: 9,
      round: 1,
      home: '1',
      away: '2',
      tipOff: '2026-10-10T18:00:00Z',
      result: [88, 79],
    });
    expect(
      gameDeletion(scored, {
        realPredictions: 3,
        resultHistory: true,
        ...open,
      }),
    ).toEqual(refuse('has-real-predictions'));
  });

  it('game delete: a finished tournament refuses it first (R-110)', () => {
    expect(
      gameDeletion(upcoming, {
        realPredictions: 3,
        resultHistory: false,
        finished: true,
      }),
    ).toEqual(refuse('tournament-finished'));
  });
});
