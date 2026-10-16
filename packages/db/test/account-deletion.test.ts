// Slice 14 (R-25, R-69, R-99, R-112, R-113, R-117, #41): deleteAccount, the one
// path that removes a player - an admin's, and slice 17's own. A seeded
// tournament pair with four players, a private league the target owns, a
// result saved by the target as results manager.

import {
  emailAddress,
  Game,
  ruledRules,
  type League,
  type LeagueMember,
  type PlayerId,
  type Role,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  leagueNo,
  player,
  roundNo,
  score,
  scriptedDice,
  testPlayer,
  tournamentKey,
  unwrap,
} from '@sportbet/domain/testing';
import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  advanceIdentitySequences,
  createAccount,
  recalculateLocked,
  savePlayers,
  savePlayerSettings,
  saveResult,
} from '../src';
import { deleteAccount, PLAYER_ROWS_DELETED } from '../src/account/deletion';
import {
  saveInvites,
  saveLeagues,
  saveMessages,
} from '../src/league/repository';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { RECALCULATION_LOCK_NAMESPACE } from '../src/recalculation/lock';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G7,
  G8,
  OTHER,
  rowsOf,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');
const DAN = player('4');
const EVE = player('5');

/** ADA is the superadmin, CAI the results manager being deleted. */
const ROLE_OF: Readonly<Record<string, Role>> = {
  '1': 'superadmin',
  '2': 'player',
  '3': 'results-manager',
  '4': 'player',
  '5': 'player',
};

const CLUB = leagueNo(41);
const ALONE = leagueNo(42);
const BENS = leagueNo(44);
const GUESTS = leagueNo(45);

const privateLeague = (
  id: typeof CLUB,
  name: string,
  owner: PlayerId,
): League => ({
  id,
  tournament: tournamentKey(String(TOURNAMENT.id)),
  name,
  description: null,
  kind: { public: false, owner },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
});

const member = (
  id: number,
  of: typeof CLUB,
  who: PlayerId,
  over: Partial<LeagueMember> = {},
): LeagueMember => ({
  id,
  league: of,
  player: who,
  isAdmin: false,
  isGuest: false,
  paid: null,
  joinedAt: at('2026-03-01T10:00:00Z'),
  ...over,
});

const dice = scriptedDice([10, 10, 10, 5, 5, 5]);

/** Raw SQL that gives every player listed rows in every table that references players. */
async function seedRowsOf(players: readonly number[]): Promise<void> {
  const ids = players.join(',');
  await client.query(
    `insert into match_predictions (player_id, game_id, home, away, origin)
       select p, g, 80, 70, 'real' from unnest(array[${ids}]) p, unnest(array[7, 8]) g
       on conflict do nothing`,
  );
  await client.query(
    `insert into game_odds (source, game_id, home, away, draw)
       select s::points_source, g, 1.5, 2.5, 3.5
         from unnest(array['production', 'sportbet', 'ruled']) s, unnest(array[7, 8]) g`,
  );
  await client.query(
    `insert into match_points (source, player_id, game_id, winner, margin, bingo, "full", odds, serija)
       select s::points_source, p, g, 1, 0, 0, 0, 1.5, 0
         from unnest(array['production', 'sportbet', 'ruled']) s,
              unnest(array[${ids}]) p, unnest(array[7, 8]) g`,
  );
  await client.query(
    `insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place)
       select p, t, 1, true, false, null from unnest(array[${ids}]) p, unnest(array[11, 12]) t`,
  );
  await client.query(
    `insert into standings_points (source, player_id, team_id, place_points, place_odds)
       select s::points_source, p, 11, 2.5, 1.5
         from unnest(array['production', 'sportbet', 'ruled']) s, unnest(array[${ids}]) p`,
  );
  await client.query(
    `insert into survival_picks (player_id, tournament_id, round_id, team_id)
       select p, 3, 21, 11 from unnest(array[${ids}]) p`,
  );
  await client.query(
    `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional, sportbet_id)
       select 'production', p, 3, 21, 11, 1, false, 1000 + p from unnest(array[${ids}]) p`,
  );
  await client.query(
    `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional, stored_row_id)
       select 'ruled', p, 3, 21, 11, 1, false, 1000 + p from unnest(array[${ids}]) p`,
  );
}

