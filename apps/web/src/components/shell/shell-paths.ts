// sportbet's URLs the player shell reaches outside the navigation entries
// (routes/web.php and routes/auth.php at 1ac955f). Each is served by the
// slice that owns it, at the same URL and method as sportbet, and linked
// only once it is (`SHELL_LINKS`).

/** The rail's name link and the menu's "Profilis" (slice 17). */
export const PROFILE_PATH = '/userProfile';

/** "Administravimas" / "Admin", for an admin only: the dashboard, sportbet's admin.index (slice 7). */
export const ADMIN_PATH = '/admin/index';

/** sportbet's bare /admin, which only redirects to the dashboard (its route 'admin'). */
export const ADMIN_ROOT_PATH = '/admin';

/** "Rezultatai (turas)": the current round's games (slice 7). */
export const ADMIN_RESULTS_PATH = '/admin/results';

/** "Visi rezultatai": the tournament's games (slice 7, R-66). */
export const ADMIN_RESULTS_ALL_PATH = '/admin/resultsAll';

/** Where the results page's boxes post (sportbet's URL). */
export const UPDATE_RESULT_PATH = '/admin/updateResult';

/** "Perskaičiuoti taškus" (sportbet's URL, a POST since issue 269). */
export const RECALCULATE_PATH = '/admin/recalculateAllGamePoints';

/** "Keisti turnyrą": leave the tournament the menu is scoped to (slice 5). */
export const TOURNAMENT_EXIT_PATH = '/tournaments/exit';

/** "Atsijungti": a POST, from a hidden form in each place (4b). */
export const SIGN_OUT_PATH = '/logout';

/** A league in the switcher: a POST with `leagueID` (the leagues slice). */
export const LEAGUE_SWITCH_PATH = '/leagues/switch';

/** The game page: "Pradžia" and a player's brand (sportbet's route 'main', slice 8). */
export const MAIN_PATH = '/main';

/** "Lyderių lentelė": every tournament's table, public (sportbet's route 'leaderboard', slice 8). */
export const LEADERBOARD_PATH = '/leaderboard';

/** Where a player goes after sign-in: /main since slice 8. */
export const PLAYER_HOME = MAIN_PATH;

/** "Spėjimai": the player's match-result predictions (slice 6). */
export const PREDICTIONS_PATH = '/prediction/results';

/** The list at one round (sportbet's event id), or every round (R-58). */
export const predictionsPathFor = (event: number | 'all'): string =>
  `${PREDICTIONS_PATH}?event=${String(event)}`;

/**
 * Where the autosave posts. sportbet posts to the list's own address; Next
 * cannot serve a page and a handler at one path (slice 6, decision 1).
 */
export const PREDICTION_SAVE_PATH = '/prediction/results/save';

/** One game's prediction page: the reminder mail's link (slice 6c). */
export const predictionGamePath = (game: number): string =>
  `/prediction/game/${String(game)}`;

/** A tournament's registration form (slice 5). */
export const registerPath = (slug: string): string =>
  `/tournament/${slug}/register`;

/**
 * The player shell's links outside the navigation entries. Each is null
 * until its page exists in this app (#16), so the shell never links to a
 * 404; shell-paths.test.ts checks every one that is set has its page.
 * A record, not an interface, so the test can read its values typed.
 */
export type ShellLinks = Readonly<
  Record<'profile' | 'admin' | 'tournamentExit', string | null>
>;

/** Slice 5's tournament exit and slice 7's administration; the profile (17) does not exist yet. */
export const SHELL_LINKS: ShellLinks = {
  profile: null,
  admin: ADMIN_PATH,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};

/** Every link sportbet's player shell has, for the tests that draw it whole. */
export const SPORTBET_LINKS: ShellLinks = {
  profile: PROFILE_PATH,
  admin: ADMIN_PATH,
  tournamentExit: TOURNAMENT_EXIT_PATH,
};
