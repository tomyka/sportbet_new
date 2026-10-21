import type { SignedInPlayer } from '@sportbet/db';
import { leagueNo, player } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FINISHED } from '../../components/admin/tournament-fixtures';

const world = vi.hoisted(() => {
  const state: {
    tournament: unknown;
    leagues: unknown[];
    listed: unknown;
    inserted: unknown;
    updated: unknown;
    writes: unknown[];
    asked: unknown[];
  } = {
    tournament: null,
    leagues: [],
    listed: null,
    inserted: null,
    updated: null,
    writes: [],
    asked: [],
  };
  return state;
});

vi.mock('@sportbet/db/league', () => ({
  loadAdminMessages: () =>
    Promise.resolve({ messages: [], leagues: world.leagues }),
  findAdminMessage: () => Promise.resolve(world.listed),
  insertMessage: (_db: unknown, write: unknown) => {
    world.writes.push(['insert', write]);
    return Promise.resolve(world.inserted);
  },
  updateMessage: (_db: unknown, write: unknown) => {
    world.writes.push(['update', write]);
    return Promise.resolve(world.updated);
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

const { addMessage, saveMessage } = await import('./messages');

const BOSS: SignedInPlayer = {
  player: player('1'),
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'superadmin',
  lastTournament: null,
};
const MANAGER: SignedInPlayer = { ...BOSS, role: 'results-manager' };

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

const saying = (message: string, names: object = {}) => ({
  kind: 'redirect',
  to: '/admin/messages',
  flash: { kind: 'admin', message, ...names },
});

const invalidSaying = (field: string, problem: string) => ({
  kind: 'redirect',
  to: '/admin/messages',
  flash: { kind: 'admin-invalid', problems: [{ field, problem }] },
});

const NEW = { message: ' Sveiki ', leagueID: '9', active: 'on' };

beforeEach(() => {
  world.tournament = FINISHED.tournament;
  world.leagues = [{ id: leagueNo(9), name: 'Draugų lyga' }];
  world.listed = { message: { id: 5 }, leagueName: null };
  world.inserted = { ok: true, value: { message: 5 } };
  world.updated = { ok: true, value: undefined };
  world.writes = [];
  world.asked = [];
});

describe('inserting a message (R-95, R-116)', () => {
  const add = (fields: Record<string, string>, admin = BOSS) =>
    addMessage({ admin, form: formOf(fields) });

  it('messages: writes the trimmed text, the league and the switch as the session admin', async () => {
    expect(await add(NEW)).toEqual(saying('message-added'));
    expect(world.writes).toMatchObject([
      [
        'insert',
        {
          actor: BOSS.player,
          tournament: FINISHED.tournament.id,
          entry: { text: 'Sveiki', league: leagueNo(9), active: true },
        },
      ],
    ]);
    await add({ message: 'Ei', leagueID: '' });
    expect(world.writes[1]).toMatchObject([
      'insert',
      { entry: { text: 'Ei', league: null, active: false } },
    ]);
  });

  it('messages: an empty text, 10 001 characters and a league of another tournament are the summary, writing nothing', async () => {
    expect(await add({ ...NEW, message: '' })).toEqual(
      invalidSaying('message', 'required'),
    );
    expect(await add({ ...NEW, message: 'x'.repeat(10_001) })).toMatchObject({
      flash: { problems: [{ field: 'message', problem: 'too-long' }] },
    });
    expect(await add({ ...NEW, leagueID: '10' })).toEqual(
      invalidSaying('leagueID', 'league-not-allowed'),
    );
    expect(world.writes).toEqual([]);
  });

  it("messages: no working tournament is a message; the writer's refusals are the summary or home", async () => {
    world.tournament = null;
    expect(await add(NEW)).toEqual(saying('no-tournament'));
    world.tournament = FINISHED.tournament;
    world.inserted = { ok: false, refusal: 'league-not-allowed' };
    expect(await add(NEW)).toEqual(
      invalidSaying('leagueID', 'league-not-allowed'),
    );
    world.inserted = { ok: false, refusal: 'actor-not-allowed' };
    expect(await add(NEW, MANAGER)).toEqual({ kind: 'home' });
  });
});

describe('saving a message (sportbet POST /admin/messages)', () => {
  const save = (fields: Record<string, string>, admin = BOSS) =>
    saveMessage({ admin, form: formOf(fields) });

  it('messages: messageID is checked first and alone', async () => {
    expect(await save({ update: '1' })).toEqual(
      invalidSaying('messageID', 'required'),
    );
    expect(await save({ messageID: '1.5', update: '1', message: '' })).toEqual(
      invalidSaying('messageID', 'not-an-integer'),
    );
  });

  it('messages: neither button is "Nėra ką išsaugoti"', async () => {
    expect(await save({ messageID: '5' })).toEqual(saying('nothing-to-save'));
    expect(world.writes).toEqual([]);
  });

  it('messages: update writes the form to that message and says its number', async () => {
    expect(await save({ ...NEW, messageID: '5', update: '1' })).toEqual(
      saying('message-updated', { number: 5 }),
    );
    expect(world.writes).toMatchObject([
      [
        'update',
        {
          actor: BOSS.player,
          tournament: FINISHED.tournament.id,
          message: 5,
          entry: { text: 'Sveiki', league: leagueNo(9), active: true },
        },
      ],
    ]);
  });

  it("messages: a refused update form is the summary; the writer's refusals are a 404, the summary or home; no tournament a message", async () => {
    expect(
      await save({ ...NEW, message: '', messageID: '5', update: '1' }),
    ).toEqual(invalidSaying('message', 'required'));
    const post = { ...NEW, messageID: '5', update: '1' };
    world.updated = { ok: false, refusal: 'no-such-message' };
    expect(await save(post)).toEqual({ kind: 'not-found' });
    world.updated = { ok: false, refusal: 'league-not-allowed' };
    expect(await save(post)).toEqual(
      invalidSaying('leagueID', 'league-not-allowed'),
    );
    world.updated = { ok: false, refusal: 'actor-not-allowed' };
    expect(await save(post, MANAGER)).toEqual({ kind: 'home' });
    world.tournament = null;
    expect(await save(post)).toEqual(saying('no-tournament'));
  });

  it("messages: a superadmin's delete asks for the code naming the message from the list", async () => {
    await save({ messageID: '5', delete: '1' });
    expect(world.asked).toEqual([
      {
        admin: BOSS,
        action: { kind: 'delete-league-message', message: 5 },
        back: '/admin/messages',
      },
    ]);
  });

  it("messages: a results manager's delete is refused home before any mail or lookup; an unlisted message is a 404; no tournament a message (R-116)", async () => {
    expect(await save({ messageID: '5', delete: '1' }, MANAGER)).toEqual({
      kind: 'home',
    });
    world.listed = null;
    expect(await save({ messageID: '5', delete: '1' })).toEqual({
      kind: 'not-found',
    });
    world.tournament = null;
    expect(await save({ messageID: '5', delete: '1' })).toEqual(
      saying('no-tournament'),
    );
    expect(world.asked).toEqual([]);
  });
});
