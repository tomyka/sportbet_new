import {
  canSeeTournament,
  cardAction,
  hubGroup,
  isOpenForRegistrationWindowAt,
  orderHub,
  rankPlayers,
  registrationClosesAt,
  registrationFormStep,
  sumTournamentTotals,
  tallyMedals,
  tournamentId,
  tournamentPageAction,
  usernameInvariant,
  widgetsShown,
  type CardAction,
  type HubGroup,
  type Instant,
  type MedalRow,
  type PlayerId,
  type RegistrationWindow,
  type RuleSet,
  type Tournament,
  type TournamentId,
  type TournamentPageAction,
  type TournamentProfile,
} from '@sportbet/domain';
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { listPlayerTournaments } from '../account/repository';
import type { Executor } from '../client';
import { instantOf, keyOf, playerOf, stored } from '../edge';
import { loadRegistrationWindowsById } from '../joining/repository';
import { loadPlayerStatuses } from '../player/repository';
import { players, tournamentPlayers } from '../player/schema';
import { loadTournamentPoints } from '../points/repository';
import { matchPoints } from '../points/schema';
import { games } from '../season/schema';
import { standingsPredictions } from '../standings/schema';
import { listTeams } from '../team/repository';
import { teams } from '../team/schema';
import { listTournaments } from '../tournament/repository';
import { loadTournamentProfiles } from '../tournament/profile';

/** Who is looking: a guest (no player), or a signed-in player and whether they are an admin (R-50). */
export interface HubViewer {
  readonly player: PlayerId | null;
  readonly isAdmin: boolean;
}

/** A signed-in viewer: the registration form is for players only. */
export interface PlayerViewer extends HubViewer {
  readonly player: PlayerId;
}

/** A tournament the viewer may see, with what decides its card. */
export interface VisibleTournament {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
  readonly window: RegistrationWindow;
  /** The viewer plays it (`tournament_players`; leagues are slice 12's). */
  readonly member: boolean;
}

/** One line of "Artėjančios rungtynės". */
export interface UpcomingGame {
  readonly id: number;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
}

/** One line of "Lyderiai". */
export interface HubLeader {
  readonly rank: number;
  readonly username: string;
  /** The total the page ranks by, to the cent (leaderPoints prints it). */
  readonly totalCents: number;
}

/** What an active card shows a guest. */
export interface GuestPanels {
  readonly leaders: readonly HubLeader[];
  readonly medals: readonly MedalRow[];
  /** "dalyviai": the tournament's players (leagues are slice 12's). */
  readonly participants: number;
  /** "prognozės": its match points rows of the rule set. */
  readonly predictions: number;
}

/** One card of the hub. */
export interface HubCard {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
  readonly group: HubGroup;
  readonly action: CardAction | null;
  readonly howItWorks: boolean;
  /** Empty where the card lists none, or none is open. */
  readonly upcomingGames: readonly UpcomingGame[];
  readonly guestPanels: GuestPanels | null;
}

/** The tournament page's header card. */
export interface TournamentPage {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
  /** show.blade.php's `$isFinished`: the hub's group (R-55). */
  readonly finished: boolean;
  readonly participants: number;
  readonly action: TournamentPageAction;
}

/** What the registration form's address answers a signed-in player. */
export type RegistrationForm =
  | { readonly step: 'member' }
  | { readonly step: 'closed' }
  | {
      readonly step: 'open';
      readonly tournament: Tournament;
      readonly profile: TournamentProfile;
      readonly games: number;
      readonly teams: number;
      /** PL-2 under the rule set; null when no game sets it (R-54). */
      readonly closesAt: Instant | null;
    };

const keyOfTournament = (tournament: Tournament): TournamentId =>
  stored(tournamentId(String(tournament.id)), 'tournaments', tournament.id);

/**
 * Every tournament the viewer may see (R-50, canSeeTournament), by id,
 * with its profile, its registration window and whether they play it.
 */
async function visibleTournaments(
  db: Executor,
  viewer: HubViewer,
  rules: RuleSet,
): Promise<VisibleTournament[]> {
  const profiles = await loadTournamentProfiles(db);
  const windows = await loadRegistrationWindowsById(db);
  const playing = new Set(
    viewer.player === null
      ? []
      : await listPlayerTournaments(db, viewer.player),
  );
  return (await listTournaments(db)).flatMap((tournament) => {
    const profile = profiles.get(tournament.id);
    const window = windows.get(tournament.id);
    if (profile === undefined || window === undefined) {
      throw new Error(
        `hub: tournament ${String(tournament.id)} has no profile or window`,
      );
    }
    const member = playing.has(tournament.id);
    const seen = canSeeTournament({
      isPublic: profile.isPublic,
      member,
      isAdmin: viewer.isAdmin,
      rules,
    });
    return seen ? [{ tournament, profile, window, member }] : [];
  });
}

/**
 * The tournament at `slug`, if the viewer may see it (R-50): the page,
 * the form, enter and the form's submit all answer "not found" otherwise.
 */
