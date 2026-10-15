import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { team, teamOutcome, unwrap } from '../testing';
import {
  enterStandingsFacts,
  factsFormProblem,
  finalMark,
  standingsFactsEntry,
  type StandingsFactsFields,
} from './standings-facts';
import { TeamOutcomes } from './team-outcomes';

const posted = (
  overrides: Partial<StandingsFactsFields> = {},
): StandingsFactsFields => ({
  teamID: ['1', '2', '3'],
  place: ['1', '2', ''],
  finalPlace: ['', '', ''],
  playOffs: new Set([0, 1]),
  finalFour: new Set<number>(),
  final: false,
  ...overrides,
});

describe('standingsFactsEntry (updateTeams, R-92)', () => {
  it('standings facts: each row by its index, a tick from the set of ticked indexes', () => {
    expect(standingsFactsEntry(posted({ finalFour: new Set([1]) }))).toEqual({
      ok: true,
      value: {
        rows: [
          teamOutcome('1', { place: 1, playOffs: true }),
          teamOutcome('2', { place: 2, playOffs: true, finalFour: true }),
          teamOutcome('3'),
        ],
        final: false,
      },
    });
  });

  it('standings facts: a final place of 1 or 2 is read, blank is none', () => {
    const entry = standingsFactsEntry(posted({ finalPlace: ['1', '2', ''] }));
    expect(entry.ok && entry.value.rows.map((row) => row.finalPlace)).toEqual([
      1,
      2,
      null,
    ]);
  });

  it('standings facts: a missing array entry reads as blank (sportbet read by index)', () => {
    const entry = standingsFactsEntry(posted({ place: ['1'], finalPlace: [] }));
    expect(entry.ok && entry.value.rows.map((row) => row.place)).toEqual([
      1,
      null,
      null,
    ]);
  });

  it('standings facts: the mark is carried', () => {
    const entry = standingsFactsEntry(posted({ final: true }));
    expect(entry.ok && entry.value.final).toBe(true);
  });

  it.each([
    ['x', 'not-an-id'],
    ['', 'not-an-id'],
    ['0', 'not-an-id'],
  ] as const)('standings facts: the team %j is %s', (text, problem) => {
    expect(standingsFactsEntry(posted({ teamID: ['1', text, '3'] }))).toEqual({
      ok: false,
      errors: [{ row: 1, field: 'team', problem }],
    });
  });

  it.each(['x', '0', '-1', '1.5'])(
    'standings facts: the place %j is refused',
    (text) => {
      expect(standingsFactsEntry(posted({ place: ['1', '2', text] }))).toEqual({
        ok: false,
        errors: [{ row: 2, field: 'place', problem: 'bad-place' }],
      });
    },
  );

  it.each(['3', '0', 'x'])(
    'standings facts: the final place %j is refused (a Euroleague final names 1 and 2)',
    (text) => {
      expect(
        standingsFactsEntry(posted({ finalPlace: ['', text, ''] })),
      ).toEqual({
        ok: false,
        errors: [{ row: 1, field: 'finalPlace', problem: 'bad-final-place' }],
      });
    },
  );

  it('standings facts: every failing field of every row is listed, row by row', () => {
    expect(
      standingsFactsEntry(
        posted({
          teamID: ['x', '2', '3'],
          place: ['1', 'y', ''],
          finalPlace: ['', '', '9'],
        }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { row: 0, field: 'team', problem: 'not-an-id' },
        { row: 1, field: 'place', problem: 'bad-place' },
        { row: 2, field: 'finalPlace', problem: 'bad-final-place' },
      ],
    });
  });
});

const teams = [team('1'), team('2'), team('3')];
const complete = [
  teamOutcome('1', { place: 1 }),
  teamOutcome('2', { place: 2 }),
  teamOutcome('3', { place: 3 }),
];
const outcomes = (rows = complete, final = false) =>
  unwrap(TeamOutcomes.enter(rows, final));

const rowsOf = (...places: (number | null)[]) =>
  places.map((place, index) =>
    teamOutcome(String(index + 1), place === null ? {} : { place }),
  );

const enter = (
  rows: ReturnType<typeof rowsOf>,
  final: boolean,
  options: {
    readonly current?: TeamOutcomes;
    readonly role?: 'results-manager' | 'superadmin';
    readonly finished?: boolean;
  } = {},
) =>
  enterStandingsFacts(
    options.current ?? outcomes([], false),
    teams,
    { rows, final },
    {
      role: options.role ?? 'results-manager',
      finished: options.finished ?? false,
    },
  );

describe('finalMark (R-92, R-43)', () => {
  it('final mark: marked with every place from 1 to N, once each', () => {
    expect(
      finalMark({
        outcomes: outcomes(),
        teamCount: 3,
        wasFinal: false,
        final: true,
        role: 'results-manager',
      }),
    ).toEqual({ ok: true, value: true });
  });

  it.each([
    ['a missing place', [1, 2, null]],
    ['a gap', [1, 2, 4]],
    ['a place past N', [1, 2, 5]],
    ['no place at all', [null, null, null]],
  ] as const)('final mark: %s keeps it from being marked', (_label, places) => {
    expect(
      finalMark({
        outcomes: outcomes(rowsOf(...places)),
        teamCount: 3,
        wasFinal: false,
        final: true,
        role: 'superadmin',
      }),
    ).toEqual(refuse('places-incomplete'));
  });

  it('final mark: a table that stays final must stay complete', () => {
    expect(
      finalMark({
        outcomes: outcomes(rowsOf(1, 2, null), true),
        teamCount: 3,
        wasFinal: true,
        final: true,
        role: 'superadmin',
      }),
    ).toEqual(refuse('places-incomplete'));
  });

  it('final mark: a results manager may not take it off, a superadmin may', () => {
    const context = {
      outcomes: outcomes(),
      teamCount: 3,
      wasFinal: true,
      final: false,
    } as const;
    expect(finalMark({ ...context, role: 'results-manager' })).toEqual(
      refuse('unmark-not-allowed'),
    );
    expect(finalMark({ ...context, role: 'superadmin' })).toEqual({
      ok: true,
      value: false,
    });
  });

  it('final mark: a table never marked needs nothing of its places', () => {
    expect(
      finalMark({
        outcomes: outcomes(rowsOf(null, null, null)),
        teamCount: 3,
        wasFinal: false,
        final: false,
        role: 'results-manager',
      }),
    ).toEqual({ ok: true, value: false });
  });
});

