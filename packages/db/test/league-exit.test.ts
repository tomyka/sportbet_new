// exitLeague, removeLeague and handOverLeague (#29, R-23, R-29): leaving,
// deleting and handing over a league, and what happens to the selection of
// everyone who selected it.

import {
  ruledRules,
  type League,
  type LeagueMember,
  type PlayerId,
  type TournamentProfile,
} from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadHub,
  loadTournamentPage,
  savePlayers,
  saveTournamentProfile,
} from '../src';
import { exitLeague, handOverLeague, removeLeague } from '../src/league/exit';
import {
  saveInvites,
  saveLeagues,
  saveMessages,
} from '../src/league/repository';
import { selectLeague } from '../src/league/select';
import { useTestDatabase } from '../src/testing';
import { saveTournament } from '../src/tournament/repository';
import {
  ADA,
  BEN,
  CAI,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const CLUB = leagueNo(41);
const FRIENDS = leagueNo(42);

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
  isAdmin: boolean,
): LeagueMember => ({
  id,
  league: of,
  player: who,
  isAdmin,
  isGuest: false,
  paid: null,
  joinedAt: null,
});

const PROFILE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: null,
  isPublic: true,
};

const NOW = at('2026-10-05T12:00:00Z');

/**
 * ADA, BEN and CAI play the tournament and are in its public league. Club
 * (41): ADA owns it, BEN and CAI are members. Friends (42): BEN owns it, CAI
 * is a member. BEN also plays the other tournament.
 */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await saveTournamentProfile(db, TOURNAMENT, PROFILE);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await savePlaying(db, OTHER, BEN);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: privateLeague(CLUB, 'Klubas', ADA),
      members: [
        member(701, CLUB, ADA, true),
        member(702, CLUB, BEN, false),
        member(703, CLUB, CAI, false),
      ],
    },
    {
      league: privateLeague(FRIENDS, 'Draugai', BEN),
      members: [
        member(704, FRIENDS, BEN, true),
        member(705, FRIENDS, CAI, false),
      ],
    },
  ]);
});

const rowsOf = async <T extends z.ZodType>(schema: T, sql: string) =>
  z.array(schema).parse((await client.query(sql)).rows);

const selections = () =>
  rowsOf(
    z.object({
      tournament_id: z.int(),
      player_id: z.int(),
      selected_league_id: z.int(),
    }),
    'select tournament_id, player_id, selected_league_id from tournament_players order by tournament_id, player_id',
  );

const memberships = () =>
  rowsOf(
    z.object({
      league_id: z.int(),
      player_id: z.int(),
      is_admin: z.boolean(),
    }),
    'select league_id, player_id, is_admin from league_members order by league_id, player_id',
  );

const leagueRows = () =>
  rowsOf(
    z.object({ id: z.int(), owner_id: z.int().nullable() }),
    'select id, owner_id from leagues order by id',
  );

const publicLeagueOf = async (tournament: number): Promise<number> => {
  const [row] = await rowsOf(
    z.object({ id: z.int() }),
    `select id from leagues where is_public and tournament_id = ${String(tournament)}`,
  );
  if (row === undefined) throw new Error('no public league');
  return row.id;
};

const selectionOf = async (who: number, tournament = TOURNAMENT.id) =>
  (await selections()).find(
    (row) => row.player_id === who && row.tournament_id === tournament,
  )?.selected_league_id;

const snapshot = async () => ({
  selected: await selections(),
  members: await memberships(),
  leagues: await leagueRows(),
});

