import type { LeagueId } from '@sportbet/domain';

/**
 * What the shell is told about the request: one typed view, built on the
 * server per request (`shellViewFor`; a guest's is `guestView`) and passed
 * down. No shell component reads a session or the database. The nav flags
 * come from the domain (sportbet's NavVisibility); whether the phone's
 * bottom tabs end with the league drop-up is not stored, it is
 * `showsLeagueTab(leagues)`.
 */
export interface ShellView {
  readonly player: ShellPlayer | null;
  readonly tournament: ShellTournament | null;
  readonly nav: ShellNav;
  readonly badges: ShellBadges;
  readonly leagues: ShellLeagues | null;
  /** Whether a guest is offered "Lyderiai": the leaderboard has entries (sportbet's $leaderboardHasEntries, issue 131). */
  readonly leaderboardOffered: boolean;
}

/** A signed-in player's view: what the player shell is told. */
export interface PlayerShellView extends ShellView {
  readonly player: ShellPlayer;
}

export interface ShellPlayer {
  /** As the rail shows it: first name and the surname's initial ("Jonas P."). */
  readonly name: string;
  /** The rail's avatar ("JP"). */
  readonly initials: string;
  readonly isAdmin: boolean;
}

export interface ShellTournament {
  readonly name: string;
  readonly slug: string;
}

/** Which conditional entries show (sportbet's session navShow* flags). */
interface ShellNav {
  readonly survival: boolean;
  readonly summary: boolean;
  readonly survivalSummary: boolean;
}

/** What is outstanding behind each badged entry; 0 hides the badge. */
export interface ShellBadges {
  readonly results: number;
  readonly standings: number;
  readonly survival: number;
  readonly invites: number;
}

export type BadgeKind = keyof ShellBadges;

export interface ShellLeague {
  readonly id: LeagueId;
  readonly name: string;
  /** The league the session plays in; at most one is. */
  readonly active: boolean;
}

/**
 * The player's leagues in this tournament, in membership order as sportbet
 * lists them (partials/league-switcher), the active one wherever it falls.
 * With none active the switcher says "Lyga".
 */
export interface ShellLeagues {
  readonly items: readonly ShellLeague[];
}

/** A visitor who is not signed in: everything off. */
export function guestView(): ShellView {
  return {
    player: null,
    tournament: null,
    nav: { survival: false, summary: false, survivalSummary: false },
    badges: { results: 0, standings: 0, survival: 0, invites: 0 },
    leagues: null,
    leaderboardOffered: false,
  };
}

export function isPlayerView(view: ShellView): view is PlayerShellView {
  return view.player !== null;
}

/**
 * Whether the bottom tabs offer the league drop-up: only from two leagues
 * (sportbet's partials/bottom-nav, issue 144 - with one there is nothing to
 * switch to). The bottom tabs ask it of the view's leagues.
 */
export function showsLeagueTab(leagues: ShellLeagues | null): boolean {
  return leagues !== null && leagues.items.length > 1;
}
