import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { team, teamOutcome, unwrap } from '../testing';
import { outcomePlaceInvariant, TeamOutcomes } from './team-outcomes';

describe('TeamOutcomes.enter', () => {
  it('standings: accepts a table with one champion and one runner-up', () => {
    expect(
      TeamOutcomes.enter(
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
    expect(TeamOutcomes.enter(teams, true)).toEqual(refuse(refusal));
  });
});

describe('TeamOutcomes.stored', () => {
  it('standings: a stored table is read back as stored, final places 3 and 4 and shared places included', () => {
    // sportbet's final box is shared with football's four places, and its
    // admin form checks neither (TeamController::updateTeams).
    const stored = unwrap(
      TeamOutcomes.stored(
        [
          teamOutcome('ZAL', { place: 1, finalPlace: 3 }),
          teamOutcome('OLY', { place: 1, finalPlace: 4 }),
          teamOutcome('REA', { finalPlace: 4 }),
        ],
        false,
      ),
    );
    expect(stored.outcomeOf(team('ZAL'))?.finalPlace).toBe(3);
    expect(stored.finalDecided()).toBe(true);
    expect(stored.tableIsFinal).toBe(false);
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
  ] as const)('standings: a stored table refuses %s', (_, teams, refusal) => {
    expect(TeamOutcomes.stored(teams, true)).toEqual(refuse(refusal));
  });
});

describe('TeamOutcomes.stored and outcomePlaceInvariant', () => {
  it('accepts and refuses a place exactly as the invariant does', () => {
    for (const { value } of outcomePlaceInvariant.accepts) {
      expect(
        TeamOutcomes.stored([teamOutcome('ZAL', { place: value })], true).ok,
      ).toBe(true);
    }
    for (const { value } of outcomePlaceInvariant.refuses) {
      expect(
        TeamOutcomes.stored([teamOutcome('ZAL', { place: value })], true),
      ).toEqual(refuse('place-not-positive'));
    }
  });
});
