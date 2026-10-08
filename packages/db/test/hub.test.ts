// TournamentController::hub, show and registerForm's data: which
// tournaments a viewer sees, in which group and order, with which button
// and widgets; a guest's top 5, medal count and stats (PlayerTotals,
// MedalTally); the page's header; the form's step.

import {
  Game,
  MatchPrediction,
  ruledRules,
  sportbetRules,
  StandingsPrediction,
  type TournamentProfile,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  teamPick,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  findVisibleTournament,
  loadGuestPanels,
  loadHub,
  loadRegistrationForm,
  loadTournamentPage,
  recalculateLocked,
  savePlayers,
  saveTournamentProfile,
  type GuestPanels,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames } from '../src/season/repository';
import { saveStandingsPredictions } from '../src/standings/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G10,
  G7,
  G8,
  G9,
  OLY,
  OTHER,
  REA,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db } = useTestDatabase();

/** After game 7 (scored), before the locked game 10 and the postponed game 9; G11 and G12 to come. */
const NOW = at('2026-10-05T12:00:00Z');

const GUEST = { player: null, isAdmin: false } as const;
const ADA_SIGNED_IN = { player: ADA, isAdmin: false } as const;
const DAN = player('4');
const DAN_SIGNED_IN = { player: DAN, isAdmin: false } as const;
const ADMIN = { player: DAN, isAdmin: true } as const;

const ACTIVE: TournamentProfile = {
  status: 'active',
  startsOn: '2026-09-30',
  sport: 'basketball',
  description: 'Eurolygos sezonas',
  isPublic: true,
};

/** A round-1 game still to come: one game per round and pair of teams (D16(c)). */
const future = (
  id: number,
  home: typeof OLY,
  away: typeof OLY,
  tipOff: string,
) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      home,
      away,
      tipOff: at(tipOff),
      result: null,
      recordedWinner: null,
      lockedSince: null,
      postponed: false,
    }),
  );

const G11 = future(11, OLY, REA, '2026-10-12T18:00:00Z');
const G12 = future(12, FEN, ZAL, '2026-10-14T18:00:00Z');
const G13 = future(13, OLY, FEN, '2026-10-20T18:00:00Z');
const G14 = future(14, FEN, REA, '2026-10-22T18:00:00Z');

const prediction = (who: typeof ADA, home: number, away: number) =>
  unwrap(
    MatchPrediction.stored({
      player: who,
      game: G7.id,
      home,
      away,
      origin: 'real',
      filledInAt: null,
    }),
  );

/**
 * TOURNAMENT (3) active with games 7 to 14 and ada, ben and cai in it;
 * OTHER (4) upcoming, starting 2027-10-01, with no games; dan in nothing.
 */
async function hub(): Promise<void> {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10, G11, G12, G13, G14]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await saveTournamentProfile(db, TOURNAMENT, ACTIVE);
  await saveTournamentProfile(db, OTHER, {
    ...ACTIVE,
    status: 'upcoming',
    startsOn: '2027-10-01',
    description: null,
  });
}