describe('exitLeague', () => {
  it('moves the selection to the public league when it selected the league', async () => {
    await selectLeague(db, { player: CAI, league: CLUB });
    const publicLeague = await publicLeagueOf(TOURNAMENT.id);
    expect(await exitLeague(db, { actor: CAI, league: CLUB })).toEqual({
      ok: true,
      value: { selected: leagueNo(publicLeague) },
    });
    expect(await selectionOf(3)).toBe(publicLeague);
    expect(
      (await memberships()).filter(
        (row) => row.league_id === 41 && row.player_id === 3,
      ),
    ).toEqual([]);
  });

  it('leaves the selection of an unselected league alone', async () => {
    const before = await selections();
    expect(await exitLeague(db, { actor: CAI, league: CLUB })).toEqual({
      ok: true,
      value: { selected: null },
    });
    expect(await selections()).toEqual(before);
  });

  it('refuses the public league, the owner and a non-member, and writes nothing', async () => {
    const before = await snapshot();
    const publicLeague = leagueNo(await publicLeagueOf(TOURNAMENT.id));
    expect(
      await exitLeague(db, {
        actor: CAI,
        league: publicLeague,
      }),
    ).toEqual({ ok: false, refusal: 'public' });
    expect(await exitLeague(db, { actor: ADA, league: CLUB })).toEqual({
      ok: false,
      refusal: 'owner',
    });
    expect(await exitLeague(db, { actor: ADA, league: FRIENDS })).toEqual({
      ok: false,
      refusal: 'not-a-member',
    });
    expect(
      await exitLeague(db, {
        actor: CAI,
        league: leagueNo(999),
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    expect(await snapshot()).toEqual(before);
  });

  it('R-29: a league in another tournament does not count', async () => {
    // A legacy member of Club who plays no part in the tournament, but is in
    // the other tournament's public league: Club is their only league here.
    await client.query('delete from tournament_players where player_id = 3');
    await client.query('delete from league_members where player_id = 3');
    await savePlaying(db, OTHER, CAI);
    await saveLeagues(db, TOURNAMENT, [
      {
        league: privateLeague(CLUB, 'Klubas', ADA),
        members: [member(703, CLUB, CAI, false)],
      },
    ]);
    const before = await snapshot();
    expect(await exitLeague(db, { actor: CAI, league: CLUB })).toEqual({
      ok: false,
      refusal: 'only-league',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('a player with another league in the tournament may leave', async () => {
    await client.query(
      'insert into league_members (league_id, player_id) values (41, 3) on conflict do nothing',
    );
    expect(await exitLeague(db, { actor: CAI, league: CLUB })).toEqual({
      ok: true,
      value: { selected: null },
    });
  });
});

describe('removeLeague', () => {
  it("moves every selecting member to the public league and keeps their other tournaments' selections", async () => {
    await selectLeague(db, { player: BEN, league: CLUB });
    await selectLeague(db, { player: CAI, league: CLUB });
    const otherSelection = await selectionOf(2, OTHER.id);
    const publicLeague = await publicLeagueOf(TOURNAMENT.id);
    expect(await removeLeague(db, { actor: ADA, league: CLUB })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await selectionOf(2)).toBe(publicLeague);
    expect(await selectionOf(3)).toBe(publicLeague);
    expect(await selectionOf(1)).toBe(publicLeague);
    expect(await selectionOf(2, OTHER.id)).toBe(otherSelection);
    expect((await leagueRows()).map(({ id }) => id)).not.toContain(41);
  });

  it("leaves a member's selection of another league alone", async () => {
    await selectLeague(db, { player: CAI, league: FRIENDS });
    await removeLeague(db, { actor: ADA, league: CLUB });
    expect(await selectionOf(3)).toBe(42);
  });

  it("detaches the league's messages (league_id null) and cascades members and invites", async () => {
    await saveMessages(db, [
      { id: 1, league: CLUB, text: 'Sveiki', active: true },
      { id: 2, league: FRIENDS, text: 'Kita lyga', active: true },
    ]);
    await savePlayers(db, [testPlayer(player('4'), 'dan')]);
    await saveInvites(db, [
      {
        id: 9,
        league: CLUB,
        invitee: player('4'),
        invitedBy: ADA,
        createdAt: null,
      },
    ]);
    await removeLeague(db, { actor: ADA, league: CLUB });
    expect(
      await rowsOf(
        z.object({ id: z.int(), league_id: z.int().nullable() }),
        'select id, league_id from messages order by id',
      ),
    ).toEqual([
      { id: 1, league_id: null },
      { id: 2, league_id: 42 },
    ]);
    expect(
      await rowsOf(z.object({ id: z.int() }), 'select id from league_invites'),
    ).toEqual([]);
    expect((await memberships()).filter((row) => row.league_id === 41)).toEqual(
      [],
    );
  });

  it('is refused for a non-owner, a stranger, the public league and a league that is not there, and writes nothing', async () => {
    await selectLeague(db, { player: CAI, league: CLUB });
    const before = await snapshot();
    const publicLeague = leagueNo(await publicLeagueOf(TOURNAMENT.id));
    for (const attempt of [
      { actor: BEN, league: CLUB },
      { actor: CAI, league: CLUB },
      { actor: ADA, league: publicLeague },
    ]) {
      expect(await removeLeague(db, attempt)).toEqual({
        ok: false,
        refusal: 'not-owner',
      });
    }
    expect(
      await removeLeague(db, { actor: ADA, league: leagueNo(999) }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    expect(await snapshot()).toEqual(before);
  });
});

describe('handOverLeague', () => {
  it('makes the member owner and admin and keeps the old owner an admin (R-23, R-105)', async () => {
    expect(
      await handOverLeague(db, { actor: ADA, league: CLUB, to: BEN }),
    ).toEqual({ ok: true, value: undefined });
    expect((await leagueRows()).find(({ id }) => id === 41)?.owner_id).toBe(2);
    expect((await memberships()).filter((row) => row.league_id === 41)).toEqual(
      [
        { league_id: 41, player_id: 1, is_admin: true },
        { league_id: 41, player_id: 2, is_admin: true },
        { league_id: 41, player_id: 3, is_admin: false },
      ],
    );
  });

  it('after a hand-over the old owner may leave and the new owner may not', async () => {
    await handOverLeague(db, { actor: ADA, league: CLUB, to: BEN });
    expect(await exitLeague(db, { actor: BEN, league: CLUB })).toEqual({
      ok: false,
      refusal: 'owner',
    });
    expect(await exitLeague(db, { actor: ADA, league: CLUB })).toEqual({
      ok: true,
      value: { selected: null },
    });
  });

  it('refuses a non-owner, a non-member, the owner themselves and the public league, and writes nothing', async () => {
    const before = await snapshot();
    const publicLeague = leagueNo(await publicLeagueOf(TOURNAMENT.id));
    expect(
      await handOverLeague(db, { actor: BEN, league: CLUB, to: CAI }),
    ).toEqual({ ok: false, refusal: 'not-owner' });
    expect(
      await handOverLeague(db, { actor: BEN, league: FRIENDS, to: ADA }),
    ).toEqual({ ok: false, refusal: 'not-a-member' });
    expect(
      await handOverLeague(db, { actor: ADA, league: CLUB, to: ADA }),
    ).toEqual({ ok: false, refusal: 'already-owner' });
    expect(
      await handOverLeague(db, { actor: ADA, league: publicLeague, to: BEN }),
    ).toEqual({ ok: false, refusal: 'public' });
    expect(
      await handOverLeague(db, {
        actor: ADA,
        league: leagueNo(999),
        to: BEN,
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
    expect(await snapshot()).toEqual(before);
  });
});

describe('concurrent writers', () => {
  it('two concurrent switches and a delete leave every player selecting a league that exists', async () => {
    for (let round = 0; round < 6; round += 1) {
      await selectLeague(db, { player: BEN, league: FRIENDS });
      const answers = await Promise.all([
        selectLeague(db, { player: CAI, league: FRIENDS }),
        selectLeague(db, { player: BEN, league: FRIENDS }),
        removeLeague(db, { actor: BEN, league: FRIENDS }),
      ]);
      expect(answers[2]).toEqual({ ok: true, value: undefined });
      expect(
        await rowsOf(
          z.object({ player_id: z.int() }),
          `select tp.player_id from tournament_players tp left join leagues l on l.id = tp.selected_league_id where l.id is null`,
        ),
      ).toEqual([]);
      const publicLeague = await publicLeagueOf(TOURNAMENT.id);
      expect(await selectionOf(2)).toBe(publicLeague);
      await saveLeagues(db, TOURNAMENT, [
        {
          league: privateLeague(FRIENDS, 'Draugai', BEN),
          members: [
            member(704, FRIENDS, BEN, true),
            member(705, FRIENDS, CAI, false),
          ],
        },
      ]);
    }
  });

  it("the hub card's participant count follows the selection through leave and delete, the page's count is of members", async () => {
    // Cai is a guest in the public league and a full member of Club and Friends.
    const publicLeague = await publicLeagueOf(TOURNAMENT.id);
    await client.query(
      'update league_members set is_guest = true where player_id = 3 and league_id = $1',
      [publicLeague],
    );
    const counts = async () => {
      const [card] = await loadHub(db, {
        viewer: { player: null, isAdmin: false },
        now: NOW,
        rules: ruledRules,
      });
      const page = await loadTournamentPage(db, {
        slug: TOURNAMENT.slug,
        viewer: { player: null, isAdmin: false },
        now: NOW,
      });
      return {
        card: card?.guestPanels?.participants,
        page: page?.participants,
      };
    };
    expect(await counts()).toEqual({ card: 2, page: 3 });
    await selectLeague(db, { player: CAI, league: CLUB });
    expect(await counts()).toEqual({ card: 3, page: 3 });
    await exitLeague(db, { actor: CAI, league: CLUB });
    expect(await counts()).toEqual({ card: 2, page: 3 });
    await selectLeague(db, { player: CAI, league: FRIENDS });
    expect(await counts()).toEqual({ card: 3, page: 3 });
    await removeLeague(db, { actor: BEN, league: FRIENDS });
    expect(await counts()).toEqual({ card: 2, page: 2 });
  });
});
