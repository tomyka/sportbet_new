import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { roundNo } from '../testing';
import {
  survivalAllowed,
  tournamentChange,
  tournamentFormEntry,
  type TournamentEntry,
  type TournamentFormFields,
} from './tournament-form';

const valid: TournamentFormFields = {
  name: 'Euroleague 2026/27',
  slug: 'euroleague-2026-27',
  standings_deadline_round: '',
  status: 'upcoming',
  start_date: '2026-10-01',
  end_date: '2027-05-23',
  description: 'Turnyras',
  is_public: '1',
  survival_game: '1',
};

const fresh = { format: 'euroleague', stored: null } as const;

describe('tournamentFormEntry (adminStore, adminUpdate; R-55)', () => {
  it('tournament form: a complete form is an entry', () => {
    expect(tournamentFormEntry(valid, fresh)).toEqual({
      ok: true,
      value: {
        name: 'Euroleague 2026/27',
        slug: 'euroleague-2026-27',
        standingsDeadlineRound: null,
        status: 'upcoming',
        startsOn: '2026-10-01',
        endsOn: '2027-05-23',
        description: 'Turnyras',
        isPublic: true,
        survival: true,
      },
    });
  });

  it('tournament form: the optional fields may be blank', () => {
    const entry = tournamentFormEntry(
      {
        ...valid,
        start_date: '',
        end_date: '',
        description: '',
        is_public: '',
        survival_game: '',
        standings_deadline_round: '6',
      },
      fresh,
    );
    expect(entry).toEqual({
      ok: true,
      value: {
        name: 'Euroleague 2026/27',
        slug: 'euroleague-2026-27',
        standingsDeadlineRound: roundNo(6),
        status: 'upcoming',
        startsOn: null,
        endsOn: null,
        description: null,
        isPublic: false,
        survival: false,
      },
    });
  });

  it.each([
    ['', 'required'],
    ['x'.repeat(256), 'too-long'],
  ] as const)('tournament form: the name %j is %s', (name, problem) => {
    expect(tournamentFormEntry({ ...valid, name }, fresh)).toEqual({
      ok: false,
      errors: [{ field: 'name', problem }],
    });
  });

  it('tournament form: a name of 255 characters, counted by character, is accepted', () => {
    expect(
      tournamentFormEntry({ ...valid, name: '\u{1F600}'.repeat(255) }, fresh)
        .ok,
    ).toBe(true);
    expect(
      tournamentFormEntry({ ...valid, name: '\u{1F600}'.repeat(256) }, fresh)
        .ok,
    ).toBe(false);
  });

  it.each([
    ['', 'required'],
    ['a'.repeat(101), 'too-long'],
    ['Euroleague', 'bad-slug'],
    ['euro league', 'bad-slug'],
    ['euro_league', 'bad-slug'],
  ] as const)('tournament form: the slug %j is %s', (slug, problem) => {
    expect(tournamentFormEntry({ ...valid, slug }, fresh)).toEqual({
      ok: false,
      errors: [{ field: 'slug', problem }],
    });
  });

  it('tournament form: a slug of 100 characters is accepted', () => {
    expect(
      tournamentFormEntry({ ...valid, slug: 'a'.repeat(100) }, fresh).ok,
    ).toBe(true);
  });

  it.each([
    ['x', 'not-an-integer'],
    ['1.5', 'not-an-integer'],
    ['0', 'below-minimum'],
    ['256', 'above-maximum'],
  ] as const)(
    'tournament form: the deadline round %j is %s',
    (round, problem) => {
      expect(
        tournamentFormEntry(
          { ...valid, standings_deadline_round: round },
          fresh,
        ),
      ).toEqual({
        ok: false,
        errors: [{ field: 'standings_deadline_round', problem }],
      });
    },
  );

  it('tournament form: the deadline round runs 1 to 255', () => {
    for (const round of ['1', '255']) {
      expect(
        tournamentFormEntry(
          { ...valid, standings_deadline_round: round },
          fresh,
        ).ok,
      ).toBe(true);
    }
  });

  it.each([
    ['', 'required'],
    ['finished', 'unknown-status'],
    ['paused', 'unknown-status'],
  ] as const)('tournament form: the status %j is %s', (status, problem) => {
    expect(tournamentFormEntry({ ...valid, status }, fresh)).toEqual({
      ok: false,
      errors: [{ field: 'status', problem }],
    });
  });

  it('tournament form (R-55): active is offered, finished only to a tournament stored as finished', () => {
    expect(tournamentFormEntry({ ...valid, status: 'active' }, fresh).ok).toBe(
      true,
    );
    const stored = {
      format: 'euroleague',
      stored: { status: 'finished', survival: true },
    } as const;
    const kept = tournamentFormEntry({ ...valid, status: 'finished' }, stored);
    expect(kept.ok && kept.value.status).toBe('finished');
    const notFinished = {
      format: 'euroleague',
      stored: { status: 'active', survival: true },
    } as const;
    expect(
      tournamentFormEntry({ ...valid, status: 'finished' }, notFinished),
    ).toEqual({
      ok: false,
      errors: [{ field: 'status', problem: 'unknown-status' }],
    });
  });

  it.each([
    ['start_date', '2026-13-01'],
    ['start_date', '2026-02-30'],
    ['start_date', '01/10/2026'],
    ['end_date', 'tomorrow'],
  ] as const)('tournament form: %s %j is no date', (field, text) => {
    expect(tournamentFormEntry({ ...valid, [field]: text }, fresh)).toEqual({
      ok: false,
      errors: [{ field, problem: 'not-a-date' }],
    });
  });

  it('tournament form: the end may be the start day but not before it', () => {
    expect(
      tournamentFormEntry(
        { ...valid, start_date: '2027-05-23', end_date: '2027-05-23' },
        fresh,
      ).ok,
    ).toBe(true);
    expect(
      tournamentFormEntry(
        { ...valid, start_date: '2027-05-24', end_date: '2027-05-23' },
        fresh,
      ),
    ).toEqual({
      ok: false,
      errors: [{ field: 'end_date', problem: 'before-start' }],
    });
  });

  it('tournament form: an end with no start is not compared', () => {
    expect(
      tournamentFormEntry(
        { ...valid, start_date: '', end_date: '2020-01-01' },
        fresh,
      ).ok,
    ).toBe(true);
  });

  it('tournament form: a description of 1000 characters is accepted, 1001 is too long', () => {
    expect(
      tournamentFormEntry({ ...valid, description: 'x'.repeat(1000) }, fresh)
        .ok,
    ).toBe(true);
    expect(
      tournamentFormEntry({ ...valid, description: 'x'.repeat(1001) }, fresh),
    ).toEqual({
      ok: false,
      errors: [{ field: 'description', problem: 'too-long' }],
    });
  });

  it.each(['is_public', 'survival_game'] as const)(
    'tournament form: %s is a Laravel boolean - 0, 1 or absent',
    (field) => {
      for (const text of ['', '0', '1']) {
        expect(tournamentFormEntry({ ...valid, [field]: text }, fresh).ok).toBe(
          true,
        );
      }
      for (const text of ['on', 'true', '2']) {
        expect(tournamentFormEntry({ ...valid, [field]: text }, fresh)).toEqual(
          {
            ok: false,
            errors: [{ field, problem: 'not-a-boolean' }],
          },
        );
      }
    },
  );

  it('tournament form: every failing field is listed in adminStore`s order', () => {
    expect(
      tournamentFormEntry(
        {
          name: '',
          slug: '',
          standings_deadline_round: 'x',
          status: '',
          start_date: 'x',
          end_date: 'y',
          description: 'x'.repeat(1001),
          is_public: 'on',
          survival_game: 'on',
        },
        fresh,
      ),
    ).toEqual({
      ok: false,
      errors: [
        { field: 'name', problem: 'required' },
        { field: 'slug', problem: 'required' },
        { field: 'standings_deadline_round', problem: 'not-an-integer' },
        { field: 'status', problem: 'required' },
        { field: 'start_date', problem: 'not-a-date' },
        { field: 'end_date', problem: 'not-a-date' },
        { field: 'description', problem: 'too-long' },
        { field: 'is_public', problem: 'not-a-boolean' },
        { field: 'survival_game', problem: 'not-a-boolean' },
      ],
    });
  });
});

