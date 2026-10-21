import type { SignedInPlayer } from '@sportbet/db';
import type { League } from '@sportbet/domain';
import { leagueNo, player, tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FINISHED } from '../../components/admin/tournament-fixtures';

const world = vi.hoisted(() => {
  const state: {
    tournament: unknown;
    listed: unknown;
    edited: unknown;
    marked: unknown;
    writes: unknown[];
    asked: unknown[];
  } = {
    tournament: null,
    listed: null,
    edited: null,
    marked: null,
    writes: [],
    asked: [],
  };
  return state;
});

vi.mock('@sportbet/db/league', () => ({
  findAdminLeague: () => Promise.resolve(world.listed),
  updateLeagueAsSuperadmin: (_db: unknown, write: unknown) => {
    world.writes.push(['update', write]);
    return Promise.resolve(world.edited);
  },
  setLeagueGuest: (_db: unknown, write: unknown) => {
    world.writes.push(['guest', write]);
    return Promise.resolve(world.marked);
  },
}));
vi.mock('../../server/db', () => ({ getDb: () => 'db' }));
vi.mock('./working-tournament', () => ({
  workingTournament: () => Promise.resolve(world.tournament),
}));
vi.mock('../sign-in/throttle', () => ({
  throttle: () => Promise.resolve({ allowed: true }),
}));
vi.mock('./confirm/request', () => ({
  requestConfirmation: (input: unknown) => {
    world.asked.push(input);
    return Promise.resolve({
      kind: 'redirect',
      to: '/admin/confirm',
      flash: null,
    });
  },
}));

const { askToDeleteLeague, editLeague, markMemberGuest, readAdminLeagueForm } =
  await import('./leagues');

const ADMIN: SignedInPlayer = {
  player: player('1'),
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'superadmin',
  lastTournament: null,
};

const league = (open: boolean): League => ({
  id: leagueNo(9),
  tournament: tournamentKey('2'),
  name: 'Draugų lyga',
  description: null,
  kind: open ? { public: true } : { public: false, owner: player('7') },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: null,
});

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

const saying = (to: string, message: string) => ({
  kind: 'redirect',
  to,
  flash: { kind: 'admin', message },
});

const EDIT = { leagueID: '9', name: 'Nauja', description: '', base_fee: '5' };

beforeEach(() => {
  world.tournament = FINISHED.tournament;
  world.listed = { league: league(false), memberCount: 2, owner: null };
  world.edited = { ok: true, value: undefined };
  world.marked = { ok: true, value: undefined };
  world.writes = [];
  world.asked = [];
});