export async function findVisibleTournament(
  db: Executor,
  slug: string,
  viewer: HubViewer,
  rules: RuleSet,
): Promise<VisibleTournament | null> {
  const visible = await visibleTournaments(db, viewer, rules);
  return visible.find(({ tournament }) => tournament.slug === slug) ?? null;
}

const upcomingRows = z.array(
  z.object({
    id: z.int(),
    tournament: z.int(),
    tipOff: z.date(),
    home: z.string(),
    away: z.string(),
  }),
);

/**
 * The hub's "Artėjančios rungtynės": each tournament's next three games
 * open for predictions (Game.isOpenAt: no result, not locked, not
 * postponed, tip-off after `now`; the plan's decision 5), by tip-off then
 * id, in one query for every card that lists them.
 */
async function loadUpcomingGames(
  db: Executor,
  tournamentIds: readonly number[],
  now: Instant,
): Promise<Map<number, UpcomingGame[]>> {
  const byTournament = new Map<number, UpcomingGame[]>();
  if (tournamentIds.length === 0) return byTournament;
  const home = alias(teams, 'home');
  const away = alias(teams, 'away');
  const ranked = db
    .select({
      id: games.id,
      tournament: games.tournamentId,
      tipOff: games.tipOff,
      home: sql<string>`${home.name}`.as('home_name'),
      away: sql<string>`${away.name}`.as('away_name'),
      place:
        sql<number>`row_number() over (partition by ${games.tournamentId} order by ${games.tipOff}, ${games.id})`.as(
          'place',
        ),
    })
    .from(games)
    .innerJoin(home, eq(home.id, games.homeTeamId))
    .innerJoin(away, eq(away.id, games.awayTeamId))
    .where(
      and(
        inArray(games.tournamentId, [...tournamentIds]),
        gt(games.tipOff, new Date(now)),
        isNull(games.homeScore),
        isNull(games.lockedSince),
        eq(games.postponed, false),
      ),
    )
    .as('ranked');
  const rows = await db
    .select({
      id: ranked.id,
      tournament: ranked.tournament,
      tipOff: ranked.tipOff,
      home: ranked.home,
      away: ranked.away,
    })
    .from(ranked)
    .where(sql`${ranked.place} <= 3`)
    .orderBy(asc(ranked.tournament), asc(ranked.tipOff), asc(ranked.id));
  for (const row of upcomingRows.parse(rows)) {
    byTournament.set(row.tournament, [
      ...(byTournament.get(row.tournament) ?? []),
      {
        id: row.id,
        tipOff: instantOf(row.tipOff, 'games', String(row.id)),
        home: row.home,
        away: row.away,
      },
    ]);
  }
  return byTournament;
}

const usernameRows = z.array(
  z.object({ id: z.int(), username: usernameInvariant.schema }),
);

async function usernamesOf(
  db: Executor,
  ids: readonly PlayerId[],
): Promise<Map<PlayerId, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: players.id, username: players.username })
    .from(players)
    .where(
      inArray(
        players.id,
        ids.map((id) => keyOf(id, 'player')),
      ),
    );
  return new Map(
    usernameRows.parse(rows).map((row) => [playerOf(row.id), row.username]),
  );
}

/**
 * PlayerTotals::forTournament(...)->limit(5), ranked: the players with a
 * match points row of the rule set's source in the tournament (the inner
 * join on point_results), listed (RA-4: not switched off, not hidden), in
 * rankPlayers' Lyderiai order (RA-1, R-18; RA-3, R-30), the first five.
 * Their totals are the rows' sum (sumTournamentTotals).
 */
async function loadLeaders(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<HubLeader[]> {
  const rows = await loadTournamentPoints(db, tournament, rules.name);
  const scored = new Set(rows.matches.map(({ player }) => player));
  if (scored.size === 0) return [];
  const statuses = await loadPlayerStatuses(db, tournament, rules);
  const names = await usernamesOf(db, [...scored]);
  const key = keyOfTournament(tournament);
  const totals = sumTournamentTotals([], rows).flatMap((total) => {
    const username = names.get(total.player);
    if (!scored.has(total.player) || username === undefined) return [];
    const listed = statuses.get(total.player)?.isListedIn(key, rules) ?? false;
    return [{ ...total, username, listed }];
  });
  return rankPlayers(totals, 'lyderiai', rules)
    .slice(0, 5)
    .map(({ rank, username, totalCents }) => ({
      rank,
      username,
      totalCents,
    }));
}

const medalRows = z.array(
  z.object({ player: z.int(), team: z.string(), finalPlace: z.int() }),
);

/**
 * MedalTally::forTournament: the listed players' final places (1 to 4)
 * by team (tallyMedals). sportbet also lists a team whose only rows hold
 * a final of 0; that 0 is null here (the plan's P2).
 */
async function loadMedals(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<MedalRow[]> {
  const rows = medalRows.parse(
    await db
      .select({
        player: standingsPredictions.playerId,
        team: teams.name,
        finalPlace: standingsPredictions.finalPlace,
      })
      .from(standingsPredictions)
      .innerJoin(teams, eq(teams.id, standingsPredictions.teamId))
      .where(
        and(
          eq(teams.tournamentId, tournament.id),
          isNotNull(standingsPredictions.finalPlace),
        ),
      ),
  );
  if (rows.length === 0) return [];
  const statuses = await loadPlayerStatuses(db, tournament, rules);
  const key = keyOfTournament(tournament);
  return [
    ...tallyMedals(
      rows.filter(
        ({ player }) =>
          statuses.get(playerOf(player))?.isListedIn(key, rules) ?? false,
      ),
    ),
  ];
}

const countRows = z.array(z.object({ count: z.int() }));

async function countParticipants(
  db: Executor,
  tournament: Tournament,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id));
  return countRows.parse(rows)[0]?.count ?? 0;
}

