// Slice 14 (R-95, R-116): the admin's league messages - listed for the
// tournament's leagues and the detached ones, written by a results manager or
// a superadmin, deleted by a superadmin only. Nothing of another tournament.

import {
  type LeagueId,
  type LeagueMember,
  type MessageEntry,
  type PlayerId,
  type Role,
  type League,
} from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayers, savePlayerSettings } from '../src';
import { saveLeagues, saveMessages } from '../src/league/repository';
import {
  deleteMessage,
  findAdminMessage,
  insertMessage,
  loadAdminMessages,
  updateMessage,
} from '../src/message/admin';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  OTHER,
  rowsOf,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();
const DAN = player('4');
const NOW = at('2026-10-15T12:00:00Z');

const CLUB = leagueNo(41);
const FRIENDS = leagueNo(42);
const ABROAD = leagueNo(46);

const ROLES_OF: Readonly<Record<string, Role>> = {
  '1': 'superadmin',
  '2': 'player',
  '3': 'results-manager',
  '4': 'player',
};

const privateLeague = (id: LeagueId, tournament: number): League => ({
  id,
  tournament: tournamentKey(String(tournament)),
  name: `Lyga ${String(id)}`,
  description: null,
  kind: { public: false, owner: BEN },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
});

const memberOf = (id: number, of: LeagueId): LeagueMember => ({
  id,
  league: of,
  player: BEN,
  isAdmin: true,
  isGuest: false,
  paid: null,
  joinedAt: null,
});

/**
 * ADA superadmin, CAI results manager, BEN and DAN players. Club (41) and
 * Friends (42) are the tournament's; Abroad (46) the other's. Messages: 501
 * on Club, 502 on Friends, 503 detached, 504 on Abroad.
 */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await savePlayerSettings(
    db,
    Object.entries(ROLES_OF).map(([id, role]) => ({
      player: player(id),
      locale: 'lt',
      role,
      lastTournament: null,
    })),
  );
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI, DAN);
  await savePlaying(db, OTHER, BEN);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: privateLeague(CLUB, TOURNAMENT.id),
      members: [memberOf(801, CLUB)],
    },
    {
      league: privateLeague(FRIENDS, TOURNAMENT.id),
      members: [memberOf(802, FRIENDS)],
    },
  ]);
  await saveLeagues(db, OTHER, [
    {
      league: privateLeague(ABROAD, OTHER.id),
      members: [memberOf(803, ABROAD)],
    },
  ]);
  await saveMessages(db, [
    { id: 501, league: CLUB, text: 'Klubo žinutė', active: true },
    { id: 502, league: FRIENDS, text: 'Draugų žinutė', active: false },
    { id: 503, league: null, text: 'Nieko nerodoma', active: true },
    { id: 504, league: ABROAD, text: 'Kito turnyro žinutė', active: true },
  ]);
});

const TOURNAMENT_ID = TOURNAMENT.id;

const entry = (over: Partial<MessageEntry> = {}): MessageEntry => ({
  text: 'Nauja žinutė',
  league: CLUB,
  active: true,
  ...over,
});

const messagesNow = async () =>
  rowsOf(
    await client.query(
      'select id, league_id, text, active from messages order by id',
    ),
  );

const messageOf = async (id: number) =>
  rowsOf(
    await client.query(
      'select id, league_id, text, active from messages where id = $1',
      [id],
    ),
  )[0];

const insert = (actor: PlayerId, over: Partial<MessageEntry> = {}) =>
  insertMessage(db, {
    actor,
    tournament: TOURNAMENT_ID,
    entry: entry(over),
    now: NOW,
  });

const update = (
  actor: PlayerId,
  message: number,
  over: Partial<MessageEntry> = {},
) =>
  updateMessage(db, {
    actor,
    tournament: TOURNAMENT_ID,
    message,
    entry: entry(over),
    now: NOW,
  });

const remove = (actor: PlayerId, message: number) =>
  deleteMessage(db, { actor, tournament: TOURNAMENT_ID, message });

