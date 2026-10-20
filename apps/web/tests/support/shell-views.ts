import { leagueNo } from '@sportbet/domain/testing';
import {
  guestView,
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
const ONE_LEAGUE: ShellLeagues = {
  items: [{ id: leagueNo(3), name: 'Vieša', active: true }],
};

/**
 * A signed-in player's view: in a tournament, in one league, no flags and
 * no badges. Each test overrides what it is about.
 */
export function playerView(
  overrides: Partial<PlayerShellView> = {},
): PlayerShellView {
  return {
    ...guestView(),
    player: JONAS,
    tournament: { name: 'Eurolyga 2026-27', slug: 'euroleague-2026-27' },
    leagues: ONE_LEAGUE,
    ...overrides,
  };
}

/** Two leagues, the second the active one: for a test of the league list. */
export const TWO_LEAGUES: ShellLeagues = {
  items: [
    { id: leagueNo(7), name: 'Draugai', active: false },
    { id: leagueNo(3), name: 'Vieša', active: true },
  ],
};
