import {
  guestView,
  showsLeagueTab,
  type PlayerShellView,
  type ShellLeagues,
  type ShellPlayer,
} from '../../src/components/shell/shell-view';

/** A signed-in player as 4b will describe one to the shell. */
export const JONAS: ShellPlayer = {
  name: 'Jonas P.',
  initials: 'JP',
  isAdmin: false,
};

/** One league, the active one. */
export const ONE_LEAGUE: ShellLeagues = {
  items: [{ id: 3, name: 'Vieša', active: true }],
};

/**
 * A signed-in player's view: in a tournament, in one league, no flags and
 * no badges. Each test overrides what it is about; the league tab follows
 * the leagues, as 4b will compute it, unless a test sets it.
 */
export function playerView(
  overrides: Partial<PlayerShellView> = {},
): PlayerShellView {
  const leagues =
    overrides.leagues === undefined ? ONE_LEAGUE : overrides.leagues;
  return {
    ...guestView(),
    player: JONAS,
    tournament: { name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' },
    leagues,
    leagueTab: showsLeagueTab(leagues),
    ...overrides,
  };
}
