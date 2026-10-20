// Slice 14 (R-87, R-95, R-105, R-118, sportbet #128): the superadmin's league
// screens - edit, delete, the guest mark, the payments door - and their
// loaders. The leagues of the tournament the admin works on only.

import {
  cents,
  type DetailsEntry,
  type League,
  type LeagueEntry,
  type LeagueId,
  type LeagueMember,
  type PlayerId,
  type Role,
} from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadRoster, savePlayers, savePlayerSettings } from '../src';
import {
  deleteLeagueAsSuperadmin,
  findAdminLeague,
  loadAdminLeagueMembers,
  loadAdminLeagues,
  setLeagueGuest,
  updateLeagueAsSuperadmin,
} from '../src/league/admin';
import {
  loadPaymentsPage,
  saveDetails,
  savePayments,
} from '../src/league/payments';
import { saveLeagues, saveMessages } from '../src/league/repository';
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

const CLUB = leagueNo(41);
const FRIENDS = leagueNo(42);
const ABROAD = leagueNo(46);
const UNDATED = leagueNo(47);

const ROLES_OF: Readonly<Record<string, Role>> = {
  '1': 'superadmin',
  '2': 'player',
  '3': 'results-manager',
  '4': 'player',
};

const TOURNAMENT_ID = TOURNAMENT.id;

const privateLeague = (
  id: LeagueId,
  owner: PlayerId | null,
  over: Partial<League> = {},
): League => ({
  id,
  tournament: tournamentKey(String(TOURNAMENT_ID)),
  name: `Lyga ${String(id)}`,
  description: null,
  kind: { public: false, owner },
  fee: { base: 20, penaltyStep: 2, reward: 'Pyragas' },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
  ...over,
});

const member = (
  id: number,
  of: LeagueId,
  who: PlayerId,
  over: Partial<LeagueMember> = {},
): LeagueMember => ({
  id,
  league: of,
  player: who,
  isAdmin: false,
  isGuest: false,
  paid: null,
  joinedAt: at('2026-09-03T10:00:00Z'),
  ...over,
});

