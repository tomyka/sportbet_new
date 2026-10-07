import {
  canSeeTournament,
  cardAction,
  guestPanels,
  hubGroup,
  nextOpenGames,
  isOpenForRegistrationWindowAt,
  orderHub,
  registrationClosesAt,
  registrationFormStep,
  tournamentPageAction,
  usernameInvariant,
  widgetsShown,
  type CardAction,
  type FinalPlacePick,
  type HubGroup,
  type Instant,
  type LeaderLine,
  type MedalRow,
  type PlayerId,
  type RegistrationWindow,
  type RuleSet,
  type Tournament,
  type TournamentPageAction,
  type TournamentProfile,
} from '@sportbet/domain';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { listPlayerTournaments } from '../account/repository';
import type { Executor } from '../client';
import { keyOf, keyOfTournament, playerOf } from '../edge';
import { loadPlayerStatuses } from '../player/repository';
import { players, tournamentPlayers } from '../player/schema';
import { matchPoints } from '../points/schema';
import { loadTournamentTotals } from '../points/totals';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { standingsPredictions } from '../standings/schema';
import { listTeams, teamNamesOf } from '../team/repository';
import { teams } from '../team/schema';
import { loadTournamentCatalogue } from '../tournament/catalogue';

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

/** One line of "Lyderiai": the domain's LeaderLine (guestPanels). */
export type HubLeader = LeaderLine;

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

/**
 * Every tournament the viewer may see (R-50, canSeeTournament), by id,
 * with its profile, its registration window (loadTournamentCatalogue) and
 * whether they play it.
 */
async function visibleTournaments(
  db: Executor,
  viewer: HubViewer,
  rules: RuleSet,
): Promise<VisibleTournament[]> {
  const playing = new Set(
    viewer.player === null
      ? []
      : await listPlayerTournaments(db, viewer.player),
  );
  return (await loadTournamentCatalogue(db)).flatMap((entry) => {
    const { tournament, profile, window } = entry;
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

/**
 * The hub's "Artėjančios rungtynės" for each card that lists them: the
 * tournament's season (loadSeason) through nextOpenGames, so "open for
 * predictions" is Game.isOpenAt's alone, with the teams' names. A card per
 * tournament a viewer sees: single digits.
 */
async function loadUpcomingGames(
  db: Executor,
  listing: readonly Tournament[],
  now: Instant,
): Promise<Map<number, UpcomingGame[]>> {
  const byTournament = new Map<number, UpcomingGame[]>();
  for (const tournament of listing) {
    const next = nextOpenGames((await loadSeason(db, tournament)).games, now);
    if (next.length === 0) continue;
    const nameOf = await teamNamesOf(db, tournament);
    byTournament.set(
      tournament.id,
      next.map((game) => ({
        id: game.id,
        tipOff: game.tipOff,
        home: nameOf(game.home),
        away: nameOf(game.away),
      })),
    );
  }
  return byTournament;
}

const usernameRows = z.array(
  z.object({ id: z.int(), username: usernameInvariant.schema }),
);

export async function loadUsernames(
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

const finalPlaceRows = z.array(
  z.object({ player: z.int(), team: z.string(), finalPlace: z.int() }),
);

/**
 * Every player's final places (1 to 4) by team name, for the medal count
 * (guestPanels keeps the listed ones). sportbet also lists a team whose
 * only rows hold a final of 0; that 0 is null here (the plan's P2).
 */
export async function loadFinalPlaces(
  db: Executor,
  tournament: Tournament,
): Promise<FinalPlacePick[]> {
  const rows = await db
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
    );
  return finalPlaceRows
    .parse(rows)
    .map((row) => ({ ...row, player: playerOf(row.player) }));
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

/**
 * What an active card shows a guest: the leaders and medals guestPanels
 * decides from the rule set's stored totals (loadTournamentTotals), the
 * players' statuses (loaded once) and their final places, and the counts.
 */
async function loadGuestPanels(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<GuestPanels> {
  const { totals, scored } = await loadTournamentTotals(db, tournament, rules);
  const decided = guestPanels({
    tournament: keyOfTournament(tournament),
    totals,
    scored,
    usernames: await loadUsernames(db, [...scored]),
    statuses: await loadPlayerStatuses(db, tournament, rules),
    finalPlaces: await loadFinalPlaces(db, tournament),
    rules,
  });
  return {
    leaders: decided.leaders,
    medals: decided.medals,
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
    ordered
      .filter(({ widgets }) => widgets.upcomingGames)
      .map(({ tournament }) => tournament),
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