describe('loadHub: who sees what, in which group and order', () => {
  it('hub: lists active before upcoming, each with its profile and group', async () => {
    await hub();
    const cards = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    expect(
      cards.map(({ tournament, group }) => [tournament.id, group]),
    ).toEqual([
      [TOURNAMENT.id, 'active'],
      [OTHER.id, 'upcoming'],
    ]);
    expect(cards[0]?.profile).toEqual(ACTIVE);
  });

  it('hub (sportbet): an admin marking a tournament finished moves it to finished; (ruled, R-55) it stays where R-21 has it', async () => {
    await hub();
    await saveTournamentProfile(db, TOURNAMENT, {
      ...ACTIVE,
      status: 'finished',
    });
    const group = async (rules: typeof ruledRules) =>
      (await loadHub(db, { viewer: GUEST, now: NOW, rules: rules })).find(
        ({ tournament }) => tournament.id === TOURNAMENT.id,
      )?.group;
    expect(await group(sportbetRules)).toBe('finished');
    expect(await group(ruledRules)).toBe('active');
  });

  it('hub (ruled, R-50): a non-public tournament is left out for a guest and a player not in it, and shown to its players and to an admin', async () => {
    await hub();
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    const ids = async (viewer: Parameters<typeof loadHub>[1]['viewer']) =>
      (await loadHub(db, { viewer, now: NOW, rules: ruledRules })).map(
        ({ tournament }) => tournament.id,
      );
    expect(await ids(GUEST)).toEqual([OTHER.id]);
    expect(await ids(DAN_SIGNED_IN)).toEqual([OTHER.id]);
    expect(await ids(ADA_SIGNED_IN)).toEqual([TOURNAMENT.id, OTHER.id]);
    expect(await ids(ADMIN)).toEqual([TOURNAMENT.id, OTHER.id]);
  });

  it('hub (sportbet): a non-public tournament is listed for everyone', async () => {
    await hub();
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    expect(
      await loadHub(db, { viewer: GUEST, now: NOW, rules: sportbetRules }),
    ).toHaveLength(2);
  });
});

describe("loadHub: each card's button", () => {
  it('hub: a player in it plays; a signed-in player not in it registers while it is open; a guest gets nothing', async () => {
    await hub();
    const action = async (viewer: Parameters<typeof loadHub>[1]['viewer']) =>
      (await loadHub(db, { viewer, now: NOW, rules: ruledRules })).map(
        ({ action }) => action,
      );
    // Ada plays 3; 4 (no games) is open to her too.
    expect(await action(ADA_SIGNED_IN)).toEqual(['play', 'register']);
    // R-8: 3 is open until its round-5 deadline (none here), 4 too.
    expect(await action(DAN_SIGNED_IN)).toEqual(['register', 'register']);
    expect(await action(GUEST)).toEqual([null, null]);
  });

  it('hub (sportbet): registration closed at the first game offers no registration on the active card', async () => {
    await hub();
    const cards = await loadHub(db, {
      viewer: DAN_SIGNED_IN,
      now: NOW,
      rules: sportbetRules,
    });
    expect(cards.map(({ action }) => action)).toEqual([null, 'register']);
  });
});

