import {
  displayInitials,
  displayName,
  NO_TOURNAMENT_NAV,
} from '@sportbet/domain';
import {
  guestView,
  type ShellLeagues,
  type ShellPlayer,
  type ShellView,
} from '../components/shell/shell-view';
import type { RequestContext } from './request-context';

/**
 * What the rail shows of a player (sportbet's partials/rail-account): the
 * domain's displayName ("Jonas P.") and displayInitials ("JP"). The
 * surname itself never reaches the shell (#16).
 */
export function shellPlayer(player: {
  readonly name: string;
  readonly surname: string;
  readonly isAdmin: boolean;
}): ShellPlayer {
  return {
    name: displayName(player),
    initials: displayInitials(player),
    isAdmin: player.isAdmin,
  };
}

/** The switcher's leagues: the player's in the tournament, the selected one active. */
function leaguesOf(
  tournament: RequestContext['tournament'],
): ShellLeagues | null {
  if (tournament === null) return null;
  return {
    items: tournament.leagues.map(({ id, name, selected }) => ({
      id,
      name,
      active: selected,
    })),
  };
}

/**
 * The shell's view of a request: a guest's, or the player's from the
 * request context. The leagues are the player's in the request's
 * tournament, the selected one active (null with no tournament: no league
 * row). Badges:
 * "Spėjimai" counts the current round's unanswered open games and invites
 * the pending league invites (every tournament, issue 183); standings and
 * survival wait for their slices. "Lyderiai" is a guest's entry:
 * `leaderboardOffered` (anyLeaderboardEntry) reaches a guest's view only.
 */
export function shellViewFor(
  context: RequestContext,
  leaderboardOffered: boolean,
): ShellView {
  const { player, tournament } = context;
  if (player === null) return { ...guestView(), leaderboardOffered };
  const leagues = leaguesOf(tournament);
  return {
    player: shellPlayer(player),
    tournament:
      tournament === null
        ? null
        : {
            name: tournament.tournament.name,
            slug: tournament.tournament.slug,
          },
    nav: tournament?.nav ?? NO_TOURNAMENT_NAV,
    badges: {
      ...guestView().badges,
      results: tournament?.missingResults ?? 0,
      invites: player.pendingInvites,
    },
    leagues,
    leaderboardOffered: false,
  };
}