describe('enterStandingsFacts (R-37, R-92, R-110)', () => {
  it('standings facts: the posted rows replace the team`s, the others are kept', () => {
    const current = outcomes(
      [
        teamOutcome('1', { place: 1, playOffs: true }),
        teamOutcome('2', { place: 2 }),
      ],
      false,
    );
    const entered = enter(
      [teamOutcome('2', { place: 3, finalFour: true })],
      false,
      {
        current,
      },
    );
    expect(entered.ok && entered.value.teams).toEqual([
      teamOutcome('1', { place: 1, playOffs: true }),
      teamOutcome('2', { place: 3, finalFour: true }),
      teamOutcome('3'),
    ]);
    expect(entered.ok && entered.value.tableIsFinal).toBe(false);
  });

  it('standings facts: a complete table is marked final', () => {
    const entered = enter(rowsOf(1, 2, 3), true);
    expect(entered.ok && entered.value.tableIsFinal).toBe(true);
  });

  it('standings facts: an incomplete table is not marked final (R-92)', () => {
    expect(enter(rowsOf(1, 2, null), true)).toEqual(
      refuse('places-incomplete'),
    );
  });

  it('standings facts: unmarking is a superadmin`s (R-92)', () => {
    const current = outcomes(complete, true);
    expect(
      enter(rowsOf(1, 2, 3), false, { current, role: 'results-manager' }),
    ).toEqual(refuse('unmark-not-allowed'));
    const unmarked = enter(rowsOf(1, 2, 3), false, {
      current,
      role: 'superadmin',
    });
    expect(unmarked.ok && unmarked.value.tableIsFinal).toBe(false);
  });

  it('standings facts: a results manager may correct a place of a final table that stays final', () => {
    const current = outcomes(complete, true);
    const corrected = enter(
      [
        teamOutcome('1', { place: 2 }),
        teamOutcome('2', { place: 1 }),
        teamOutcome('3', { place: 3 }),
      ],
      true,
      { current },
    );
    expect(corrected.ok && corrected.value.tableIsFinal).toBe(true);
  });

  it('standings facts: a team that is not the tournament`s is refused', () => {
    expect(enter([teamOutcome('99', { place: 1 })], false)).toEqual(
      refuse('unknown-team'),
    );
  });

  it('standings facts: one team posted twice is refused', () => {
    expect(
      enter(
        [teamOutcome('1', { place: 1 }), teamOutcome('1', { place: 2 })],
        false,
      ),
    ).toEqual(refuse('duplicate-team'));
  });

  it('standings facts: two teams on one place are refused', () => {
    expect(enter(rowsOf(1, 1, null), false)).toEqual(refuse('duplicate-place'));
  });

  it('standings facts: a champion twice is refused', () => {
    expect(
      enter(
        [
          teamOutcome('1', { finalPlace: 1 }),
          teamOutcome('2', { finalPlace: 1 }),
        ],
        false,
      ),
    ).toEqual(refuse('duplicate-final-place'));
  });

  it('standings facts: a finished tournament refuses them first (R-110)', () => {
    expect(enter(rowsOf(1, 2, 3), true, { finished: true })).toEqual(
      refuse('tournament-finished'),
    );
  });
});

describe('factsFormProblem (R-92, before the facts form is sent)', () => {
  it('a complete table, final or not, has no problem, in any order', () => {
    expect(factsFormProblem(['1', '2', '3'], true)).toBeNull();
    expect(factsFormProblem(['3', '1', '2'], true)).toBeNull();
    expect(factsFormProblem(['3', '1', '2'], false)).toBeNull();
  });

  it('a table not marked final may be partly filled', () => {
    expect(factsFormProblem(['1', '', '3'], false)).toBeNull();
    expect(factsFormProblem(['', '', ''], false)).toBeNull();
  });

  it('final with a gap, a missing place or a place past N is incomplete', () => {
    expect(factsFormProblem(['1', '', '3'], true)).toBe('places-incomplete');
    expect(factsFormProblem(['1', '2', '4'], true)).toBe('places-incomplete');
    expect(factsFormProblem(['1', '2', '5'], true)).toBe('places-incomplete');
    expect(factsFormProblem(['', '', ''], true)).toBe('places-incomplete');
  });

  it('two teams at one place is refused, final or not, and typed places are trimmed', () => {
    expect(factsFormProblem(['1', '1', ''], false)).toBe('duplicate-place');
    expect(factsFormProblem(['1', ' 1 ', '3'], true)).toBe('duplicate-place');
  });

  it('a duplicate is named before an incompleteness', () => {
    expect(factsFormProblem(['2', '2', ''], true)).toBe('duplicate-place');
  });

  it('a typed place that is no whole number from 1 counts as none', () => {
    expect(factsFormProblem(['1', 'x', '0'], false)).toBeNull();
    expect(factsFormProblem(['1', 'x', '3'], true)).toBe('places-incomplete');
  });
});
