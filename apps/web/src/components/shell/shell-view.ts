/**
 * What the shell is told about the request (spec 4a, "What the shell is
 * told"): one typed view, built on the server per request and passed down.
 * No shell component reads a session or the database. In 4a every request
 * gets the guest view; 4b builds a player's from the request context, and
 * the rules behind the nav flags (sportbet's NavVisibility) are 4b's.
 */
export interface ShellView {
  readonly player: ShellPlayer | null;
  readonly tournament: ShellTournament | null;
  readonly nav: ShellNav;
  readonly badges: ShellBadges;
  readonly leagues: ShellLeagues | null;
  /** Whether the phone's bottom tabs end with the league drop-up (showsLeagueTab). */
  readonly leagueTab: boolean;
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
export interface ShellNav {
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
  readonly id: number;
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
    leagueTab: false,
  };
}

export function isPlayerView(view: ShellView): view is PlayerShellView {
  return view.player !== null;
}

/**
 * Whether the bottom tabs offer the league drop-up: only from two leagues
 * (sportbet's partials/bottom-nav, issue 144 - with one there is nothing to
 * switch to). 4b calls it when it builds a player's view.
 */
export function showsLeagueTab(leagues: ShellLeagues | null): boolean {
  return leagues !== null && leagues.items.length > 1;
}