/** The hub's "prognozės": sportbet counts the tournament's point_results rows. */
async function countPredictions(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchPoints)
    .innerJoin(games, eq(games.id, matchPoints.gameId))
    .where(
      and(
        eq(matchPoints.source, rules.name),
        eq(games.tournamentId, tournament.id),
      ),
    );
  return countRows.parse(rows)[0]?.count ?? 0;
}

async function loadGuestPanels(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<GuestPanels> {
  return {
    leaders: await loadLeaders(db, tournament, rules),
    medals: await loadMedals(db, tournament, rules),
    participants: await countParticipants(db, tournament),
    predictions: await countPredictions(db, tournament, rules),
  };
}

/**
 * TournamentController::hub: every tournament the viewer may see (R-50),
 * grouped and ordered (hubGroup, orderHub; R-55), each with its button
 * (cardAction) and the widgets sportbet draws for it (widgetsShown). The
 * guest panels are loaded per active card a guest sees - single digits.
 */
export async function loadHub(
  db: Executor,
  viewer: HubViewer,
  now: Instant,
  rules: RuleSet,
): Promise<HubCard[]> {
  const signedIn = viewer.player !== null;
  const ordered = orderHub(
    (await visibleTournaments(db, viewer, rules)).map((visible) => {
      const group = hubGroup({
        profile: visible.profile,
        window: visible.window,
        now,
        rules,
      });
      return {
        ...visible,
        id: visible.tournament.id,
        startsOn: visible.profile.startsOn,
        group,
        widgets: widgetsShown(group, signedIn),
      };
    }),
  );
  const upcoming = await loadUpcomingGames(
    db,
    ordered.filter(({ widgets }) => widgets.upcomingGames).map(({ id }) => id),
    now,
  );
  const cards: HubCard[] = [];
  for (const card of ordered) {
    cards.push({
      tournament: card.tournament,
      profile: card.profile,
      group: card.group,
      action: cardAction({
        group: card.group,
        signedIn,
        member: card.member,
        registrationOpen: isOpenForRegistrationWindowAt(
          card.window,
          now,
          rules,
        ),
      }),
      howItWorks: card.widgets.howItWorks,
      upcomingGames: upcoming.get(card.id) ?? [],
      guestPanels: card.widgets.guestPanels
        ? await loadGuestPanels(db, card.tournament, rules)
        : null,
    });
  }
  return cards;
}

/**
 * TournamentController::show's header card, or null when the slug names
 * no tournament the viewer may see (R-50).
 */
export async function loadTournamentPage(
  db: Executor,
  slug: string,
  viewer: HubViewer,
  now: Instant,
  rules: RuleSet,
): Promise<TournamentPage | null> {
  const found = await findVisibleTournament(db, slug, viewer, rules);
  if (found === null) return null;
  const { tournament, profile, window, member } = found;
  return {
    tournament,
    profile,
    finished: hubGroup({ profile, window, now, rules }) === 'finished',
    participants: await countParticipants(db, tournament),
    action: tournamentPageAction({
      signedIn: viewer.player !== null,
      member,
      registrationOpen: isOpenForRegistrationWindowAt(window, now, rules),
    }),
  };
}

/**
 * TournamentController::registerForm (R-53): a player in the tournament
 * is taken in; anyone else gets the form while it is open - with its
 * games and teams counted and its closing moment (R-54) - else "closed".
 * Null when the slug names no tournament the viewer may see.
 */
export async function loadRegistrationForm(
  db: Executor,
  slug: string,
  viewer: PlayerViewer,
  now: Instant,
  rules: RuleSet,
): Promise<RegistrationForm | null> {
  const found = await findVisibleTournament(db, slug, viewer, rules);
  if (found === null) return null;
  const step = registrationFormStep({
    member: found.member,
    registrationOpen: isOpenForRegistrationWindowAt(found.window, now, rules),
  });
  if (step !== 'open') return { step };
  return {
    step,
    tournament: found.tournament,
    profile: found.profile,
    games: found.window.games,
    teams: (await listTeams(db, found.tournament)).length,
    closesAt: registrationClosesAt(found.window, rules),
  };
}