describe('survivalAllowed (refuseSurvivalWithDraws, issue 228)', () => {
  it('survival: off is always allowed', () => {
    expect(
      survivalAllowed({ survival: false, drawAllowed: true, existing: null }),
    ).toBe(true);
  });

  it('survival: on is allowed for a format without draws', () => {
    expect(
      survivalAllowed({ survival: true, drawAllowed: false, existing: null }),
    ).toBe(true);
  });

  it('survival: on is refused for a format with draws', () => {
    expect(
      survivalAllowed({ survival: true, drawAllowed: true, existing: null }),
    ).toBe(false);
  });

  it('survival: on stays allowed where it was already on with that format; once off it cannot return', () => {
    expect(
      survivalAllowed({
        survival: true,
        drawAllowed: true,
        existing: { survival: true, sameFormat: true },
      }),
    ).toBe(true);
    expect(
      survivalAllowed({
        survival: true,
        drawAllowed: true,
        existing: { survival: true, sameFormat: false },
      }),
    ).toBe(false);
    expect(
      survivalAllowed({
        survival: true,
        drawAllowed: true,
        existing: { survival: false, sameFormat: true },
      }),
    ).toBe(false);
  });
});

const entry: TournamentEntry = {
  name: 'Euroleague 2026/27',
  slug: 'euroleague-2026-27',
  standingsDeadlineRound: null,
  status: 'active',
  startsOn: '2026-10-01',
  endsOn: '2027-05-23',
  description: null,
  isPublic: true,
  survival: true,
};