/**
 * ADA, BEN, CAI and DAN play the tournament, CAI also the other one. Club
 * (41): CAI owns it; BEN (since February) and ADA (since March) are members.
 * Alone (42): CAI owns it, with an invite to DAN and a message. Bens (44): BEN
 * owns it and CAI is a member who selects it.
 */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan'), testPlayer(EVE, 'eve')]);
  await savePlayerSettings(
    db,
    Object.entries(ROLE_OF).map(([id, role]) => ({
      player: player(id),
      locale: 'lt',
      role,
      lastTournament: null,
    })),
  );
  await saveGames(db, TOURNAMENT, [G7, G8]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI, DAN);
  await savePlaying(db, OTHER, CAI);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: privateLeague(CLUB, 'Klubas', CAI),
      members: [
        member(801, CLUB, CAI, { isAdmin: true }),
        member(802, CLUB, BEN, { joinedAt: at('2026-02-01T10:00:00Z') }),
        member(803, CLUB, ADA),
      ],
    },
    {
      league: privateLeague(ALONE, 'Vienišas', CAI),
      members: [member(804, ALONE, CAI, { isAdmin: true })],
    },
    {
      league: privateLeague(BENS, 'Beno', BEN),
      members: [
        member(805, BENS, BEN, { isAdmin: true }),
        member(806, BENS, CAI),
      ],
    },
  ]);
  await saveInvites(db, [
    {
      id: 901,
      league: ALONE,
      invitee: DAN,
      invitedBy: CAI,
      createdAt: at('2026-09-03T10:00:00Z'),
    },
    {
      id: 902,
      league: BENS,
      invitee: DAN,
      invitedBy: CAI,
      createdAt: at('2026-09-03T10:00:00Z'),
    },
  ]);
  await saveMessages(db, [
    { id: 501, league: ALONE, text: 'Vienišo žinutė', active: true },
    { id: 502, league: BENS, text: 'Beno žinutė', active: true },
  ]);
  await client.query(
    'update tournament_players set selected_league_id = 44 where player_id = 3 and tournament_id = 3',
  );
  await seedRowsOf([1, 2, 3, 4]);
  await client.query(
    `insert into audit_logins (player_id, method, at) values (2, 'email_code', now()), (3, 'email_code', now()), (3, 'register', now())`,
  );
  await client.query(
    `insert into audit_prediction_games (player_id, game_id, home, away, at) values (2, 7, 1, 2, now()), (3, 7, 3, 4, now())`,
  );
  await client.query(
    `insert into audit_results (player_id, game_id, old_postponed, new_postponed, new_home, new_away, at)
       values (3, 7, false, false, 88, 79, now()), (2, 8, false, false, 80, 80, now())`,
  );
  await client.query(
    `insert into audit_admin_actions (actor_id, target_id, kind, old_role, new_role, at)
       values (3, 2, 'role_change', 'player', 'results-manager', now()),
              (1, 3, 'role_change', 'player', 'results-manager', now())`,
  );
  await client.query(
    `insert into sessions (token_hash, player_id, created_at, last_seen_at, expires_at)
       values ('h2', 2, now(), now(), now() + interval '1 day'),
              ('h3', 3, now(), now(), now() + interval '1 day')`,
  );
  await client.query(
    `insert into login_codes (email, purpose, code_hash, created_at, expires_at)
       values ('cai@example.test', 'login', 'c1', now(), now() + interval '5 minutes'),
              ('cai@example.test', 'admin_action', 'c2', now(), now() + interval '5 minutes'),
              ('cái@example.test', 'login', 'twin', now(), now() + interval '5 minutes'),
              ('ben@example.test', 'login', 'c3', now(), now() + interval '5 minutes'),
              ('cai.new@example.test', 'email_change', 'c4', now(), now() + interval '5 minutes'),
              ('cai.new@example.test', 'login', 'c7', now(), now() + interval '5 minutes'),
              ('ben.new@example.test', 'email_change', 'c5', now(), now() + interval '5 minutes')`,
  );
  await client.query(
    "update players set pending_email = case id when 3 then 'cai.new@example.test' when 2 then 'ben.new@example.test' end where id in (2, 3)",
  );
});

const count = async (sql: string, params: unknown[] = []) =>
  z
    .array(z.object({ n: z.coerce.number() }))
    .parse((await client.query(sql, params)).rows)[0]?.n;