describe("loadHub: each card's widgets", () => {
  it("hub: a guest's active card lists the next three games open for predictions - not the scored, locked or postponed ones - by tip-off", async () => {
    await hub();
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    expect(active?.upcomingGames.map(({ id }) => id)).toEqual([11, 12, 13]);
    expect(active?.upcomingGames[0]).toEqual({
      id: 11,
      tipOff: at('2026-10-12T18:00:00Z'),
      home: 'Olympiacos',
      away: 'Real',
    });
    expect(active?.howItWorks).toBe(false);
  });

  it("hub: a player's active card has no widgets; an upcoming card explains the game", async () => {
    await hub();
    const [active, upcoming] = await loadHub(db, {
      viewer: ADA_SIGNED_IN,
      now: NOW,
      rules: ruledRules,
    });
    expect(active?.upcomingGames).toEqual([]);
    expect(active?.guestPanels).toBeNull();
    expect(upcoming?.howItWorks).toBe(true);
    expect(upcoming?.upcomingGames).toEqual([]);
  });

  it("hub: a guest's top 5 is the listed players with a points row, by the rule set's Lyderiai order, with the stats", async () => {
    await hub();
    await savePlayers(db, [testPlayer(player('5'), 'eve')]);
    await savePlaying(db, TOURNAMENT, player('5'));
    await saveMatchPredictions(db, TOURNAMENT, [
      prediction(ADA, 88, 79),
      prediction(BEN, 80, 70),
      prediction(CAI, 70, 80),
    ]);
    const refusal = await recalculateLocked(db, TOURNAMENT, ruledRules);
    expect(refusal).toBeNull();
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    // eve has no points row: PlayerTotals' inner join leaves her out.
    expect(
      active?.guestPanels?.leaders.map(({ username }) => username),
    ).toEqual(['ada', 'ben', 'cai']);
    expect(active?.guestPanels?.leaders.map(({ rank }) => rank)).toEqual([
      1, 2, 3,
    ]);
    expect(active?.guestPanels?.participants).toBe(4);
    expect(active?.guestPanels?.predictions).toBe(3);
  });

  it('hub: loadGuestPanels is the guest panels loadHub draws, as plain data a cache can hold', async () => {
    await hub();
    await saveMatchPredictions(db, TOURNAMENT, [
      prediction(ADA, 88, 79),
      prediction(BEN, 80, 70),
    ]);
    expect(await recalculateLocked(db, TOURNAMENT, ruledRules)).toBeNull();
    const panels = await loadGuestPanels(db, TOURNAMENT, ruledRules);
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    expect(active?.guestPanels).toEqual(panels);
    expect(JSON.parse(JSON.stringify(panels))).toEqual(panels);
  });

  it('hub: a guest-panels reader passed in (a cached one) is the one loadHub asks, per active card', async () => {
    await hub();
    const asked: number[] = [];
    const cached: GuestPanels = {
      leaders: [{ rank: 1, username: 'cached', totalCents: 100 }],
      medals: [],
      participants: 9,
      predictions: 9,
    };
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
      guestPanelsOf: (tournament) => {
        asked.push(tournament.id);
        return Promise.resolve(cached);
      },
    });
    expect(active?.guestPanels).toEqual(cached);
    expect(asked).toEqual([TOURNAMENT.id]);
  });

  it('hub: a switched-off player is not listed in the top 5 (RA-4, R-7)', async () => {
    await hub();
    await saveMatchPredictions(db, TOURNAMENT, [
      prediction(ADA, 88, 79),
      prediction(BEN, 80, 70),
    ]);
    expect(await recalculateLocked(db, TOURNAMENT, ruledRules)).toBeNull();
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 20 },
    ]);
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    expect(
      active?.guestPanels?.leaders.map(({ username }) => username),
    ).toEqual(['ben']);
  });

  it("hub: the medal count counts the listed players' final places by team", async () => {
    await hub();
    await saveStandingsPredictions(db, TOURNAMENT, [
      unwrap(
        StandingsPrediction.stored(ADA, [
          teamPick('12', { finalPlace: 1 }),
          teamPick('13', { finalPlace: 2 }),
        ]),
      ),
      unwrap(
        StandingsPrediction.stored(BEN, [
          teamPick('12', { finalPlace: 2 }),
          teamPick('13', { finalPlace: 1 }),
        ]),
      ),
      unwrap(
        StandingsPrediction.stored(CAI, [teamPick('13', { finalPlace: 1 })]),
      ),
    ]);
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    expect(active?.guestPanels?.medals).toEqual([
      { team: 'Real', first: 2, second: 1, third: 0, fourth: 0 },
      { team: 'Olympiacos', first: 1, second: 1, third: 0, fourth: 0 },
    ]);
  });

  it('hub: a tournament with nobody scored has no leaders, no medals and no predictions counted', async () => {
    await hub();
    const [active] = await loadHub(db, {
      viewer: GUEST,
      now: NOW,
      rules: ruledRules,
    });
    expect(active?.guestPanels).toEqual({
      leaders: [],
      medals: [],
      participants: 3,
      predictions: 0,
    });
  });
});