describe('loadAdminMessages (R-95)', () => {
  it("lists the tournament's leagues' messages and the detached ones, nothing of another tournament", async () => {
    const page = await loadAdminMessages(db, TOURNAMENT_ID);
    expect(
      page.messages.map(({ message, leagueName }) => [
        message.id,
        message.league === null ? null : Number(message.league),
        message.text,
        message.active,
        leagueName,
      ]),
    ).toEqual([
      [501, 41, 'Klubo žinutė', true, 'Lyga 41'],
      [502, 42, 'Draugų žinutė', false, 'Lyga 42'],
      [503, null, 'Nieko nerodoma', true, null],
    ]);
  });

  it("offers only this tournament's leagues in the select", async () => {
    const page = await loadAdminMessages(db, TOURNAMENT_ID);
    expect(page.leagues.map(({ id }) => Number(id))).toContain(41);
    expect(page.leagues.map(({ id }) => Number(id))).toContain(42);
    expect(page.leagues.map(({ id }) => Number(id))).not.toContain(46);
    expect(page.leagues.map(({ name }) => name)).toContain(
      'Euroleague 2026/27',
    );
    expect(
      (await loadAdminMessages(db, OTHER.id)).messages.map(
        ({ message }) => message.id,
      ),
    ).toEqual([503, 504]);
  });
});

describe('insertMessage', () => {
  it('stores the text, the league and the switch, and answers the new id', async () => {
    const inserted = await insert(CAI);
    if (!inserted.ok) throw new Error('test: the insert was refused');
    expect(await messageOf(inserted.value.message)).toEqual({
      id: inserted.value.message,
      league_id: 41,
      text: 'Nauja žinutė',
      active: true,
    });
  });

  it('records when it was written', async () => {
    const inserted = await insert(CAI);
    if (!inserted.ok) throw new Error('test: the insert was refused');
    expect(
      rowsOf(
        await client.query(
          'select created_at, updated_at from messages where id = $1',
          [inserted.value.message],
        ),
      ),
    ).toEqual([{ created_at: new Date(NOW), updated_at: new Date(NOW) }]);
  });

  it('stores a blank league as null, a message no dashboard shows', async () => {
    const inserted = await insert(ADA, { league: null, active: false });
    if (!inserted.ok) throw new Error('test: the insert was refused');
    expect(await messageOf(inserted.value.message)).toMatchObject({
      league_id: null,
      active: false,
    });
  });

  it("refuses another tournament's league, an unknown league and a deleted one (R-95), and writes nothing", async () => {
    const before = await messagesNow();
    for (const league of [ABROAD, leagueNo(999)]) {
      expect(await insert(ADA, { league })).toEqual({
        ok: false,
        refusal: 'league-not-allowed',
      });
    }
    expect(await messagesNow()).toEqual(before);
  });

  it.each([
    ['a player', BEN],
    ['no account', player('99')],
  ])('refuses %s as the actor (R-116)', async (_label, actor) => {
    const before = await messagesNow();
    expect(await insert(actor)).toEqual({
      ok: false,
      refusal: 'actor-not-allowed',
    });
    expect(await messagesNow()).toEqual(before);
  });

  it('waits for a league being deleted, then refuses it instead of failing on the foreign key', async () => {
    const holder = await client.connect();
    let running: ReturnType<typeof insert>;
    try {
      await holder.query('begin');
      await holder.query('select id from leagues where id = 41 for update');
      running = insert(ADA);
      await new Promise((done) => setTimeout(done, 300));
      await holder.query(
        'update messages set league_id = null where league_id = 41',
      );
      await holder.query('delete from leagues where id = 41');
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await running).toEqual({
      ok: false,
      refusal: 'league-not-allowed',
    });
  });
});