/** Every row that names player `id`, by table: what a deletion must leave at zero. */
async function rowsNaming(id: number): Promise<Record<string, number>> {
  const where: readonly (readonly [string, string])[] = [
    ['players', 'id'],
    ['player_settings', 'player_id'],
    ['sessions', 'player_id'],
    ['audit_logins', 'player_id'],
    ['audit_prediction_games', 'player_id'],
    ['tournament_players', 'player_id'],
    ['league_members', 'player_id'],
    ['league_invites', 'invitee_id'],
    ['match_predictions', 'player_id'],
    ['standings_predictions', 'player_id'],
    ['survival_picks', 'player_id'],
    ['match_points', 'player_id'],
    ['standings_points', 'player_id'],
    ['survival_points', 'player_id'],
  ];
  const found: Record<string, number> = {};
  for (const [table, column] of where) {
    found[table] =
      (await count(`select count(*) as n from ${table} where ${column} = $1`, [
        id,
      ])) ?? 0;
  }
  return found;
}

const ZERO_ROWS = {
  players: 0,
  player_settings: 0,
  sessions: 0,
  audit_logins: 0,
  audit_prediction_games: 0,
  tournament_players: 0,
  league_members: 0,
  league_invites: 0,
  match_predictions: 0,
  standings_predictions: 0,
  survival_picks: 0,
  match_points: 0,
  standings_points: 0,
  survival_points: 0,
};

/** Everything other accounts own that a deletion must not touch, as text. */
async function othersSnapshot(): Promise<string> {
  const queries = [
    'select to_jsonb(t) j from match_points t where player_id <> 3 order by source, player_id, game_id',
    'select to_jsonb(t) j from game_odds t order by source, game_id',
    'select to_jsonb(t) j from standings_points t where player_id <> 3 order by source, player_id, team_id',
    'select to_jsonb(t) j from survival_points t where player_id <> 3 order by source, player_id',
    'select to_jsonb(t) j from match_predictions t where player_id <> 3 order by player_id, game_id',
    'select to_jsonb(t) j from standings_predictions t where player_id <> 3 order by player_id, team_id',
    'select to_jsonb(t) j from survival_picks t where player_id <> 3 order by player_id',
    'select to_jsonb(t) j from tournament_players t where player_id <> 3 order by tournament_id, player_id',
    'select to_jsonb(t) j from audit_logins t where player_id <> 3 order by id',
    'select to_jsonb(t) j from sessions t where player_id <> 3 order by id',
  ];
  const parts: unknown[] = [];
  for (const query of queries) parts.push(rowsOf(await client.query(query)));
  return JSON.stringify(parts);
}

const asAdmin = (target: PlayerId, admin: PlayerId = ADA) =>
  deleteAccount(db, { target, by: { admin }, now: NOW });

