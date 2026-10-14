// sendLeagueInvite, joinFromInvite and dropLeagueInvite (#29, R-20): who may be
// invited, what accepting writes, and that a refusal writes nothing.

import type { League, LeagueMember } from '@sportbet/domain';
import { at, leagueNo, player, tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  dropLeagueInvite,
  joinFromInvite,
  sendLeagueInvite,
} from '../src/league/invite';
import { saveInvites, saveLeagues } from '../src/league/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const FRIENDS = leagueNo(41);

const friends: League = {
  id: FRIENDS,
  tournament: tournamentKey(String(TOURNAMENT.id)),
  name: 'Draugų lyga',
  description: null,
  kind: { public: false, owner: ADA },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
};

const member = (
  id: number,
  who: typeof ADA,
  isAdmin: boolean,
): LeagueMember => ({
  id,
  league: FRIENDS,
  player: who,
  isAdmin,
  isGuest: false,
  paid: null,
  joinedAt: null,
});

/** ADA (admin owner) and BEN play and are in Friends (BEN a plain member); CAI is an account that plays nothing. */
beforeEach(async () => {
  await saveWorld(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: friends,
      members: [member(701, ADA, true), member(702, BEN, false)],
    },
  ]);
});

const invitesOf = async () =>
  z
    .array(
      z.object({
        id: z.int(),
        league_id: z.int(),
        invitee_id: z.int(),
        invited_by_id: z.int().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select id, league_id, invitee_id, invited_by_id from league_invites order by id',
        )
      ).rows,
    );

const membersOf = async () =>
  z
    .array(
      z.object({
        player_id: z.int(),
        is_admin: z.boolean(),
        is_guest: z.boolean(),
      }),
    )
    .parse(
      (
        await client.query(
          'select player_id, is_admin, is_guest from league_members where league_id = 41 order by player_id',
        )
      ).rows,
    );

const selectionOf = async (who: number) =>
  z
    .array(z.object({ selected_league_id: z.int() }))
    .parse(
      (
        await client.query(
          'select selected_league_id from tournament_players where player_id = $1 and tournament_id = $2',
          [who, TOURNAMENT.id],
        )
      ).rows,
    )[0]?.selected_league_id;

const send = (invitee: typeof ADA, actor = ADA) =>
  sendLeagueInvite(db, { actor, league: FRIENDS, invitee });