describe('updateMessage', () => {
  it('rewrites the text, the league and the switch of a message, for a results manager (R-116)', async () => {
    expect(
      await update(CAI, 501, {
        text: 'Pakeista',
        league: FRIENDS,
        active: false,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect((await messagesNow())[0]).toEqual({
      id: 501,
      league_id: 42,
      text: 'Pakeista',
      active: false,
    });
  });

  it('re-attaches a detached message and detaches an attached one', async () => {
    expect((await update(ADA, 503, { league: CLUB })).ok).toBe(true);
    expect((await update(ADA, 501, { league: null })).ok).toBe(true);
    expect(
      (await messagesNow()).map((row) => [row['id'], row['league_id']]),
    ).toEqual([
      [501, null],
      [502, 42],
      [503, 41],
      [504, 46],
    ]);
  });

  it('refuses a league of another tournament as the target (R-95)', async () => {
    expect(await update(ADA, 501, { league: ABROAD })).toEqual({
      ok: false,
      refusal: 'league-not-allowed',
    });
    expect((await messagesNow())[0]).toMatchObject({ league_id: 41 });
  });

  it("refuses another tournament's message and one that is not there", async () => {
    expect(await update(ADA, 504)).toEqual({
      ok: false,
      refusal: 'no-such-message',
    });
    expect(await update(ADA, 999)).toEqual({
      ok: false,
      refusal: 'no-such-message',
    });
    expect((await messagesNow())[3]).toMatchObject({
      text: 'Kito turnyro žinutė',
    });
  });

  it('refuses a player as the actor, and writes nothing', async () => {
    const before = await messagesNow();
    expect(await update(BEN, 501)).toEqual({
      ok: false,
      refusal: 'actor-not-allowed',
    });
    expect(await messagesNow()).toEqual(before);
  });

  it('records when it was changed', async () => {
    await update(ADA, 501);
    expect(
      rowsOf(
        await client.query('select updated_at from messages where id = 501'),
      ),
    ).toEqual([{ updated_at: new Date(NOW) }]);
  });
});

describe('deleteMessage (R-116: a superadmin only)', () => {
  it('deletes a message, an attached and a detached one', async () => {
    expect(await remove(ADA, 501)).toEqual({ ok: true, value: undefined });
    expect(await remove(ADA, 503)).toEqual({ ok: true, value: undefined });
    expect((await messagesNow()).map((row) => row['id'])).toEqual([502, 504]);
  });

  it.each([
    ['a results manager', CAI],
    ['a player', BEN],
    ['no account', player('99')],
  ])('refuses %s, and the message stays', async (_label, actor) => {
    expect(await remove(actor, 501)).toEqual({
      ok: false,
      refusal: 'actor-not-allowed',
    });
    expect((await messagesNow()).map((row) => row['id'])).toContain(501);
  });

  it("refuses another tournament's message and one that is not there", async () => {
    expect(await remove(ADA, 504)).toEqual({
      ok: false,
      refusal: 'no-such-message',
    });
    expect(await remove(ADA, 999)).toEqual({
      ok: false,
      refusal: 'no-such-message',
    });
    expect((await messagesNow()).map((row) => row['id'])).toContain(504);
  });
});

describe('findAdminMessage', () => {
  it("is the list's own row for that message, found by its id alone", async () => {
    const { messages } = await loadAdminMessages(db, TOURNAMENT_ID);
    expect(messages.length).toBeGreaterThan(1);
    for (const row of messages) {
      expect(await findAdminMessage(db, TOURNAMENT_ID, row.message.id)).toEqual(
        row,
      );
    }
  });

  it("finds a message of the tournament's leagues and a detached one", async () => {
    expect((await findAdminMessage(db, TOURNAMENT_ID, 501))?.message.text).toBe(
      'Klubo žinutė',
    );
    expect((await findAdminMessage(db, TOURNAMENT_ID, 503))?.leagueName).toBe(
      null,
    );
  });

  it("is null for another tournament's message and an unknown one", async () => {
    expect(await findAdminMessage(db, TOURNAMENT_ID, 504)).toBeNull();
    expect(await findAdminMessage(db, TOURNAMENT_ID, 999)).toBeNull();
  });
});