describe('deleteAccount by an admin (R-25)', () => {
  it('deletes every row of the account, in every table that holds one', async () => {
    expect(await rowsNaming(3)).toEqual({
      players: 1,
      player_settings: 1,
      sessions: 1,
      audit_logins: 2,
      audit_prediction_games: 1,
      tournament_players: 2,
      league_members: 5,
      league_invites: 0,
      match_predictions: 2,
      standings_predictions: 2,
      survival_picks: 1,
      match_points: 6,
      standings_points: 3,
      survival_points: 2,
    });
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(await rowsNaming(3)).toEqual(ZERO_ROWS);
  });

  it('deletes the invites sent to the account and forgets who sent the others', async () => {
    await saveInvites(db, [
      {
        id: 903,
        league: BENS,
        invitee: EVE,
        invitedBy: CAI,
        createdAt: at('2026-09-04T10:00:00Z'),
      },
    ]);
    await client.query(
      'insert into league_invites (id, league_id, invitee_id, invited_by_id) overriding system value values (904, 44, 3, 2)',
    );
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(
      rowsOf(
        await client.query(
          'select id, invitee_id, invited_by_id from league_invites order by id',
        ),
      ),
    ).toEqual([
      { id: 902, invitee_id: 4, invited_by_id: null },
      { id: 903, invitee_id: 5, invited_by_id: null },
    ]);
  });

  it("deletes the address's login codes and no other spelling's (#41)", async () => {
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(
      rowsOf(
        await client.query(
          'select email, code_hash from login_codes order by code_hash',
        ),
      ),
    ).toEqual([
      { email: 'ben@example.test', code_hash: 'c3' },
      { email: 'ben.new@example.test', code_hash: 'c5' },
      { email: 'cai.new@example.test', code_hash: 'c7' },
      { email: 'cái@example.test', code_hash: 'twin' },
    ]);
  });

  it("deletes the email_change codes of the pending address and none of its other purposes, and only that account's (#41)", async () => {
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(
      rowsOf(
        await client.query(
          "select code_hash from login_codes where email like '%.new@example.test' order by code_hash",
        ),
      ),
    ).toEqual([{ code_hash: 'c5' }, { code_hash: 'c7' }]);
  });

  it("ends the account's sessions and no one else's", async () => {
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(
      rowsOf(await client.query('select token_hash from sessions')),
    ).toEqual([{ token_hash: 'h2' }]);
  });

  it('keeps audit_results, forgetting only who saved the change (R-69)', async () => {
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(
      rowsOf(
        await client.query(
          'select player_id, game_id, new_home, new_away from audit_results order by id',
        ),
      ),
    ).toEqual([
      { player_id: null, game_id: 7, new_home: 88, new_away: 79 },
      { player_id: 2, game_id: 8, new_home: 80, new_away: 80 },
    ]);
  });

  it('keeps the admin trail with the party forgotten, and records the deletion (R-117)', async () => {
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(
      rowsOf(
        await client.query(
          `select actor_id, target_id, kind::text as kind, old_role::text as old_role, new_role::text as new_role
             from audit_admin_actions order by id`,
        ),
      ),
    ).toEqual([
      {
        actor_id: null,
        target_id: 2,
        kind: 'role_change',
        old_role: 'player',
        new_role: 'results-manager',
      },
      {
        actor_id: 1,
        target_id: null,
        kind: 'role_change',
        old_role: 'player',
        new_role: 'results-manager',
      },
      {
        actor_id: 1,
        target_id: null,
        kind: 'account_deletion',
        old_role: 'results-manager',
        new_role: null,
      },
    ]);
  });

  it("changes nobody else's stored rows, game_odds included, byte for byte (R-99)", async () => {
    const before = await othersSnapshot();
    expect((await asAdmin(CAI)).ok).toBe(true);
    // The selection and the memberships of others are untouched too; only
    // the account's own rows went.
    expect(await othersSnapshot()).toBe(before);
  });

  it("recalculates nothing: no points row is written, moved or removed but the account's", async () => {
    const total = (await count('select count(*) as n from match_points')) ?? 0;
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(await count('select count(*) as n from match_points')).toBe(
      total - 6,
    );
    expect(await count('select count(*) as n from game_odds')).toBe(6);
  });

  it("a ruled recalculation after the deletion leaves every other player's match points and the game_odds as they were (R-99)", async () => {
    expect(await recalculateLocked(db, TOURNAMENT, ruledRules)).toBeNull();
    const rows = async () =>
      JSON.stringify([
        rowsOf(
          await client.query(
            "select to_jsonb(t) j from match_points t where player_id <> 3 and source = 'ruled' order by game_id, player_id",
          ),
        ),
        rowsOf(
          await client.query(
            "select to_jsonb(t) j from game_odds t where source = 'ruled' order by game_id",
          ),
        ),
      ]);
    const before = await rows();
    expect(before).toContain('"game_id"');
    expect((await asAdmin(CAI)).ok).toBe(true);
    expect(await recalculateLocked(db, TOURNAMENT, ruledRules)).toBeNull();
    expect(await rows()).toBe(before);
    expect(
      await count(
        "select count(*) as n from match_points where player_id = 3 and source = 'ruled'",
      ),
    ).toBe(0);
  });

  it('refuses an unknown account and writes nothing', async () => {
    const before = await othersSnapshot();
    expect(await asAdmin(player('99'))).toEqual({
      ok: false,
      refusal: 'no-such-account',
    });
    expect(await othersSnapshot()).toBe(before);
  });
});