const old = {
  endsOn: '2027-05-23',
  survival: true,
  standingsDeadlineRound: null,
} as const;

describe('tournamentChange (R-110, R-22, R-67)', () => {
  it('tournament change: an open tournament may change anything', () => {
    expect(
      tournamentChange(
        old,
        {
          ...entry,
          endsOn: '2027-06-01',
          survival: false,
          standingsDeadlineRound: roundNo(6),
        },
        { finished: false },
      ),
    ).toEqual({
      ok: true,
      value: {
        ...entry,
        endsOn: '2027-06-01',
        survival: false,
        standingsDeadlineRound: roundNo(6),
      },
    });
  });

  it.each([
    ['the end date', { endsOn: '2027-06-01' }],
    ['the end date cleared', { endsOn: null }],
    ['survival', { survival: false }],
    ['the deadline round', { standingsDeadlineRound: roundNo(6) }],
  ] as const)(
    'tournament change: a finished tournament refuses a changed %s',
    (_label, change) => {
      expect(
        tournamentChange(old, { ...entry, ...change }, { finished: true }),
      ).toEqual(refuse('tournament-finished'));
    },
  );

  it('tournament change: a finished tournament still takes the name, description, public switch, status and start date', () => {
    const hub = {
      ...entry,
      name: 'Euroleague 2026/27 (baigta)',
      description: 'Pabaiga',
      isPublic: false,
      status: 'upcoming',
      startsOn: '2026-09-15',
    } as const;
    expect(tournamentChange(old, hub, { finished: true })).toEqual({
      ok: true,
      value: hub,
    });
  });

  it('tournament change: a finished tournament saved as it stands is accepted', () => {
    expect(tournamentChange(old, entry, { finished: true }).ok).toBe(true);
  });
});
