import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { makeGame, makeRound, rate, roundNo, unwrap } from '../testing';
import { Season } from './season';
import { STAGES } from './stage';
import {
  changeRound,
  deleteRound,
  insertRound,
  roundMovesPoints,
  stageRate,
} from './round-admin';
import type { RoundEntry } from './round-form';

const open = { finished: false } as const;
const frozen = { finished: true } as const;

const entry = (overrides: Partial<RoundEntry> = {}): RoundEntry => ({
  name: '39 turas',
  number: roundNo(39),
  stage: 'play-offs',
  rate: rate(2),
  survival: false,
  knockout: true,
  ...overrides,
});

const season = unwrap(
  Season.create({
    rounds: [makeRound({ number: 1 }), makeRound({ number: 2 })],
    games: [
      makeGame({
        id: 1,
        round: 1,
        home: '1',
        away: '2',
        tipOff: '2026-10-02T18:00:00Z',
      }),
    ],
    endsAt: null,
  }),
);

describe('insertRound (R-10, R-110)', () => {
  it('round insert: a new number is accepted as the admin set it, any rate', () => {
    const inserted = insertRound(season, entry({ rate: rate(1) }), open);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.value.name).toBe('39 turas');
    expect(inserted.value.round).toMatchObject({
      number: 39,
      stage: 'play-offs',
      rate: rate(1),
      survival: false,
      knockout: true,
    });
  });

  it('round insert: a number the tournament already has is refused', () => {
    expect(insertRound(season, entry({ number: roundNo(2) }), open)).toEqual(
      refuse('duplicate-number'),
    );
  });

  it('round insert: a finished tournament refuses it (R-110), before anything else', () => {
    expect(insertRound(season, entry({ number: roundNo(2) }), frozen)).toEqual(
      refuse('tournament-finished'),
    );
  });
});

describe('changeRound (R-110)', () => {
  it('round change: the same number may be kept while the rest changes', () => {
    const changed = changeRound(
      season,
      roundNo(2),
      entry({ number: roundNo(2), rate: rate(3), stage: 'final-four' }),
      open,
    );
    expect(changed.ok && changed.value.round).toMatchObject({
      number: 2,
      stage: 'final-four',
      rate: rate(3),
    });
  });

  it('round change: a round with games may change its number', () => {
    expect(
      changeRound(season, roundNo(1), entry({ number: roundNo(7) }), open).ok,
    ).toBe(true);
  });

  it('round change: another round`s number is refused', () => {
    expect(
      changeRound(season, roundNo(1), entry({ number: roundNo(2) }), open),
    ).toEqual(refuse('duplicate-number'));
  });

  it('round change: a round the tournament does not have is refused', () => {
    expect(
      changeRound(season, roundNo(9), entry({ number: roundNo(9) }), open),
    ).toEqual(refuse('unknown-round'));
  });

  it('round change: a finished tournament refuses it (R-110)', () => {
    expect(
      changeRound(season, roundNo(2), entry({ number: roundNo(2) }), frozen),
    ).toEqual(refuse('tournament-finished'));
  });
});

describe('deleteRound (the FK is restrict)', () => {
  it('round delete: a round without games goes', () => {
    expect(
      deleteRound(season, roundNo(2), { ...open, hasPicks: false }),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it('round delete: a round with games is kept', () => {
    expect(
      deleteRound(season, roundNo(1), { ...open, hasPicks: false }),
    ).toEqual(refuse('has-games'));
  });

  it('round delete: a round a survival pick or points row names is kept', () => {
    expect(
      deleteRound(season, roundNo(2), { ...open, hasPicks: true }),
    ).toEqual(refuse('has-picks'));
  });

  it('round delete: a round the tournament does not have is refused', () => {
    expect(
      deleteRound(season, roundNo(9), { ...open, hasPicks: false }),
    ).toEqual(refuse('unknown-round'));
  });

  it('round delete: a finished tournament refuses it (R-110)', () => {
    expect(
      deleteRound(season, roundNo(2), { ...frozen, hasPicks: false }),
    ).toEqual(refuse('tournament-finished'));
  });
});

describe('stageRate (R-10)', () => {
  it.each([
    ['regular', 1],
    ['play-in', 1],
    ['play-offs', 2],
    ['final-four', 3],
    ['final', 3],
  ] as const)('stage rate: %s carries %i', (stage, value) => {
    expect(stageRate(stage)).toEqual(rate(value));
  });

  it('stage rate: every stage has one', () => {
    expect(STAGES.map((stage) => stageRate(stage).value)).toEqual([
      1, 1, 2, 3, 3,
    ]);
  });
});

describe('roundMovesPoints', () => {
  const before = makeRound({ number: 3, stage: 'regular', rate: 1 });

  it('round change: a rename moves nothing', () => {
    expect(roundMovesPoints(before, makeRound({ number: 3 }))).toBe(false);
  });

  it.each([
    ['the number', { number: 4 }],
    ['the stage', { number: 3, stage: 'play-in', survival: false }],
    ['the rate', { number: 3, rate: 2 }],
    ['the survival flag', { number: 3, survival: false }],
    ['the knockout flag', { number: 3, knockout: true }],
  ] as const)(
    'round change: a different %s can move points',
    (_label, spec) => {
      expect(roundMovesPoints(before, makeRound(spec))).toBe(true);
    },
  );
});