describe('the leagues the account owned (R-25, R-112, R-113)', () => {
  it('passes a league to the longest-standing full member, who becomes its owner and admin', async () => {
    const deleted = await asAdmin(CAI);
    expect(deleted.ok && deleted.value.handedOver).toContainEqual({
      league: CLUB,
      newOwner: BEN,
    });
    expect(
      rowsOf(
        await client.query(
          `select l.owner_id, m.is_admin from leagues l
             join league_members m on m.league_id = l.id and m.player_id = l.owner_id
            where l.id = 41`,
        ),
      ),
    ).toEqual([{ owner_id: 2, is_admin: true }]);
  });

  it('leaves the league intact for its other members: their rows, admin flags and selections', async () => {
    await asAdmin(CAI);
    expect(
      rowsOf(
        await client.query(
          'select player_id, is_admin, is_guest from league_members where league_id = 41 order by player_id',
        ),
      ),
    ).toEqual([
      { player_id: 1, is_admin: false, is_guest: false },
      { player_id: 2, is_admin: true, is_guest: false },
    ]);
  });

  it('deletes an owner-only league with its invites, and detaches its messages (R-112)', async () => {
    await asAdmin(CAI);
    expect(await count('select count(*) as n from leagues where id = 42')).toBe(
      0,
    );
    expect(
      await count(
        'select count(*) as n from league_invites where league_id = 42',
      ),
    ).toBe(0);
    expect(
      rowsOf(
        await client.query(
          'select id, league_id, text from messages order by id',
        ),
      ),
    ).toEqual([
      { id: 501, league_id: null, text: 'Vienišo žinutė' },
      { id: 502, league_id: 44, text: 'Beno žinutė' },
    ]);
  });

  it("leaves a league the account only belonged to, and releases the account's selection of it", async () => {
    await asAdmin(CAI);
    expect(
      rowsOf(
        await client.query('select id, owner_id from leagues where id = 44'),
      ),
    ).toEqual([{ id: 44, owner_id: 2 }]);
    expect(
      await count(
        'select count(*) as n from league_members where league_id = 44',
      ),
    ).toBe(1);
  });

  it('leaves the public league and its other members', async () => {
    await asAdmin(CAI);
    expect(
      await count(
        'select count(*) as n from league_members m join leagues l on l.id = m.league_id where l.is_public',
      ),
    ).toBe(3);
  });

  it('breaks a tie at the same instant by the lower membership id, not the player id', async () => {
    const same = at('2026-05-01T10:00:00Z');
    await saveLeagues(db, TOURNAMENT, [
      {
        league: privateLeague(GUESTS, 'Vienodi', CAI),
        members: [
          member(807, GUESTS, CAI, { isAdmin: true }),
          member(808, GUESTS, DAN, { joinedAt: same }),
          member(809, GUESTS, BEN, { joinedAt: same }),
        ],
      },
    ]);
    await asAdmin(CAI);
    expect(
      rowsOf(await client.query('select owner_id from leagues where id = 45')),
    ).toEqual([{ owner_id: 4 }]);
  });

  it('prefers a full member over a guest who has been there longer (R-113)', async () => {
    await saveLeagues(db, TOURNAMENT, [
      {
        league: privateLeague(GUESTS, 'Svečiai', CAI),
        members: [
          member(807, GUESTS, CAI, { isAdmin: true }),
          member(808, GUESTS, BEN, {
            isGuest: true,
            joinedAt: at('2026-01-01T10:00:00Z'),
          }),
          member(809, GUESTS, DAN, { joinedAt: at('2026-06-01T10:00:00Z') }),
        ],
      },
    ]);
    await asAdmin(CAI);
    expect(
      rowsOf(await client.query('select owner_id from leagues where id = 45')),
    ).toEqual([{ owner_id: 4 }]);
  });

  it('gives a league to a guest only when no full member is left (R-113)', async () => {
    await saveLeagues(db, TOURNAMENT, [
      {
        league: privateLeague(GUESTS, 'Svečiai', CAI),
        members: [
          member(807, GUESTS, CAI, { isAdmin: true }),
          member(808, GUESTS, BEN, {
            isGuest: true,
            joinedAt: at('2026-01-01T10:00:00Z'),
          }),
        ],
      },
    ]);
    await asAdmin(CAI);
    expect(
      rowsOf(
        await client.query(
          `select l.owner_id, m.is_admin, m.is_guest from leagues l
             join league_members m on m.league_id = l.id and m.player_id = l.owner_id
            where l.id = 45`,
        ),
      ),
    ).toEqual([{ owner_id: 2, is_admin: true, is_guest: true }]);
  });
});

