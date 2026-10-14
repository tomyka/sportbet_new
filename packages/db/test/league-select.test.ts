// LeagueController::switchLeague (#29): the player's selection in the
// league's tournament moves to it; one selection per player and tournament.

import type { League, LeagueMember } from '@sportbet/domain';
import { at, leagueNo, tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { saveLeagues } from '../src/league/repository';
import { selectLeague } from '../src/league/select';
import { useTestDatabase } from '../src/testing';
import { saveTournament } from '../src/tournament/repository';
import { ADA, BEN, OTHER, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const FRIENDS = leagueNo(41);
const CLUB = leagueNo(42);
const ELSEWHERE = leagueNo(51);

const league = (
  id: typeof FRIENDS,
  name: string,
  tournament: number,
): League => ({
  id,
  tournament: tournamentKey(String(tournament)),
  name,
  description: null,
  kind: { public: false, owner: null },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
});

const friends = league(FRIENDS, 'Draugų lyga', TOURNAMENT.id);
const club = league(CLUB, 'Klubas', TOURNAMENT.id);
const elsewhere = league(ELSEWHERE, 'Kitas turnyras', OTHER.id);

const member = (id: number, of: League, who: typeof ADA): LeagueMember => ({
  id,
  league: of.id,
  player: who,
  isAdmin: false,
  isGuest: false,
  paid: null,
  joinedAt: null,
});

const selections = async () =>
  z
    .array(
      z.object({
        tournament_id: z.int(),
        player_id: z.int(),
        selected_league_id: z.int(),
      }),
    )
    .parse(
      (
        await client.query(
          'select tournament_id, player_id, selected_league_id from tournament_players order by tournament_id, player_id',
        )
      ).rows,
    );

/** ADA plays both tournaments, BEN the first; ADA is in every private league, BEN in none. */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await savePlaying(db, OTHER, ADA);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: friends,
      members: [member(701, friends, ADA)],
    },
    { league: club, members: [member(702, club, ADA)] },
  ]);
  await saveLeagues(db, OTHER, [
    { league: elsewhere, members: [member(703, elsewhere, ADA)] },
  ]);
});

describe('selectLeague', () => {
  it('moves the selection of the main tournament, and leaves the other one untouched (issue #63)', async () => {
    const before = await selections();
    expect(await selectLeague(db, { player: ADA, league: FRIENDS })).toEqual({
      ok: true,
      value: { tournament: tournamentKey(String(TOURNAMENT.id)) },
    });
    const after = await selections();
    expect(after).toEqual(
      before.map((row) =>
        row.tournament_id === TOURNAMENT.id && row.player_id === 1
          ? { ...row, selected_league_id: 41 }
          : row,
      ),
    );
  });

  it('refuses a player who is not a member, and changes nothing', async () => {
    const before = await selections();
    expect(await selectLeague(db, { player: BEN, league: FRIENDS })).toEqual({
      ok: false,
      refusal: 'not-a-member',
    });
    expect(await selections()).toEqual(before);
  });

  it('refuses a league that does not exist', async () => {
    expect(
      await selectLeague(db, { player: ADA, league: leagueNo(999) }),
    ).toEqual({ ok: false, refusal: 'not-a-member' });
  });

  it('moves the selection of the tournament the league belongs to', async () => {
    expect(await selectLeague(db, { player: ADA, league: ELSEWHERE })).toEqual({
      ok: true,
      value: { tournament: tournamentKey(String(OTHER.id)) },
    });
    const rows = await selections();
    expect(
      rows.find((row) => row.tournament_id === OTHER.id && row.player_id === 1)
        ?.selected_league_id,
    ).toBe(51);
    expect(
      rows.find(
        (row) => row.tournament_id === TOURNAMENT.id && row.player_id === 1,
      )?.selected_league_id,
    ).not.toBe(51);
  });

  it('switching back to the public league is a switch like any other', async () => {
    await selectLeague(db, { player: ADA, league: FRIENDS });
    const [publicLeague] = z
      .array(z.object({ id: z.int() }))
      .parse(
        (
          await client.query(
            'select id from leagues where tournament_id = $1 and is_public',
            [TOURNAMENT.id],
          )
        ).rows,
      );
    expect(publicLeague).toBeDefined();
    expect(
      (
        await selectLeague(db, {
          player: ADA,
          league: leagueNo(publicLeague?.id ?? 0),
        })
      ).ok,
    ).toBe(true);
  });

  it('two concurrent switches leave exactly one selection, and neither fails', async () => {
    const both = await Promise.all([
      selectLeague(db, { player: ADA, league: FRIENDS }),
      selectLeague(db, { player: ADA, league: CLUB }),
    ]);
    expect(both.every((result) => result.ok)).toBe(true);
    const rows = (await selections()).filter(
      (row) => row.tournament_id === TOURNAMENT.id && row.player_id === 1,
    );
    expect(rows).toHaveLength(1);
    expect([41, 42]).toContain(rows[0]?.selected_league_id);
  });
});
