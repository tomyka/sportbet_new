// sportbet's URLs the player shell reaches outside the navigation entries
// (routes/web.php and routes/auth.php at 1ac955f). Each is served by the
// slice that owns it, at the same URL and method as sportbet, and linked
// only once it is (`SHELL_LINKS`).

/** The rail's name link and the menu's "Profilis" (slice 17). */
export const PROFILE_PATH = '/userProfile';

/** "Administravimas" / "Admin", for an admin only (slices 13, 14). */
export const ADMIN_PATH = '/admin';

/** "Keisti turnyrą": leave the tournament the menu is scoped to (slice 5). */
export const TOURNAMENT_EXIT_PATH = '/tournaments/exit';

/** "Atsijungti": a POST, from a hidden form in each place (4b). */
export const SIGN_OUT_PATH = '/logout';

/** A league in the switcher: a POST with `leagueID` (the leagues slice). */
export const LEAGUE_SWITCH_PATH = '/leagues/switch';

/** Where a player goes after sign-in: '/' until /main exists (slice 8). */
export const PLAYER_HOME = '/';

/**
 * The player shell's links outside the navigation entries. Each is null
 * until its page exists in this app (#16), so the shell never links to a
 * 404; shell-paths.test.ts checks every one that is set has its page.
 * A record, not an interface, so the test can read its values typed.
 */
export type ShellLinks = Readonly<
  Record<'profile' | 'admin' | 'tournamentExit', string | null>
>;

/** Slice 5's: the tournament exit. The profile (17) and administration (13) do not exist yet. */
export const SHELL_LINKS: ShellLinks = {
  profile: null,
  admin: null,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};

/** Every link sportbet's player shell has, for the tests that draw it whole. */
export const SPORTBET_LINKS: ShellLinks = {
  profile: PROFILE_PATH,
  admin: ADMIN_PATH,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};