describe("the edit form (adminUpdate validates the owner's boxes)", () => {
  it('leagues: reads name, description and the two fees, trimmed, blank as none; the reward is never read on update', () => {
    expect(
      readAdminLeagueForm(
        formOf({
          name: ' Nauja ',
          description: '',
          base_fee: '5',
          penalty_step: '',
          reward_description: 'ignored',
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        name: 'Nauja',
        description: null,
        baseFee: 5,
        penaltyStep: null,
        reward: null,
      },
    });
  });

  it("leagues: lists every refused field in the form's order", () => {
    expect(
      readAdminLeagueForm(
        formOf({ name: '', base_fee: 'x', penalty_step: '-1' }),
      ),
    ).toMatchObject({
      ok: false,
      errors: [
        { field: 'name', problem: 'required' },
        { field: 'base_fee', problem: 'not-an-integer' },
        { field: 'penalty_step', problem: 'below-minimum' },
      ],
    });
  });
});

describe('editing a league as a superadmin (sportbet issue 128, R-105)', () => {
  const edit = (fields: Record<string, string>) =>
    editLeague({ admin: ADMIN, form: formOf(fields) });

  it('leagues: writes the form to the league of the working tournament as the session admin', async () => {
    expect(await edit(EDIT)).toEqual(
      saying('/admin/leagues', 'admin-league-updated'),
    );
    expect(world.writes).toEqual([
      [
        'update',
        {
          actor: ADMIN.player,
          tournament: FINISHED.tournament.id,
          league: leagueNo(9),
          entry: {
            name: 'Nauja',
            description: null,
            baseFee: 5,
            penaltyStep: null,
            reward: null,
          },
        },
      ],
    ]);
  });

  it('leagues: a refused id or form is the 422 summary and writes nothing; no working tournament is a message', async () => {
    expect(await edit({ ...EDIT, leagueID: '' })).toMatchObject({
      flash: {
        kind: 'admin-invalid',
        problems: [{ field: 'leagueID', problem: 'required' }],
      },
    });
    expect(await edit({ ...EDIT, name: '' })).toMatchObject({
      flash: {
        kind: 'admin-invalid',
        problems: [{ field: 'name', problem: 'required' }],
      },
    });
    world.tournament = null;
    expect(await edit(EDIT)).toEqual(saying('/admin/leagues', 'no-tournament'));
    expect(world.writes).toEqual([]);
  });

  it('leagues: a league of another tournament is a 404, an actor who lost the role goes home', async () => {
    world.edited = { ok: false, refusal: 'no-such-league' };
    expect(await edit(EDIT)).toEqual({ kind: 'not-found' });
    world.edited = { ok: false, refusal: 'actor-not-superadmin' };
    expect(await edit(EDIT)).toEqual({ kind: 'home' });
  });
});

describe('asking to delete a league (R-118)', () => {
  const ask = (fields: Record<string, string>) =>
    askToDeleteLeague({ admin: ADMIN, form: formOf(fields) });

  it('leagues: a private league of the working tournament asks for the code naming it from the list', async () => {
    await ask({ leagueID: '9' });
    expect(world.asked).toEqual([
      {
        admin: ADMIN,
        action: { kind: 'delete-league', league: leagueNo(9) },
        back: '/admin/leagues',
      },
    ]);
  });

  it('leagues: the public league is refused before any mail, an unlisted one is a 404, a refused id is the summary', async () => {
    world.listed = { league: league(true), memberCount: 2, owner: null };
    expect(await ask({ leagueID: '9' })).toEqual(
      saying('/admin/leagues', 'league-public'),
    );
    world.listed = null;
    expect(await ask({ leagueID: '9' })).toEqual({ kind: 'not-found' });
    expect(await ask({ leagueID: 'x' })).toMatchObject({
      flash: { kind: 'admin-invalid' },
    });
    world.tournament = null;
    expect(await ask({ leagueID: '9' })).toEqual(
      saying('/admin/leagues', 'no-tournament'),
    );
    expect(world.asked).toEqual([]);
  });
});

describe('the guest mark (R-87)', () => {
  const MEMBERS = '/admin/leagues/9/members';
  const mark = (fields: Record<string, string>) =>
    markMemberGuest({ admin: ADMIN, form: formOf(fields) });

  it('leagues: marks a member a guest, or a full member again, and says which', async () => {
    expect(await mark({ leagueID: '9', userID: '5', guest: '1' })).toEqual(
      saying(MEMBERS, 'member-guest'),
    );
    expect(await mark({ leagueID: '9', userID: '5', guest: '0' })).toEqual(
      saying(MEMBERS, 'member-full'),
    );
    expect(world.writes).toEqual([
      [
        'guest',
        {
          actor: ADMIN.player,
          tournament: FINISHED.tournament.id,
          league: leagueNo(9),
          player: player('5'),
          guest: true,
        },
      ],
      [
        'guest',
        {
          actor: ADMIN.player,
          tournament: FINISHED.tournament.id,
          league: leagueNo(9),
          player: player('5'),
          guest: false,
        },
      ],
    ]);
  });

  it('leagues: a refused league, account or mark is the summary and writes nothing', async () => {
    expect(await mark({ leagueID: '', userID: '5', guest: '1' })).toMatchObject(
      {
        to: '/admin/leagues',
        flash: { kind: 'admin-invalid' },
      },
    );
    expect(
      await mark({ leagueID: '9', userID: 'x', guest: '1' }),
    ).toMatchObject({ to: MEMBERS, flash: { kind: 'admin-invalid' } });
    expect(await mark({ leagueID: '9', userID: '5', guest: 'yes' })).toEqual({
      kind: 'redirect',
      to: MEMBERS,
      flash: {
        kind: 'admin-invalid',
        problems: [{ field: 'guest', problem: 'not-a-boolean' }],
      },
    });
    world.tournament = null;
    expect(await mark({ leagueID: '9', userID: '5', guest: '1' })).toEqual(
      saying('/admin/leagues', 'no-tournament'),
    );
    expect(world.writes).toEqual([]);
  });

  it("leagues: the writer's refusals are answered in words, a 404 or home", async () => {
    const fields = { leagueID: '9', userID: '5', guest: '1' };
    world.marked = { ok: false, refusal: 'not-member' };
    expect(await mark(fields)).toEqual(saying(MEMBERS, 'not-a-member'));
    world.marked = { ok: false, refusal: 'unchanged' };
    expect(await mark(fields)).toEqual(saying(MEMBERS, 'guest-unchanged'));
    world.marked = { ok: false, refusal: 'no-such-league' };
    expect(await mark(fields)).toEqual({ kind: 'not-found' });
    world.marked = { ok: false, refusal: 'actor-not-superadmin' };
    expect(await mark(fields)).toEqual({ kind: 'home' });
  });
});
