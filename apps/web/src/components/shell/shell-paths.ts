import { slugSchema } from '@sportbet/domain';

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

const REGISTER_FORM = /^\/tournament\/([^/?#]+)\/register$/u;
const PREDICTIONS_PAGE =
  /^\/prediction\/results(?:\?event=(?:all|[1-9]\d{0,9}))?$/u;
const PREDICTION_GAME_PAGE = /^\/prediction\/game\/[1-9]\d{0,9}$/u;

/**
 * The pages that send a guest to sign in and back (sportbet's `auth` and
 * `redirect()->intended`): each one's path builder beside the matcher its
 * return path is checked by (server/sign-in/return-path.ts), so a page
 * cannot build a path its own return refuses (return-path.test.ts). Ids
 * are whole numbers from 1, at most ten digits; no query but `?event=`.
 */
export const GUARDED_PAGES = {
  /** `/tournament/<slug>/register`, the slug valid. */
  registerForm: {
    path: registerPath,
    matches: (path: string): boolean => {
      const slug = REGISTER_FORM.exec(path)?.[1];
      return slug !== undefined && slugSchema.safeParse(slug).success;
    },
  },
  /** The list, bare, at one round (its id) or every round (R-58). */
  predictions: {
    path: predictionsPathFor,
    matches: (path: string): boolean => PREDICTIONS_PAGE.test(path),
  },
  /** One game. */
  predictionGame: {
    path: predictionGamePath,
    matches: (path: string): boolean => PREDICTION_GAME_PAGE.test(path),
  },
} as const;

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
