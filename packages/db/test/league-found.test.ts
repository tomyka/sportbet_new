// foundLeague and editLeague (#29, R-105): a player founds a league and is its
// admin owner; an admin edits what the form edits, nothing else.

import type { League, LeagueEntry, LeagueMember } from '@sportbet/domain';
import { at, leagueNo, tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { editLeague, foundLeague } from '../src/league/found';
import { saveLeagues } from '../src/league/repository';
import { tournamentPlayers } from '../src/player/schema';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const FRIENDS = leagueNo(41);

const entry: LeagueEntry = {
  name: 'Naujoji lyga',
  description: 'Aprašymas',
  baseFee: 10,
  penaltyStep: 2,
  reward: 'Pyragas',
};

const friends: League = {
  id: FRIENDS,
  tournament: tournamentKey(String(TOURNAMENT.id)),
  name: 'Draugų lyga',
  description: 'Senas aprašymas',
  kind: { public: false, owner: ADA },
  fee: { base: 5, penaltyStep: 1, reward: 'Senas prizas' },
  payment: {
    beneficiary: 'Jonas Jonaitis',
    iban: 'LT121000011101001000',
    note: 'Pastaba',
  },
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

/** ADA and BEN play; ADA owns Friends and is its admin, BEN is a plain member. CAI plays nothing. */
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

const leagueRowsOf = async () =>
  z
    .array(
      z.object({
        id: z.int(),
        name: z.string(),
        description: z.string().nullable(),
        is_public: z.boolean(),
        owner_id: z.int().nullable(),
        base_fee: z.int().nullable(),
        penalty_step: z.int().nullable(),
        reward_description: z.string().nullable(),
        payment_beneficiary: z.string().nullable(),
        payment_iban: z.string().nullable(),
        payment_note: z.string().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select id, name, description, is_public, owner_id, base_fee, penalty_step, reward_description, payment_beneficiary, payment_iban, payment_note from leagues order by id',
        )
      ).rows,
    );

const membersOf = async (league: number) =>
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
          'select player_id, is_admin, is_guest from league_members where league_id = $1 order by player_id',
          [league],
        )
      ).rows,
    );

const selectionsOf = async () =>
  z
    .array(z.object({ player_id: z.int(), selected_league_id: z.int() }))
    .parse(
      (
        await client.query(
          'select player_id, selected_league_id from tournament_players order by player_id',
        )
      ).rows,
    );

describe('foundLeague', () => {
  it('a player founds a league and is its admin owner, not selected', async () => {
    const selectionsBefore = await selectionsOf();
    const founded = await foundLeague(db, {
      player: BEN,
      entry,
      tournament: TOURNAMENT,
    });
    expect(founded.ok).toBe(true);
    if (!founded.ok) return;
    const row = (await leagueRowsOf()).find(
      ({ id }) => id === Number(founded.value.league),
    );
    expect(row).toEqual({
      id: founded.value.league,
      name: 'Naujoji lyga',
      description: 'Aprašymas',
      is_public: false,
      owner_id: 2,
      base_fee: 10,
      penalty_step: 2,
      reward_description: 'Pyragas',
      payment_beneficiary: null,
      payment_iban: null,
      payment_note: null,
    });
    expect(await membersOf(founded.value.league)).toEqual([
      { player_id: 2, is_admin: true, is_guest: false },
    ]);
    expect(await selectionsOf()).toEqual(selectionsBefore);
  });

  it("checks the player's tournament under their status lock", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deleting = db.transaction(async (tx) => {
      await tx
        .delete(tournamentPlayers)
        .where(eq(tournamentPlayers.playerId, 1));
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const founding = foundLeague(db, {
      player: ADA,
      entry,
      tournament: TOURNAMENT,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await deleting;
    expect(await founding).toEqual({ ok: false, refusal: 'no-tournament' });
  });

  it('no tournament writes nothing', async () => {
    const before = await leagueRowsOf();
    expect(
      await foundLeague(db, { player: ADA, entry, tournament: null }),
    ).toEqual({ ok: false, refusal: 'no-tournament' });
    expect(await leagueRowsOf()).toEqual(before);
  });

  it('a player not in the tournament writes nothing', async () => {
    const before = await leagueRowsOf();
    expect(
      await foundLeague(db, { player: CAI, entry, tournament: TOURNAMENT }),
    ).toEqual({ ok: false, refusal: 'no-tournament' });
    expect(await leagueRowsOf()).toEqual(before);
  });
});

describe('editLeague', () => {
  const edit = {
    league: FRIENDS,
    entry: { ...entry, name: 'Pervadinta', reward: 'Kitas prizas' },
  };

  it('an admin edits name, description and fees; reward and payment details are untouched', async () => {
    expect(await editLeague(db, { ...edit, player: ADA })).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await leagueRowsOf()).find(({ id }) => id === 41)).toEqual({
      id: 41,
      name: 'Pervadinta',
      description: 'Aprašymas',
      is_public: false,
      owner_id: 1,
      base_fee: 10,
      penalty_step: 2,
      reward_description: 'Senas prizas',
      payment_beneficiary: 'Jonas Jonaitis',
      payment_iban: 'LT121000011101001000',
      payment_note: 'Pastaba',
    });
  });

  it('clears a description and a fee left blank', async () => {
    await editLeague(db, {
      ...edit,
      player: ADA,
      entry: { ...entry, description: null, baseFee: null, penaltyStep: null },
    });
    expect((await leagueRowsOf()).find(({ id }) => id === 41)).toMatchObject({
      description: null,
      base_fee: null,
      penalty_step: null,
    });
  });

  it('a refused edit writes nothing', async () => {
    const before = await leagueRowsOf();
    expect(await editLeague(db, { ...edit, player: BEN })).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
    expect(await editLeague(db, { ...edit, player: CAI })).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
    expect(await leagueRowsOf()).toEqual(before);
  });

  it('a league that is not there is refused', async () => {
    expect(
      await editLeague(db, { ...edit, league: leagueNo(999), player: ADA }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
  });

  it('a former owner who is an admin may edit (R-105)', async () => {
    await client.query('update leagues set owner_id = $1 where id = 41', [2]);
    expect(
      await editLeague(db, { ...edit, player: ADA }).then((r) => r.ok),
    ).toBe(true);
    expect((await leagueRowsOf()).find(({ id }) => id === 41)).toMatchObject({
      name: 'Pervadinta',
      owner_id: 2,
    });
  });
});