describe("loadTournamentPage: show's header", () => {
  it('tournament page: its profile, its players counted, and the button for the viewer', async () => {
    await hub();
    const page = await loadTournamentPage(db, {
      slug: TOURNAMENT.slug,
      viewer: DAN_SIGNED_IN,
      now: NOW,
      rules: ruledRules,
    });
    expect(page).toEqual({
      tournament: TOURNAMENT,
      profile: ACTIVE,
      finished: false,
      participants: 3,
      action: 'register',
    });
    expect(
      (
        await loadTournamentPage(db, {
          slug: TOURNAMENT.slug,
          viewer: GUEST,
          now: NOW,
          rules: ruledRules,
        })
      )?.action,
    ).toBe('sign-in');
    expect(
      (
        await loadTournamentPage(db, {
          slug: TOURNAMENT.slug,
          viewer: ADA_SIGNED_IN,
          now: NOW,
          rules: ruledRules,
        })
      )?.action,
    ).toBe('create-league');
  });

  it('tournament page: an unknown slug, and (R-50) a non-public tournament for a guest, are not found', async () => {
    await hub();
    expect(
      await loadTournamentPage(db, {
        slug: 'no-such',
        viewer: GUEST,
        now: NOW,
        rules: ruledRules,
      }),
    ).toBeNull();
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    expect(
      await loadTournamentPage(db, {
        slug: TOURNAMENT.slug,
        viewer: GUEST,
        now: NOW,
        rules: ruledRules,
      }),
    ).toBeNull();
    expect(
      await loadTournamentPage(db, {
        slug: TOURNAMENT.slug,
        viewer: ADA_SIGNED_IN,
        now: NOW,
        rules: ruledRules,
      }),
    ).not.toBeNull();
  });
});

describe('loadRegistrationForm: registerForm, R-53, R-54', () => {
  it('registration form: a player not in it gets the form, with the games and teams counted and the closing moment', async () => {
    await hub();
    expect(
      await loadRegistrationForm(db, {
        slug: TOURNAMENT.slug,
        viewer: DAN_SIGNED_IN,
        now: NOW,
        rules: sportbetRules,
      }),
    ).toEqual({ step: 'closed' });
    const form = await loadRegistrationForm(db, {
      slug: TOURNAMENT.slug,
      viewer: DAN_SIGNED_IN,
      now: NOW,
      rules: ruledRules,
    });
    expect(form).toEqual({
      step: 'open',
      tournament: TOURNAMENT,
      profile: ACTIVE,
      games: 8,
      teams: 4,
      // R-8: no game in round 5 or later, so no closing moment (decision 13).
      closesAt: null,
    });
  });

  it('registration form (R-53): a player in it is taken in, before and after registration closes', async () => {
    await hub();
    for (const rules of [sportbetRules, ruledRules]) {
      expect(
        await loadRegistrationForm(db, {
          slug: TOURNAMENT.slug,
          viewer: ADA_SIGNED_IN,
          now: NOW,
          rules: rules,
        }),
      ).toEqual({ step: 'member' });
    }
  });

  it('registration form: an unknown slug is not found', async () => {
    await hub();
    expect(
      await loadRegistrationForm(db, {
        slug: 'no-such',
        viewer: DAN_SIGNED_IN,
        now: NOW,
        rules: ruledRules,
      }),
    ).toBeNull();
  });
});

describe('findVisibleTournament', () => {
  it('visible: the tournament, and whether the viewer plays it; null where R-50 hides it', async () => {
    await hub();
    expect(
      await findVisibleTournament(
        db,
        TOURNAMENT.slug,
        ADA_SIGNED_IN,
        ruledRules,
      ),
    ).toMatchObject({ tournament: TOURNAMENT, member: true });
    expect(
      await findVisibleTournament(
        db,
        TOURNAMENT.slug,
        DAN_SIGNED_IN,
        ruledRules,
      ),
    ).toMatchObject({ tournament: TOURNAMENT, member: false });
    await saveTournamentProfile(db, TOURNAMENT, { ...ACTIVE, isPublic: false });
    expect(
      await findVisibleTournament(
        db,
        TOURNAMENT.slug,
        DAN_SIGNED_IN,
        ruledRules,
      ),
    ).toBeNull();
  });
});