describe('sendLeagueInvite', () => {
  it('an admin invites a tournament player', async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    expect(await send(CAI)).toEqual({ ok: true, value: undefined });
    expect(await invitesOf()).toEqual([
      expect.objectContaining({
        league_id: 41,
        invitee_id: 3,
        invited_by_id: 1,
      }),
    ]);
  });

  it('a non-tournament player is refused (R-20) and no invite is written', async () => {
    expect(await send(CAI)).toEqual({
      ok: false,
      refusal: 'not-in-tournament',
    });
    expect(await invitesOf()).toEqual([]);
  });

  it('an unknown player id is refused the same way', async () => {
    expect(await send(player('999'))).toEqual({
      ok: false,
      refusal: 'not-in-tournament',
    });
    expect(await invitesOf()).toEqual([]);
  });

  it('an existing member is refused', async () => {
    expect(await send(BEN)).toEqual({
      ok: false,
      refusal: 'already-member-or-invited',
    });
  });

  it('a pending invitee and a second invite are refused', async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    expect(await send(CAI)).toMatchObject({ ok: true });
    expect(await send(CAI)).toEqual({
      ok: false,
      refusal: 'already-member-or-invited',
    });
    expect(await invitesOf()).toHaveLength(1);
  });

  it('two concurrent invites to one player write one', async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    const answers = await Promise.all([send(CAI), send(CAI)]);
    expect(answers.filter(({ ok }) => ok)).toHaveLength(1);
    expect(answers.find(({ ok }) => !ok)).toEqual({
      ok: false,
      refusal: 'already-member-or-invited',
    });
    expect(await invitesOf()).toHaveLength(1);
  });

  it('a non-admin member and a stranger are refused before anything else', async () => {
    expect(await send(CAI, BEN)).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
    expect(await send(CAI, CAI)).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
  });

  it('a league that is not there is refused', async () => {
    expect(
      await sendLeagueInvite(db, {
        actor: ADA,
        league: leagueNo(999),
        invitee: BEN,
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
  });
});

describe('joinFromInvite', () => {
  beforeEach(async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    await sendLeagueInvite(db, { actor: ADA, league: FRIENDS, invitee: CAI });
  });

  it('accept makes a plain unselected member and deletes the invite', async () => {
    const [invite] = await invitesOf();
    const selectedBefore = await selectionOf(3);
    expect(
      await joinFromInvite(db, { actor: CAI, invite: invite?.id ?? 0 }),
    ).toEqual({ ok: true, value: { league: FRIENDS } });
    expect(await membersOf()).toContainEqual({
      player_id: 3,
      is_admin: false,
      is_guest: false,
    });
    expect(await invitesOf()).toEqual([]);
    expect(await selectionOf(3)).toBe(selectedBefore);
  });

  it('accept for a player no longer in the tournament leaves the invite pending (R-20)', async () => {
    await client.query(
      'delete from tournament_players where player_id = 3 and tournament_id = $1',
      [TOURNAMENT.id],
    );
    const before = await invitesOf();
    expect(
      await joinFromInvite(db, { actor: CAI, invite: before[0]?.id ?? 0 }),
    ).toEqual({ ok: false, refusal: 'not-in-tournament' });
    expect(await invitesOf()).toEqual(before);
    expect((await membersOf()).map(({ player_id }) => player_id)).toEqual([
      1, 2,
    ]);
  });

  it("accept of another player's invite is not found", async () => {
    const before = await invitesOf();
    expect(
      await joinFromInvite(db, { actor: BEN, invite: before[0]?.id ?? 0 }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
    expect(await invitesOf()).toEqual(before);
  });

  it('accept of an invite that is not there is not found', async () => {
    expect(await joinFromInvite(db, { actor: CAI, invite: 9999 })).toEqual({
      ok: false,
      refusal: 'not-your-invite',
    });
  });

  it('a second accept is not found', async () => {
    const [invite] = await invitesOf();
    await joinFromInvite(db, { actor: CAI, invite: invite?.id ?? 0 });
    expect(
      await joinFromInvite(db, { actor: CAI, invite: invite?.id ?? 0 }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
  });

  it('the invite is valid after the player joins the tournament (issue 288)', async () => {
    await client.query('delete from league_invites');
    await client.query(
      'delete from tournament_players where player_id = 3 and tournament_id = $1',
      [TOURNAMENT.id],
    );
    await saveInvites(db, [
      {
        id: 50,
        league: FRIENDS,
        invitee: CAI,
        invitedBy: ADA,
        createdAt: null,
      },
    ]);
    expect(await joinFromInvite(db, { actor: CAI, invite: 50 })).toMatchObject({
      ok: false,
      refusal: 'not-in-tournament',
    });
    await savePlaying(db, TOURNAMENT, CAI);
    expect(await joinFromInvite(db, { actor: CAI, invite: 50 })).toEqual({
      ok: true,
      value: { league: FRIENDS },
    });
    expect(await invitesOf()).toEqual([]);
  });
});

describe('dropLeagueInvite', () => {
  beforeEach(async () => {
    await savePlaying(db, TOURNAMENT, CAI);
    await sendLeagueInvite(db, { actor: ADA, league: FRIENDS, invitee: CAI });
  });

  it('decline deletes it; a second decline is not found', async () => {
    const [invite] = await invitesOf();
    expect(
      await dropLeagueInvite(db, { actor: CAI, invite: invite?.id ?? 0 }),
    ).toEqual({ ok: true, value: undefined });
    expect(await invitesOf()).toEqual([]);
    expect(
      await dropLeagueInvite(db, { actor: CAI, invite: invite?.id ?? 0 }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
  });

  it("decline of another player's invite is not found and deletes nothing", async () => {
    const before = await invitesOf();
    expect(
      await dropLeagueInvite(db, { actor: BEN, invite: before[0]?.id ?? 0 }),
    ).toEqual({ ok: false, refusal: 'not-your-invite' });
    expect(await invitesOf()).toEqual(before);
  });
});
