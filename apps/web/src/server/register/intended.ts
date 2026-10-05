import { slugSchema } from '@sportbet/domain';
import {
  clearCookie,
  INTENDED_TOURNAMENT_COOKIE,
  readCookie,
  setCookie,
  type CookieReader,
  type CookieWriter,
} from '../cookies';

/**
 * The tournament a guest arrived to join (sportbet's session key
 * intended_tournament, set by /login and /register from `?tournament=`),
 * if the cookie holds a slug. Registration reads it; sign-in never does.
 */
export function readIntended(jar: CookieReader): string | null {
  const parsed = slugSchema.safeParse(
    readCookie(jar, INTENDED_TOURNAMENT_COOKIE),
  );
  return parsed.success ? parsed.data : null;
}

/**
 * Remembers a `?tournament=` that is a slug (spec: "a valid slug");
 * anything else is not kept, and the slug already remembered stays, as
 * sportbet's `filled('tournament')` left the session alone.
 */
export function rememberIntended(
  jar: CookieWriter,
  typed: string | null,
): void {
  const parsed = slugSchema.safeParse(typed);
  if (parsed.success) setCookie(jar, INTENDED_TOURNAMENT_COOKIE, parsed.data);
}

/** PostRegisterController's Session::forget('intended_tournament'): a registration done. */
export function forgetIntended(jar: CookieWriter): void {
  clearCookie(jar, INTENDED_TOURNAMENT_COOKIE);
}