describe('who may delete (R-26 amended)', () => {
  const written = () => othersSnapshot();

  it('refuses an admin deleting their own account and writes nothing', async () => {
    const before = await written();
    expect(await asAdmin(ADA)).toEqual({ ok: false, refusal: 'own-account' });
    expect(await written()).toBe(before);
    expect(await count('select count(*) as n from players where id = 1')).toBe(
      1,
    );
  });

  it.each([
    ['a player', BEN],
    ['a results manager', CAI],
  ])(
    'refuses an actor who is %s now, and writes nothing',
    async (_label, actor) => {
      const before = await written();
      expect(await asAdmin(DAN, actor)).toEqual({
        ok: false,
        refusal: 'actor-not-superadmin',
      });
      expect(await written()).toBe(before);
      expect(
        await count('select count(*) as n from players where id = 4'),
      ).toBe(1);
    },
  );

  it('refuses an actor whose account is gone', async () => {
    expect(await asAdmin(DAN, player('99'))).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
  });

  it("under 'self' refuses the last superadmin, and writes nothing", async () => {
    const before = await written();
    expect(
      await deleteAccount(db, { target: ADA, by: 'self', now: NOW }),
    ).toEqual({ ok: false, refusal: 'last-superadmin' });
    expect(await written()).toBe(before);
    expect(await count('select count(*) as n from players where id = 1')).toBe(
      1,
    );
  });

  it("under 'self' lets a superadmin go once another remains, and records no admin action", async () => {
    await client.query(
      "update player_settings set role = 'superadmin' where player_id = 2",
    );
    const before = await count('select count(*) as n from audit_admin_actions');
    expect(
      (await deleteAccount(db, { target: ADA, by: 'self', now: NOW })).ok,
    ).toBe(true);
    expect(await count('select count(*) as n from players where id = 1')).toBe(
      0,
    );
    expect(await count('select count(*) as n from audit_admin_actions')).toBe(
      before,
    );
  });

  it('lets a superadmin delete another superadmin', async () => {
    await client.query(
      "update player_settings set role = 'superadmin' where player_id = 2",
    );
    expect((await asAdmin(BEN)).ok).toBe(true);
    expect(await count('select count(*) as n from players where id = 2')).toBe(
      0,
    );
  });

  it("under 'self' deletes a player and records no admin action", async () => {
    expect(
      (await deleteAccount(db, { target: DAN, by: 'self', now: NOW })).ok,
    ).toBe(true);
    expect(await rowsNaming(4)).toEqual(ZERO_ROWS);
    expect(await count('select count(*) as n from audit_admin_actions')).toBe(
      2,
    );
  });
});

describe("deleteAccount by 'self' (slice 17, R-25, R-130, R-131)", () => {
  const self = (target: PlayerId) =>
    deleteAccount(db, { target, by: 'self', now: NOW });

  it("hands a league the player owned to its longest-standing full member, records nothing, and frees the address, the pending one's code included (R-130)", async () => {
    const trail = await count('select count(*) as n from audit_admin_actions');
    const deleted = await self(CAI);
    expect(deleted.ok && deleted.value.handedOver).toContainEqual({
      league: CLUB,
      newOwner: BEN,
    });
    expect(await count('select count(*) as n from audit_admin_actions')).toBe(
      trail,
    );
    expect(
      rowsOf(
        await client.query(
          "select email from login_codes where email = 'cai@example.test' or (email = 'cai.new@example.test' and purpose = 'email_change')",
        ),
      ),
    ).toEqual([]);
    await advanceIdentitySequences(db);
    const created = await createAccount(
      db,
      {
        username: 'naujas-cai',
        name: 'Cai',
        surname: 'Nauja',
        email: unwrap(emailAddress('cai@example.test')),
        tournament: null,
      },
      { now: NOW, rules: ruledRules, dice },
    );
    expect(created.ok).toBe(true);
  });

  const codeFor = async (email: string, consumed: boolean) => {
    const [row] = z.array(z.object({ id: z.int() })).parse(
      rowsOf(
        await client.query(
          `insert into login_codes (email, purpose, code_hash, created_at, expires_at, consumed_at)
             values ($1, 'account_deletion', 'del', now(), now() + interval '5 minutes', ${consumed ? 'now()' : 'null'})
             returning id`,
          [email],
        ),
      ),
    );
    if (row === undefined) throw new Error('the code was not inserted');
    return row.id;
  };
  const live = async () =>
    count(
      "select count(*) as n from login_codes where purpose = 'account_deletion' and consumed_at is null",
    );

  it('spends the deletion code in the same transaction as the deletion', async () => {
    const code = await codeFor('dan@example.test', false);
    const deleted = await deleteAccount(db, {
      target: DAN,
      by: 'self',
      now: NOW,
      code,
    });
    expect(deleted.ok).toBe(true);
    expect(await count('select count(*) as n from players where id = 4')).toBe(
      0,
    );
  });

  it('leaves the code live when the deletion is refused: the last superadmin (R-131)', async () => {
    const code = await codeFor('ada@example.test', false);
    expect(
      await deleteAccount(db, { target: ADA, by: 'self', now: NOW, code }),
    ).toEqual({ ok: false, refusal: 'last-superadmin' });
    expect(await live()).toBe(1);
  });

  it('refuses code-spent for a code claimed meanwhile, and deletes nothing', async () => {
    const code = await codeFor('dan@example.test', true);
    expect(
      await deleteAccount(db, { target: DAN, by: 'self', now: NOW, code }),
    ).toEqual({ ok: false, refusal: 'code-spent' });
    expect(await count('select count(*) as n from players where id = 4')).toBe(
      1,
    );
  });

  it('refuses the last superadmin (R-131) and writes nothing, the pending codes included', async () => {
    await client.query(
      "update players set pending_email = 'ada.new@example.test' where id = 1",
    );
    await client.query(
      "insert into login_codes (email, purpose, code_hash, created_at, expires_at) values ('ada.new@example.test', 'email_change', 'c6', now(), now() + interval '5 minutes')",
    );
    const codes = await count('select count(*) as n from login_codes');
    const before = await othersSnapshot();
    expect(await self(ADA)).toEqual({
      ok: false,
      refusal: 'last-superadmin',
    });
    expect(await count('select count(*) as n from login_codes')).toBe(codes);
    expect(await othersSnapshot()).toBe(before);
    expect(await count('select count(*) as n from players where id = 1')).toBe(
      1,
    );
  });
});

