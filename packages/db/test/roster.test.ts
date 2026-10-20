// LeagueRoster::visibleTo through loadRoster: each scope at each viewer
// level (#29, R-73).

import {
  type League,
  type LeagueMember,
  type PlayerId,
} from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayers } from '../src';
import { saveLeagueSelections, saveLeagues } from '../src/league/repository';
import { loadRoster, type RosterScope } from '../src/league/roster';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const DEE = player('4');
const EVA = player('5');
const FAY = player('6');
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

const member = (id: number, who: PlayerId, isGuest: boolean): LeagueMember => ({
  id,
  league: FRIENDS,
  player: who,
  isAdmin: false,
  isGuest,
  paid: null,
  joinedAt: null,
});

/**
 * Players 1 to 5 play the tournament, so the public league holds them all;
 * 5 (EVA) is a guest there. Friends' league: ADA full, BEN guest, DEE full,
 * EVA guest; ADA, BEN and EVA select it. CAI is switched off (R-7), DEE is
 * hidden by an admin (R-19, ruled). FAY plays no part.
 */
async function world(): Promise<void> {
  await saveWorld(db);
  await savePlayers(db, [
    testPlayer(DEE, 'dee'),
    testPlayer(EVA, 'eva'),
    testPlayer(FAY, 'fay'),
  ]);
  const status = (who: PlayerId) => ({
    player: who,
    switchedOff: who === CAI,
    adminHidden: who === DEE,
    fillIns: 0,
  });
  await saveTournamentPlayers(
    db,
    TOURNAMENT,
    [ADA, BEN, CAI, DEE, EVA].map(status),
  );
  await client.query(
    'update league_members set is_guest = true where player_id = $1',
    [EVA],
  );
  await saveLeagues(db, TOURNAMENT, [
    {
      league: friends,
      members: [
        member(901, ADA, false),
        member(902, BEN, true),
        member(903, DEE, false),
        member(904, EVA, true),
      ],
    },
  ]);
  await saveLeagueSelections(
    db,
    TOURNAMENT,
    new Map([
      [ADA, FRIENDS],
      [BEN, FRIENDS],
      [EVA, FRIENDS],
    ]),
  );
}

const roster = async (scope: RosterScope) =>
  [...(await loadRoster(db, TOURNAMENT, scope))].toSorted();

describe('loadRoster per scope', () => {
  beforeEach(() => world());

  it("'whole-tournament' is every listed player: neither switched off nor hidden", async () => {
    expect(await roster('whole-tournament')).toEqual([ADA, BEN, EVA]);
  });

  it("'public-league' is the public league at full-member level: its guests left out", async () => {
    expect(await roster('public-league')).toEqual([ADA, BEN]);
  });

  it('{ selectedBy } a full member sees their selected league full members only', async () => {
    expect(await roster({ selectedBy: ADA })).toEqual([ADA]);
  });

  it('{ selectedBy } a guest sees everyone of their selected league, listed', async () => {
    expect(await roster({ selectedBy: BEN })).toEqual([ADA, BEN, EVA]);
    expect(await roster({ selectedBy: EVA })).toEqual([ADA, BEN, EVA]);
  });

  it('{ selectedBy } leaves out the players of the tournament who are not in the league', async () => {
    // CAI selects the public league (full): the public league's players.
    expect(await roster({ selectedBy: CAI })).toEqual([ADA, BEN]);
  });

  it('{ selectedBy } a viewer who plays no part reads the public league at full-member level', async () => {
    expect(await roster({ selectedBy: FAY })).toEqual([ADA, BEN]);
  });
});

describe('loadRoster', () => {
  it('leaves out an admin-hidden member (R-19) and shows a switched-off one to no one (R-7)', async () => {
    await world();
    expect(await roster({ selectedBy: BEN })).not.toContain(DEE);
    expect(await roster({ selectedBy: BEN })).not.toContain(CAI);
  });

  it("'public-league' of a tournament nobody joined is empty", async () => {
    await saveWorld(db);
    expect(await roster('public-league')).toEqual([]);
    expect(await roster({ selectedBy: ADA })).toEqual([]);
  });
});
