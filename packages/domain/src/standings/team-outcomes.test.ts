import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { teamOutcome } from '../testing';
import { TeamOutcomes } from './team-outcomes';

describe('TeamOutcomes.of', () => {
  it('standings: accepts a table with one champion and one runner-up', () => {
    expect(
      TeamOutcomes.of(
        [
          teamOutcome('ZAL', { place: 1, finalPlace: 1 }),
          teamOutcome('OLY', { place: 2, finalPlace: 2 }),
          teamOutcome('REA'),
        ],
        false,
      ).ok,
    ).toBe(true);
  });

  it.each([
    [
      'the same team twice',
      [teamOutcome('ZAL'), teamOutcome('ZAL')],
      'duplicate-team',
    ],
    ['a place of 0', [teamOutcome('ZAL', { place: 0 })], 'place-not-positive'],
    [
      'a fractional place',
      [teamOutcome('ZAL', { place: 1.5 })],
      'place-not-positive',
    ],
    [
      'two teams in one place',
      [teamOutcome('ZAL', { place: 3 }), teamOutcome('OLY', { place: 3 })],
      'duplicate-place',
    ],
    [
      'two champions',
      [
        teamOutcome('ZAL', { finalPlace: 1 }),
        teamOutcome('OLY', { finalPlace: 1 }),
      ],
      'duplicate-final-place',
    ],
    [
      'a third place in a Euroleague final',
      [teamOutcome('ZAL', { finalPlace: 3 })],
      'final-place-out-of-range',
    ],
  ] as const)('standings: refuses %s', (_, teams, refusal) => {
    expect(TeamOutcomes.of(teams, true)).toEqual(refuse(refusal));
  });
});
