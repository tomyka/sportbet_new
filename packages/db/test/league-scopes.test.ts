// R-73 ends (#29): the tables sportbet scopes to a league read its players
// through the viewer's roster; /leaderboard and the hub's panels stay
// tournament-wide; the tournament page shows the public league at
// full-member level.

import {
  ruledRules,
  type League,
  type LeagueMember,
  type PlayerId,
} from '@sportbet/domain';
import { at, leagueNo, tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadDashboard,
  loadGuestPanels,
  loadLeaderboard,
  loadLeagueTable,
  loadPointsChart,
  loadResultsSummary,
  loadStandingsSummary,
  loadSurvivalSummary,
  recalculateLocked,
} from '../src';
import { saveLeagueSelections, saveLeagues } from '../src/league/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db, client } = useTestDatabase();

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');
const dan = IDS.player('dan');

const AFTER = at('2026-06-21T08:00:00Z');
const FRIENDS = leagueNo(401);

const friends: League = {
  id: FRIENDS,
  tournament: tournamentKey(String(GOLDEN_EL.id)),
  name: 'Draugų lyga',
  description: null,
  kind: { public: false, owner: ada },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: null,
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

/** The golden players all sit in the public league; ada and cai (full) and ben (guest) also in "Draugų lyga", which all three select. dan selects the public league. */
async function friendsLeague(): Promise<void> {
  await saveLeagues(db, GOLDEN_EL, [
    {
      league: friends,
      members: [
        member(701, ada, false),
        member(702, ben, true),
        member(703, cai, false),
      ],
    },
  ]);
  await saveLeagueSelections(
    db,
    GOLDEN_EL,
    new Map([
      [ada, FRIENDS],
      [ben, FRIENDS],
      [cai, FRIENDS],
    ]),
  );
}

beforeEach(async () => {
  await saveGolden(db);
  const refusal = await recalculateLocked(db, GOLDEN_EL, ruledRules);
  if (refusal !== null)
    throw new Error(`the golden world is refused: ${refusal}`);
});

const usernames = (rows: readonly { readonly username: string }[]) =>
  rows.map(({ username }) => username).toSorted();

const dashboardOf = (who: PlayerId) =>
  loadDashboard(db, {
    player: who,
    tournament: GOLDEN_EL,
    now: AFTER,
    rules: ruledRules,
  });

describe('the game page reads the viewer league (R-73)', () => {
  it("a full member's table leaves out a guest member and the players outside the league", async () => {
    await friendsLeague();
    expect(usernames((await dashboardOf(ada)).table.rows)).toEqual([
      'ada',
      'cai',
    ]);
  });

  it("a guest member's table has every member, the guest too", async () => {
    await friendsLeague();
    const dashboard = await dashboardOf(ben);
    expect(usernames(dashboard.table.rows)).toEqual(['ada', 'ben', 'cai']);
    expect(dashboard.me?.row).toMatchObject({ player: ben });
  });

  it('the activity feed names only the roster', async () => {
    await friendsLeague();
    const feed = (await dashboardOf(ada)).feed;
    const named = feed.runs.map(({ username }) => username);
    expect(named).not.toContain('ben');
    expect(named).not.toContain('dan');
    expect(feed.runs.length).toBeGreaterThan(0);
  });

  it('a viewer who selects the public league sees it whole, as before leagues', async () => {
    await friendsLeague();
    expect(usernames((await dashboardOf(dan)).table.rows)).toEqual([
      'ada',
      'ben',
      'cai',
      'dan',
    ]);
  });
});

describe('the summaries read the viewer league', () => {
  const input = (viewer: PlayerId) => ({
    viewer,
    tournament: GOLDEN_EL,
    now: AFTER,
    rules: ruledRules,
  });

  it('chart lines and the results columns are the viewer roster, in table order', async () => {
    await friendsLeague();
    expect(usernames((await loadPointsChart(db, input(ada))).lines)).toEqual([
      'ada',
      'cai',
    ]);
    expect(usernames((await loadPointsChart(db, input(ben))).lines)).toEqual([
      'ada',
      'ben',
      'cai',
    ]);
    expect(
      [
        ...(
          await loadResultsSummary(db, input(ada))
        ).summary.totalTenths.keys(),
      ].toSorted(),
    ).toEqual([ada, cai]);
  });

  it('standings and survival summaries follow the same roster', async () => {
    await friendsLeague();
    const standings = await loadStandingsSummary(db, input(ada));
    const names = new Set(
      standings.teams.flatMap((team) => [...team.cells.keys()]),
    );
    expect(names.has(ben)).toBe(false);
    expect(names.has(dan)).toBe(false);
    const survival = await loadSurvivalSummary(db, {
      player: ada,
      tournament: GOLDEN_EL,
      now: AFTER,
      rules: ruledRules,
    });
    const shown = survival.summary.rows.map(({ player }) => player);
    expect(shown).not.toContain(ben);
    expect(shown).not.toContain(dan);
  });
});

describe('what leagues do not change', () => {
  it('/leaderboard and the hub panels are tournament-wide', async () => {
    const board = await loadLeaderboard(db, ruledRules);
    const panels = await loadGuestPanels(db, GOLDEN_EL, ruledRules);
    await friendsLeague();
    expect(await loadLeaderboard(db, ruledRules)).toEqual(board);
    expect(await loadGuestPanels(db, GOLDEN_EL, ruledRules)).toEqual({
      ...panels,
      // the card counts full members by their selected league: ben, a guest in
      // the league selected, is out; ada, cai and dan stay.
      participants: 3,
    });
  });

  it('the tournament page leaves guests of the public league out for everyone', async () => {
    await client.query(
      'update league_members set is_guest = true where player_id = $1',
      [ben],
    );
    expect(
      usernames((await loadLeagueTable(db, GOLDEN_EL, ruledRules)).rows),
    ).toEqual(['ada', 'cai', 'dan']);
  });

  it('the tournament page ignores private leagues', async () => {
    await friendsLeague();
    expect(
      usernames((await loadLeagueTable(db, GOLDEN_EL, ruledRules)).rows),
    ).toEqual(['ada', 'ben', 'cai', 'dan']);
  });
});
