import { ID_TEXT, idFromText, slugSchema } from '@sportbet/domain';
import {
  PREDICTIONS_PATH,
  predictionGamePath,
  predictionsPathFor,
  registerPath,
  STANDINGS_PATH,
} from '../../components/shell/shell-paths';

// Where sign-in may send a guest back to (sportbet's `auth` and
// `redirect()->intended`), in one place: each guarded page's path builder
// beside its matcher, the checks a return path passes, and the one way a
// page sends a guest to sign in (signInAndReturn). return-path.ts keeps
// the cookie.

/** An origin no request has: the path is resolved against it, then must stay on it. */
const HERE = 'https://sportbet.invalid';

const MAX_LENGTH = 2000;

const BACKSLASH = 0x5c;

/** A control character or a backslash: each is one UTF-16 unit, so units are read. */
const hasUnsafeCharacter = (text: string): boolean => {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === BACKSLASH) return true;
  }
  return false;
};

/**
 * #16's hardened check for sportbet's `redirect()->intended`: a path on
 * this site, as a browser will resolve it. It must start with one '/',
 * hold no control character or backslash, and - after the URL parser has
 * removed dot segments, encoded dots included - still be on this origin
 * and start with neither '//' nor '/\' ('/.//evil.example',
 * '/a/..//evil.example' and '/%2e%2e//evil.example' all resolve to
 * '//evil.example'). The resolved path and query are what is kept.
 */
export function safeReturnPath(
  typed: string | null | undefined,
): string | null {
  if (typed === null || typed === undefined || !isPathShaped(typed)) {
    return null;
  }
  return resolvedOnThisSite(typed);
}

/** One '/' first, within the length, no control character or backslash. */
const isPathShaped = (typed: string): boolean =>
  typed.length > 0 &&
  typed.length <= MAX_LENGTH &&
  typed.startsWith('/') &&
  !hasUnsafeCharacter(typed);

/** The path and query as a browser resolves `typed`, if that stays on this origin and starts with neither '//' nor '/\'. */
function resolvedOnThisSite(typed: string): string | null {
  let url: URL;
  try {
    url = new URL(typed, HERE);
  } catch {
    return null;
  }
  if (url.origin !== HERE) return null;
  const path = `${url.pathname}${url.search}`;
  return path.startsWith('//') || path.startsWith('/\\') ? null : path;
}

/** What each guarded page's path is built from. */
interface GuardedPageArgs {
  /** The tournament registration form: its slug. */
  readonly registerForm: [slug: string];
  /** The predictions list: bare, at one round (its id), or every round (R-58). */
  readonly predictions: [event?: number | 'all'];
  /** One game's prediction page: the game. */
  readonly predictionGame: [game: number];
  /** The standings prediction: bare. */
  readonly standings: [];
}

/** A guarded page: how its path is built, and the shape a return to it must have. */
interface GuardedPage<Args extends unknown[]> {
  readonly path: (...args: Args) => string;
  readonly matches: (path: string) => boolean;
}

const REGISTER_FORM = /^\/tournament\/([^/?#]+)\/register$/u;
const PREDICTIONS_PAGE = new RegExp(
  `^/prediction/results(?:\\?event=(all|${ID_TEXT}))?$`,
  'u',
);
const PREDICTION_GAME_PAGE = new RegExp(`^/prediction/game/(${ID_TEXT})$`, 'u');

/** A matched id is read as the pages read it: idFromText, Postgres' integer cap included. */
const isId = (text: string | undefined): boolean =>
  text !== undefined && idFromText(text).ok;

/**
 * The pages that send a guest to sign in and back, each path builder
 * beside its matcher, so a page cannot build a path its own return
 * refuses (guarded-pages.test.ts, return-path.test.ts). Ids are whole
 * read as the domain reads them (idFromText); no query but `?event=`.
 */
export const GUARDED_PAGES: {
  readonly [Page in keyof GuardedPageArgs]: GuardedPage<GuardedPageArgs[Page]>;
} = {
  registerForm: {
    path: registerPath,
    matches: (path) => {
      const slug = REGISTER_FORM.exec(path)?.[1];
      return slug !== undefined && slugSchema.safeParse(slug).success;
    },
  },
  predictions: {
    path: (event) =>
      event === undefined ? PREDICTIONS_PATH : predictionsPathFor(event),
    matches: (path) => {
      const found = PREDICTIONS_PAGE.exec(path);
      if (found === null) return false;
      const event = found[1];
      return event === undefined || event === 'all' || isId(event);
    },
  },
  predictionGame: {
    path: predictionGamePath,
    matches: (path) => isId(PREDICTION_GAME_PAGE.exec(path)?.[1]),
  },
  standings: {
    path: () => STANDINGS_PATH,
    matches: (path) => path === STANDINGS_PATH,
  },
};

/** A guarded page's name in GUARDED_PAGES. */
export type GuardedPageName = keyof GuardedPageArgs;

/**
 * Security review M1: the return path is only the shape of a guarded page
 * (GUARDED_PAGES) - so a link from another site cannot make sign-in end
 * anywhere else on this one (an action such as /tournaments/exit or the
 * save included). safeReturnPath checks it again behind that, and must
 * keep it as typed.
 */
export function guardedReturnPath(
  typed: string | null | undefined,
): string | null {
  if (typed === null || typed === undefined) return null;
  const guarded = Object.values(GUARDED_PAGES).some((page) =>
    page.matches(typed),
  );
  if (!guarded) return null;
  return safeReturnPath(typed) === typed ? typed : null;
}

/**
 * The one way a guarded page sends a guest to sign in: /login with the
 * page's own path to come back to (sportbet's url.intended). When the
 * arguments do not make a path the return would keep, /login alone, and
 * sign-in ends at home.
 */
export function signInAndReturn<Page extends GuardedPageName>(
  page: Page,
  ...args: GuardedPageArgs[Page]
): string {
  const path = GUARDED_PAGES[page].path(...args);
  return guardedReturnPath(path) === null
    ? '/login'
    : `/login?intended=${encodeURIComponent(path)}`;
}
