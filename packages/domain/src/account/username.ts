import { foldEmail } from './email';

/** utf8mb4_unicode_ci pads with spaces: trailing ones never tell two apart. */
const TRAILING_SPACES = / +$/u;

/**
 * utf8mb4_unicode_ci gives these no weight (a joiner, a soft hyphen, a word
 * joiner, a direction override): 'Tomas' with one is 'Tomas'.
 */
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * A username as sportbet's collation compares it (RegisteredUserController
 * ::createAccount's `where('username', ...)` under utf8mb4_unicode_ci):
 * lower case, accents dropped as foldEmail drops them, ignorable characters
 * and trailing spaces dropped, so 'Naujokė', 'NAUJOKE' and 'naujoke ' are
 * one username. Lowered again after folding, as NFKD can turn a letter into
 * a capital (U+210C). The key isUsernameTaken compares, never stored; its
 * other gaps are foldEmail's.
 */
export function foldUsername(username: string): string {
  return foldEmail(username.toLowerCase())
    .toLowerCase()
    .replace(IGNORABLE, '')
    .replace(TRAILING_SPACES, '');
}

/**
 * RegisteredUserController::createAccount's `User::where('username', ...)
 * ->exists()`: whether any of the stored usernames is `wanted` as the
 * collation compares them (foldUsername).
 */
export function isUsernameTaken(
  existing: readonly string[],
  wanted: string,
): boolean {
  const folded = foldUsername(wanted);
  return existing.some((username) => foldUsername(username) === folded);
}
