// sportbet's URLs the player shell reaches outside the navigation entries
// (routes/web.php and routes/auth.php at 1ac955f). Nothing renders them
// before 4b switches the player shell on; each is served by the slice that
// owns it, at the same URL and method as sportbet.

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