describe('the tournament lock (R-99, the lock order)', () => {
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

  it('a result saved meanwhile waits for the deletion, then scores without the deleted player', async () => {
    await saveGames(db, TOURNAMENT, [
      unwrap(
        Game.stored({
          id: gameNo(11),
          round: roundNo(1),
          home: FEN,
          away: ZAL,
          tipOff: at('2026-10-12T18:00:00Z'),
          result: null,
          recordedWinner: null,
          lockedSince: null,
          postponed: false,
        }),
      ),
    ]);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 11, 90, 80, 'real'), (2, 11, 90, 80, 'real'), (3, 11, 90, 80, 'real'), (4, 11, null, null, 'real')",
    );
    const settled = { deletion: false, result: false };
    const holder = await client.connect();
    let deleting: ReturnType<typeof asAdmin>;
    let entering: ReturnType<typeof saveResult>;
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1::int, $2::int)', [
        RECALCULATION_LOCK_NAMESPACE,
        TOURNAMENT.id,
      ]);
      deleting = asAdmin(CAI).finally(() => {
        settled.deletion = true;
      });
      await sleep(300);
      entering = saveResult(
        db,
        {
          game: gameNo(11),
          entry: { kind: 'score', score: score(90, 80) },
          now: NOW,
          rules: ruledRules,
          dice,
          by: ADA,
        },
        () => Promise.resolve(NOW),
      ).finally(() => {
        settled.result = true;
      });
      await sleep(400);
      // both wait for the tournament's lock, the deletion first in the queue
      expect(settled).toEqual({ deletion: false, result: false });
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect((await deleting).ok).toBe(true);
    expect(await entering).toEqual({ ok: true, value: null });
    expect(
      await count('select count(*) as n from match_points where player_id = 3'),
    ).toBe(0);
    expect(
      await count(
        "select count(*) as n from match_points where game_id = 11 and source = 'ruled'",
      ),
    ).toBe(3);
  });
});