/**
 * ADA is the superadmin. Club (41): BEN owns and administers it, CAI and DAN
 * are members, DAN selects it. Friends (42): CAI owns it, DAN is a member,
 * created later. Abroad (46) is the other tournament's. Undated (47) has no
 * creation date and no owner. A message sits on Club.
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
      league: privateLeague(CLUB, BEN),
      members: [
        member(801, CLUB, BEN, { isAdmin: true }),
        member(802, CLUB, CAI),
        member(803, CLUB, DAN),
      ],
    },
    {
      league: privateLeague(FRIENDS, CAI, {
        createdAt: at('2026-09-05T10:00:00Z'),
      }),
      members: [
        member(804, FRIENDS, CAI, { isAdmin: true }),
        member(805, FRIENDS, DAN),
      ],
    },
    {
      league: privateLeague(UNDATED, null, { createdAt: null }),
      members: [],
    },
  ]);
  await saveLeagues(db, OTHER, [
    {
      league: privateLeague(ABROAD, BEN, {
        tournament: tournamentKey(String(OTHER.id)),
      }),
      members: [member(806, ABROAD, BEN, { isAdmin: true })],
    },
  ]);
  await saveMessages(db, [
    { id: 501, league: CLUB, text: 'Klubo žinutė', active: true },
  ]);
  await client.query(
    'update tournament_players set selected_league_id = 41 where player_id = 4 and tournament_id = 3',
  );
});

const publicLeagueOf = async (tournament: number): Promise<LeagueId> =>
  leagueNo(
    Number(
      rowsOf(
        await client.query(
          'select id from leagues where tournament_id = $1 and is_public',
          [tournament],
        ),
      )[0]?.['id'],
    ),
  );

const entry = (over: Partial<LeagueEntry> = {}): LeagueEntry => ({
  name: 'Naujas pavadinimas',
  description: 'Naujas aprašymas',
  baseFee: 30,
  penaltyStep: 3,
  reward: null,
  ...over,
});

const leagueRow = async (id: number) =>
  rowsOf(
    await client.query(
      `select name, description, base_fee, penalty_step, reward_description, owner_id
         from leagues where id = $1`,
      [id],
    ),
  )[0];

describe('updateLeagueAsSuperadmin (sportbet #128)', () => {
  const edit = (
    league: LeagueId,
    over: { actor?: PlayerId; tournament?: number; entry?: LeagueEntry } = {},
  ) =>
    updateLeagueAsSuperadmin(db, {
      actor: over.actor ?? ADA,
      tournament: over.tournament ?? TOURNAMENT_ID,
      league,
      entry: over.entry ?? entry(),
    });

  it("changes the owner's four fields and nothing else, a league the superadmin is no member of", async () => {
    expect(await edit(CLUB)).toEqual({ ok: true, value: undefined });
    expect(await leagueRow(41)).toEqual({
      name: 'Naujas pavadinimas',
      description: 'Naujas aprašymas',
      base_fee: 30,
      penalty_step: 3,
      reward_description: 'Pyragas',
      owner_id: 2,
    });
  });

  it('edits the public league too, which has no owner', async () => {
    const publicLeague = await publicLeagueOf(TOURNAMENT_ID);
    expect((await edit(publicLeague)).ok).toBe(true);
    expect((await leagueRow(publicLeague))?.['name']).toBe(
      'Naujas pavadinimas',
    );
  });

  it('clears the optional fields as the form leaves them blank', async () => {
    await edit(CLUB, {
      entry: entry({ description: null, baseFee: null, penaltyStep: null }),
    });
    expect(await leagueRow(41)).toMatchObject({
      description: null,
      base_fee: null,
      penalty_step: null,
    });
  });

  it.each([
    ['a league owner', BEN],
    ['a results manager', CAI],
    ['no account', player('99')],
  ])('refuses %s as the actor, and writes nothing', async (_label, actor) => {
    const before = await leagueRow(41);
    expect(await edit(CLUB, { actor })).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await leagueRow(41)).toEqual(before);
  });

  it("refuses another tournament's league and an unknown one", async () => {
    expect(await edit(ABROAD)).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
    expect(await edit(leagueNo(999))).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
    expect((await leagueRow(46))?.['name']).toBe('Lyga 46');
  });
});

describe('deleteLeagueAsSuperadmin (R-118)', () => {
  const remove = (
    league: LeagueId,
    over: { actor?: PlayerId; tournament?: number } = {},
  ) =>
    deleteLeagueAsSuperadmin(db, {
      actor: over.actor ?? ADA,
      tournament: over.tournament ?? TOURNAMENT_ID,
      league,
    });

  it('ends a private league whoever owns it: members and invites go, messages are detached, selectors move to the public league', async () => {
    const publicLeague = await publicLeagueOf(TOURNAMENT_ID);
    expect(await remove(CLUB)).toEqual({ ok: true, value: undefined });
    expect(await leagueRow(41)).toBeUndefined();
    expect(
      rowsOf(
        await client.query(
          'select count(*)::int as n from league_members where league_id = 41',
        ),
      ),
    ).toEqual([{ n: 0 }]);
    expect(
      rowsOf(
        await client.query('select league_id from messages where id = 501'),
      ),
    ).toEqual([{ league_id: null }]);
    expect(
      rowsOf(
        await client.query(
          'select selected_league_id from tournament_players where player_id = 4 and tournament_id = 3',
        ),
      ),
    ).toEqual([{ selected_league_id: publicLeague }]);
  });

  it('ends a league with no owner', async () => {
    expect((await remove(UNDATED)).ok).toBe(true);
    expect(await leagueRow(47)).toBeUndefined();
  });

  it("leaves other leagues and the members' other memberships alone", async () => {
    await remove(CLUB);
    expect(await leagueRow(42)).toBeDefined();
    expect(
      rowsOf(
        await client.query(
          'select count(*)::int as n from league_members where league_id = 42',
        ),
      ),
    ).toEqual([{ n: 2 }]);
  });

  it('refuses the public league: "Viešos lygos ištrinti negalima"', async () => {
    const publicLeague = await publicLeagueOf(TOURNAMENT_ID);
    expect(await remove(publicLeague)).toEqual({
      ok: false,
      refusal: 'public',
    });
    expect(await leagueRow(publicLeague)).toBeDefined();
  });

  it.each([
    ['the league owner', BEN],
    ['a results manager', CAI],
    ['no account', player('99')],
  ])('refuses %s as the actor, and writes nothing', async (_label, actor) => {
    expect(await remove(CLUB, { actor })).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await leagueRow(41)).toBeDefined();
  });

  it("refuses another tournament's league and an unknown one", async () => {
    expect(await remove(ABROAD)).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
    expect(await remove(leagueNo(999))).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
    expect(await leagueRow(46)).toBeDefined();
  });
});

describe('setLeagueGuest (R-87)', () => {
  const mark = (
    who: PlayerId,
    guest: boolean,
    over: { league?: LeagueId; actor?: PlayerId; tournament?: number } = {},
  ) =>
    setLeagueGuest(db, {
      actor: over.actor ?? ADA,
      tournament: over.tournament ?? TOURNAMENT_ID,
      league: over.league ?? CLUB,
      player: who,
      guest,
    });

  const rosterOf = async (viewer: PlayerId) =>
    [...(await loadRoster(db, TOURNAMENT, { selectedBy: viewer }))].sort();

  beforeEach(async () => {
    await client.query(
      'update tournament_players set selected_league_id = 41 where player_id in (3, 4) and tournament_id = 3',
    );
  });

  it("narrows the roster of a full member at once, and not a guest's", async () => {
    expect(await rosterOf(CAI)).toEqual([BEN, CAI, DAN]);
    expect(await mark(DAN, true)).toEqual({ ok: true, value: undefined });
    // CAI is a full member: the guest is gone from their view
    expect(await rosterOf(CAI)).toEqual([BEN, CAI]);
    // DAN is a guest: sees everyone
    expect(await rosterOf(DAN)).toEqual([BEN, CAI, DAN]);
  });

  it('makes a guest a full member again', async () => {
    await mark(DAN, true);
    expect(await mark(DAN, false)).toEqual({ ok: true, value: undefined });
    expect(await rosterOf(CAI)).toEqual([BEN, CAI, DAN]);
  });

  it('changes the one flag and moves no points and no selection', async () => {
    const before = rowsOf(
      await client.query('select * from tournament_players order by 1, 2'),
    );
    await mark(DAN, true);
    expect(
      rowsOf(
        await client.query('select * from tournament_players order by 1, 2'),
      ),
    ).toEqual(before);
    expect(
      rowsOf(
        await client.query(
          'select is_guest, is_admin, paid_cents from league_members where id = 803',
        ),
      ),
    ).toEqual([{ is_guest: true, is_admin: false, paid_cents: null }]);
  });

  it('refuses a player who is no member of the league, and a mark that changes nothing', async () => {
    expect(await mark(ADA, true)).toEqual({ ok: false, refusal: 'not-member' });
    expect(await mark(DAN, false)).toEqual({ ok: false, refusal: 'unchanged' });
    await mark(DAN, true);
    expect(await mark(DAN, true)).toEqual({ ok: false, refusal: 'unchanged' });
  });

  it("refuses another tournament's league and an unknown one", async () => {
    expect(await mark(BEN, true, { league: ABROAD })).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
    expect(await mark(BEN, true, { league: leagueNo(999) })).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
  });

  it.each([
    ['the league owner', BEN],
    ['a results manager', CAI],
  ])('refuses %s as the actor, and writes nothing', async (_label, actor) => {
    expect(await mark(DAN, true, { actor })).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(
      rowsOf(
        await client.query(
          'select is_guest from league_members where id = 803',
        ),
      ),
    ).toEqual([{ is_guest: false }]);
  });
});

describe('the payments door (LeaguePaymentController::adminEdit)', () => {
  const door = { superadmin: ADA, tournament: TOURNAMENT_ID };
  const detailsOf = (beneficiary: string): DetailsEntry => ({
    beneficiary,
    iban: null,
    note: null,
  });

  it('saves what each member paid in the public league, which a league admin cannot reach', async () => {
    const publicLeague = await publicLeagueOf(TOURNAMENT_ID);
    const members = rowsOf(
      await client.query(
        'select id from league_members where league_id = $1 order by id',
        [publicLeague],
      ),
    );
    const first = Number(members[0]?.['id']);
    const paid = new Map([[first, unwrap(cents(1250))]]);
    expect(
      await savePayments(db, {
        actor: door,
        league: publicLeague,
        entry: paid,
      }),
    ).toMatchObject({ ok: true });
    expect(
      rowsOf(
        await client.query(
          'select paid_cents from league_members where id = $1',
          [first],
        ),
      ),
    ).toEqual([{ paid_cents: 1250 }]);
    // a plain league admin (BEN, as a member) is refused for the public league
    expect(
      await savePayments(db, {
        actor: BEN,
        league: publicLeague,
        entry: paid,
      }),
    ).toEqual({ ok: false, refusal: 'public-league' });
  });

  it('opens a private league with no membership, and still refuses an id that is no member of it', async () => {
    expect(
      await savePayments(db, {
        actor: door,
        league: FRIENDS,
        entry: new Map([[804, unwrap(cents(500))]]),
      }),
    ).toMatchObject({ ok: true });
    expect(
      await savePayments(db, {
        actor: door,
        league: FRIENDS,
        entry: new Map([[801, unwrap(cents(500))]]),
      }),
    ).toEqual({ ok: false, refusal: 'unknown-member' });
  });

  it('loads the page of any league of the tournament, the public one included', async () => {
    const publicLeague = await publicLeagueOf(TOURNAMENT_ID);
    for (const league of [publicLeague, CLUB]) {
      expect((await loadPaymentsPage(db, { actor: door, league })).ok).toBe(
        true,
      );
    }
  });

  it('writes the public league details (the only door for them)', async () => {
    const publicLeague = await publicLeagueOf(TOURNAMENT_ID);
    expect(
      await saveDetails(db, {
        actor: door,
        league: publicLeague,
        entry: detailsOf('Lietuvos krepšinis'),
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      rowsOf(
        await client.query(
          'select payment_beneficiary from leagues where id = $1',
          [publicLeague],
        ),
      ),
    ).toEqual([{ payment_beneficiary: 'Lietuvos krepšinis' }]);
  });

  it('opens no league of another tournament, and no door to a superadmin who is none', async () => {
    expect(
      await loadPaymentsPage(db, {
        actor: door,
        league: ABROAD,
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    expect(
      await savePayments(db, {
        actor: door,
        league: ABROAD,
        entry: new Map([[806, unwrap(cents(1))]]),
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    for (const impostor of [BEN, CAI, player('99')]) {
      const fake = { superadmin: impostor, tournament: TOURNAMENT_ID };
      expect(
        await loadPaymentsPage(db, {
          actor: fake,
          league: CLUB,
        }),
      ).toEqual({ ok: false, refusal: 'not-an-admin' });
      expect(
        await saveDetails(db, {
          actor: fake,
          league: CLUB,
          entry: detailsOf('x'),
        }),
      ).toEqual({ ok: false, refusal: 'not-an-admin' });
      expect(
        await savePayments(db, {
          actor: fake,
          league: CLUB,
          entry: new Map([[801, unwrap(cents(1))]]),
        }),
      ).toEqual({ ok: false, refusal: 'not-an-admin' });
    }
  });
});

describe('loadAdminLeagues', () => {
  it("lists the tournament's leagues, the public one first, then the newest, a league with no date last", async () => {
    const listed = await loadAdminLeagues(db, TOURNAMENT_ID);
    expect(listed.map((row) => Number(row.league.id))).toEqual([
      Number(await publicLeagueOf(TOURNAMENT_ID)),
      42,
      41,
      47,
    ]);
  });

  it('counts members and names the owner, "no owner" for the public league and an ownerless one', async () => {
    const listed = await loadAdminLeagues(db, TOURNAMENT_ID);
    const byId = new Map(listed.map((row) => [Number(row.league.id), row]));
    expect(byId.get(41)?.memberCount).toBe(3);
    expect(byId.get(41)?.owner).toEqual({
      player: BEN,
      username: 'ben',
      fullName: 'ben',
    });
    expect(byId.get(42)?.owner?.player).toBe(CAI);
    expect(byId.get(47)?.memberCount).toBe(0);
    expect(byId.get(47)?.owner).toBeNull();
    const publicRow = listed[0];
    expect(publicRow?.league.kind).toEqual({ public: true });
    expect(publicRow?.owner).toBeNull();
    expect(publicRow?.memberCount).toBe(4);
  });

  it("lists nothing of another tournament's leagues", async () => {
    const listed = await loadAdminLeagues(db, TOURNAMENT_ID);
    expect(listed.map((row) => Number(row.league.id))).not.toContain(46);
    expect(
      (await loadAdminLeagues(db, OTHER.id)).map((row) =>
        Number(row.league.id),
      ),
    ).toContain(46);
  });
});

describe('loadAdminLeagueMembers', () => {
  it('lists the members by joining order with their names, the owner, the admin and the guests marked', async () => {
    await setLeagueGuest(db, {
      actor: ADA,
      tournament: TOURNAMENT_ID,
      league: CLUB,
      player: DAN,
      guest: true,
    });
    const found = await loadAdminLeagueMembers(db, {
      tournament: TOURNAMENT_ID,
      league: CLUB,
    });
    expect(found?.league.id).toBe(CLUB);
    expect(
      found?.members.map((row) => [
        row.username,
        row.isOwner,
        row.member.isAdmin,
        row.member.isGuest,
      ]),
    ).toEqual([
      ['ben', true, true, false],
      ['cai', false, false, false],
      ['dan', false, false, true],
    ]);
  });

  it("is null for another tournament's league and an unknown one", async () => {
    expect(
      await loadAdminLeagueMembers(db, {
        tournament: TOURNAMENT_ID,
        league: ABROAD,
      }),
    ).toBeNull();
    expect(
      await loadAdminLeagueMembers(db, {
        tournament: TOURNAMENT_ID,
        league: leagueNo(999),
      }),
    ).toBeNull();
  });
});

describe('findAdminLeague', () => {
  it("is the list's own row for that league, with its member count, found by its id alone", async () => {
    const listed = await loadAdminLeagues(db, TOURNAMENT_ID);
    expect(listed.length).toBeGreaterThan(1);
    for (const row of listed) {
      expect(
        await findAdminLeague(db, {
          tournament: TOURNAMENT_ID,
          league: row.league.id,
        }),
      ).toEqual(row);
    }
  });

  it('finds a league of the tournament with its owner, for the confirmation page', async () => {
    const found = await findAdminLeague(db, {
      tournament: TOURNAMENT_ID,
      league: CLUB,
    });
    expect(found?.league.name).toBe('Lyga 41');
    expect(found?.owner?.username).toBe('ben');
  });

  it("is null for another tournament's league and an unknown one", async () => {
    expect(
      await findAdminLeague(db, { tournament: TOURNAMENT_ID, league: ABROAD }),
    ).toBeNull();
    expect(
      await findAdminLeague(db, {
        tournament: TOURNAMENT_ID,
        league: leagueNo(999),
      }),
    ).toBeNull();
  });
});
