// loadLeaguesPage (#29): what /leagues lists for a player - their leagues in
// the tournament, who is in the ones they administer, and their invites.

import type { League, LeagueMember, PlayerId } from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayers } from '../src';
import { loadLeaguesPage } from '../src/league/page';
import { saveInvites, saveLeagues } from '../src/league/repository';
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
const ELSEWHERE = leagueNo(51);
const DAN = player('4');

const privateLeague = (
  id: typeof CLUB,
  name: string,
  owner: PlayerId,
  tournament: number,
): League => ({
  id,
  tournament: tournamentKey(String(tournament)),
  name,
  description: `Apie ${name}`,
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

const viewerOf = (who: PlayerId) => ({ player: who, tournament: TOURNAMENT });

/**
 * ADA, BEN, CAI play the tournament; ADA and BEN play the other one. Club
 * (41): ADA owns it, BEN and CAI are in it, DAN is invited. Friends (42): BEN
 * owns it, ADA is in it. Elsewhere (51, other tournament): BEN owns it, ADA is
 * in it, CAI is invited. CAI is invited to Friends by BEN.
 */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await savePlaying(db, OTHER, ADA, BEN);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: privateLeague(CLUB, 'Klubas', ADA, TOURNAMENT.id),
      members: [
        member(701, CLUB, ADA, true),
        member(702, CLUB, BEN, false),
        member(703, CLUB, CAI, false),
      ],
    },
    {
      league: privateLeague(FRIENDS, 'Draugai', BEN, TOURNAMENT.id),
      members: [
        member(704, FRIENDS, BEN, true),
        member(705, FRIENDS, ADA, false),
      ],
    },
  ]);
  await saveLeagues(db, OTHER, [
    {
      league: privateLeague(ELSEWHERE, 'Kitur', BEN, OTHER.id),
      members: [
        member(706, ELSEWHERE, BEN, true),
        member(707, ELSEWHERE, ADA, false),
      ],
    },
  ]);
  await saveInvites(db, [
    { id: 1, league: CLUB, invitee: DAN, invitedBy: ADA, createdAt: null },
    { id: 2, league: ELSEWHERE, invitee: CAI, invitedBy: BEN, createdAt: null },
    { id: 3, league: FRIENDS, invitee: CAI, invitedBy: BEN, createdAt: null },
  ]);
});

describe('loadLeaguesPage', () => {
  it("lists only this tournament's leagues, with the public one, by membership", async () => {
    const page = await loadLeaguesPage(db, viewerOf(ADA));
    expect(page.mine.map(({ name }) => name)).toEqual([
      'Euroleague 2026/27',
      'Klubas',
      'Draugai',
    ]);
  });

  it('counts every member and carries the description, ownership and what the viewer may do', async () => {
    const page = await loadLeaguesPage(db, viewerOf(ADA));
    const club = page.mine.find(({ id }) => id === CLUB);
    expect(club).toMatchObject({
      memberCount: 3,
      description: 'Apie Klubas',
      isOwner: true,
      isPublic: false,
      may: {
        switch: true,
        invite: true,
        edit: true,
        delete: true,
        leave: false,
      },
    });
    expect(page.mine.find(({ id }) => id === FRIENDS)).toMatchObject({
      memberCount: 2,
      isOwner: false,
      may: {
        switch: true,
        invite: false,
        edit: false,
        delete: false,
        leave: true,
      },
    });
  });

  it('a stored fee reaches the card', async () => {
    await client.query(
      'update leagues set base_fee = 10, penalty_step = 2 where id = 41',
    );
    const page = await loadLeaguesPage(db, viewerOf(ADA));
    expect(
      page.mine.map(({ baseFee, penaltyStep }) => [baseFee, penaltyStep]),
    ).toEqual([
      [null, null],
      [10, 2],
      [null, null],
    ]);
  });

  it('lists pending invites of every tournament, by invite id', async () => {
    const page = await loadLeaguesPage(db, viewerOf(CAI));
    expect(page.invites).toEqual([
      { id: 2, leagueName: 'Kitur', invitedBy: 'ben' },
      { id: 3, leagueName: 'Draugai', invitedBy: 'ben' },
    ]);
  });

  it('an exited tournament shows invites and no leagues', async () => {
    const page = await loadLeaguesPage(db, { player: CAI, tournament: null });
    expect(page.mine).toEqual([]);
    expect(page.invites).toHaveLength(2);
  });

  it('shows an inviter whose account is gone as -', async () => {
    await saveInvites(db, [
      { id: 4, league: CLUB, invitee: BEN, invitedBy: null, createdAt: null },
    ]);
    const page = await loadLeaguesPage(db, viewerOf(BEN));
    expect(page.invites).toEqual([
      { id: 4, leagueName: 'Klubas', invitedBy: '-' },
    ]);
  });

  it('member names are read only for administered leagues', async () => {
    const page = await loadLeaguesPage(db, viewerOf(ADA));
    expect(page.mine.find(({ id }) => id === CLUB)?.people).toEqual({
      members: [
        { player: ADA, display: 'ada', username: 'ada', isAdmin: true },
        { player: BEN, display: 'ben', username: 'ben', isAdmin: false },
        { player: CAI, display: 'cai', username: 'cai', isAdmin: false },
      ],
      pending: [{ display: 'dan', username: 'dan' }],
    });
    expect(page.mine.find(({ id }) => id === FRIENDS)?.people).toBeNull();
    expect(page.mine.find(({ isPublic }) => isPublic)?.people).toBeNull();
  });

  it('names a member by name and surname', async () => {
    await savePlayers(db, [
      { ...testPlayer(CAI, 'cai'), name: 'Šarūnas', surname: 'Kazlauskas' },
    ]);
    const page = await loadLeaguesPage(db, viewerOf(ADA));
    expect(
      page.mine
        .find(({ id }) => id === CLUB)
        ?.people?.members.map(({ display }) => display),
    ).toContain('Šarūnas Kazlauskas');
  });

  it('the selected league is marked', async () => {
    const before = await loadLeaguesPage(db, viewerOf(ADA));
    expect(before.mine.map(({ selected }) => selected)).toEqual([
      true,
      false,
      false,
    ]);
    await selectLeague(db, { player: ADA, league: CLUB });
    const page = await loadLeaguesPage(db, viewerOf(ADA));
    expect(page.mine.map(({ id, selected }) => [Number(id), selected])).toEqual(
      expect.arrayContaining([
        [41, true],
        [42, false],
      ]),
    );
    expect(page.mine.filter(({ selected }) => selected)).toHaveLength(1);
    expect(page.mine.find(({ id }) => id === CLUB)?.may.switch).toBe(false);
  });

  it('a player in no league of the tournament has an empty list', async () => {
    const page = await loadLeaguesPage(db, viewerOf(DAN));
    expect(page).toEqual({
      mine: [],
      invites: [{ id: 1, leagueName: 'Klubas', invitedBy: 'ada' }],
    });
  });
});