describe('a join or a founded league racing the locks', () => {
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

  /**
   * Runs `deleteAccount(DAN)` while a second connection holds the player's
   * rows of `table` (so the deletion waits at that step), lets `meanwhile`
   * write on that connection, then commits it.
   */
  async function deletingWhile(
    table: 'match_predictions' | 'tournament_players',
    meanwhile: (holder: PoolClient) => Promise<void>,
  ) {
    const holder = await client.connect();
    let deleting: ReturnType<typeof asAdmin>;
    try {
      await holder.query('begin');
      await holder.query(
        `select 1 from ${table} where player_id = 4 for update`,
      );
      deleting = asAdmin(DAN);
      await sleep(400);
      await meanwhile(holder);
      await holder.query('commit');
    } catch (error) {
      await holder.query('rollback');
      throw error;
    } finally {
      holder.release();
    }
    return deleting;
  }

  /** DAN's place in `tournament`, with the public league a join selects, as registerForTournament writes it. */
  async function placeIn(holder: PoolClient, tournament: number) {
    await holder.query(
      "insert into leagues (tournament_id, name, is_public, created_at) select $1, 'Vieša', true, now() where not exists (select 1 from leagues where tournament_id = $1 and is_public)",
      [tournament],
    );
    await holder.query(
      'insert into league_members (league_id, player_id, is_admin, is_guest, joined_at) select id, 4, false, false, now() from leagues where tournament_id = $1 and is_public',
      [tournament],
    );
    await holder.query(
      'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins, selected_league_id) select $1, 4, false, false, 0, id from leagues where tournament_id = $1 and is_public',
      [tournament],
    );
  }

  it('a place joined in another tournament while the locks are taken is deleted with the account, not thrown on', async () => {
    const deleted = await deletingWhile('match_predictions', async (holder) => {
      await placeIn(holder, OTHER.id);
    });
    expect(deleted.ok).toBe(true);
    expect(await rowsNaming(4)).toEqual(ZERO_ROWS);
  });

  it('a place in a tournament created after the tournaments were read starts the deletion again, and it still goes', async () => {
    const deleted = await deletingWhile('match_predictions', async (holder) => {
      const { rows } = await holder.query(
        "insert into tournaments (slug, name, format, survival) select 'fresh', 'Fresh', format, false from tournaments where id = $1 returning id",
        [OTHER.id],
      );
      await placeIn(
        holder,
        z.array(z.object({ id: z.int() })).parse(rows)[0]?.id ?? 0,
      );
    });
    expect(deleted.ok).toBe(true);
    expect(await rowsNaming(4)).toEqual(ZERO_ROWS);
  });

  it('a league founded while the locks are taken is handed over like any other, never left ownerless (R-113)', async () => {
    const deleted = await deletingWhile(
      'tournament_players',
      async (holder) => {
        // foundLeague's writes: the owner's statuses first (held here), then no league lock.
        const { rows } = await holder.query(
          "insert into leagues (tournament_id, name, is_public, owner_id, created_at) values ($1, 'Naujas', false, 4, now()) returning id",
          [TOURNAMENT.id],
        );
        const league = z.array(z.object({ id: z.int() })).parse(rows)[0]?.id;
        await holder.query(
          'insert into league_members (league_id, player_id, is_admin, is_guest, joined_at) values ($1, 4, true, false, now()), ($1, 2, false, false, now())',
          [league],
        );
      },
    );
    expect(deleted.ok).toBe(true);
    expect(
      (await client.query("select owner_id from leagues where name = 'Naujas'"))
        .rows,
    ).toEqual([{ owner_id: 2 }]);
    expect(
      await count(
        'select count(*) as n from leagues where owner_id is null and not is_public',
      ),
    ).toBe(0);
  });

  it('a league founded alone is deleted with the account (R-112)', async () => {
    const deleted = await deletingWhile(
      'tournament_players',
      async (holder) => {
        const { rows } = await holder.query(
          "insert into leagues (tournament_id, name, is_public, owner_id, created_at) values ($1, 'Vienas', false, 4, now()) returning id",
          [TOURNAMENT.id],
        );
        await holder.query(
          'insert into league_members (league_id, player_id, is_admin, is_guest, joined_at) values ($1, 4, true, false, now())',
          [z.array(z.object({ id: z.int() })).parse(rows)[0]?.id],
        );
      },
    );
    expect(deleted.ok).toBe(true);
    expect(
      await count("select count(*) as n from leagues where name = 'Vienas'"),
    ).toBe(0);
  });
});

describe('PLAYER_ROWS_DELETED', () => {
  it('names the tables deleteAccount deletes from before the account', () => {
    expect([...PLAYER_ROWS_DELETED].sort()).toEqual([
      'match_points',
      'match_predictions',
      'standings_points',
      'standings_predictions',
      'survival_picks',
      'survival_points',
      'tournament_players',
    ]);
  });
});
