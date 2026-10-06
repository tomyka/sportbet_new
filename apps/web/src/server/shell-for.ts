import {
  displayInitials,
  displayName,
  NO_TOURNAMENT_NAV,
} from '@sportbet/domain';
import {
  guestView,
  showsLeagueTab,
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

/**
 * The shell's view of a request: a guest's, or the player's from the
 * request context. Leagues arrive with slice 12: until then they are
 * null, the shell draws no league row, and the league tab follows them
 * through showsLeagueTab (#16's comment). Badges are slice 6's: "Spėjimai"
 * counts the current round's unanswered open games; standings, survival
 * and invites wait for their slices.
 */
export function shellViewFor(context: RequestContext): ShellView {
  const { player, tournament } = context;
  if (player === null) return guestView();
  const leagues = null;
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
    },
    leagues,
    leagueTab: showsLeagueTab(leagues),
  };
}
