import { storedEmailAddress, normalizeEmail, type EmailAddress } from './email';
import { ANSWER_MAX_LENGTH } from './person-name';
import { registrationProblems } from './registration';

/** The profile form's fields, in the form's order. */
export const PROFILE_FIELDS = ['username', 'name', 'surname', 'email'] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

type UsernameProblem = 'required' | 'blank' | 'too-long';
type NameProblem = 'required' | 'too-long';
type EmailProblem = 'required' | 'not-an-email' | 'too-long';

/** Each refused field and why: only the problems that field's rules have. */
export interface ProfileProblems {
  readonly username?: UsernameProblem;
  readonly name?: NameProblem;
  readonly surname?: NameProblem;
  readonly email?: EmailProblem;
}

/** The form's answers, the address normalized. */
export interface ProfileEntry {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: EmailAddress;
}

/** The form checked: the entry, or every refused field (as Laravel reports them). */
export type ProfileFormCheck =
  | { readonly ok: true; readonly value: ProfileEntry }
  | { readonly ok: false; readonly problems: ProfileProblems };

/** A posted field as text; a missing or non-text one is empty, as Laravel reads it. */
const textOf = (posted: unknown): string =>
  typeof posted === 'string' ? posted : '';

/**
 * UserProfileController::updateUserProfile's rules, field by field as
 * Laravel reports every field: username, name and surname required, each at
 * most 255 characters (mb_strlen); the username not blank; the email
 * required, an address and at most 255, then normalized (normalizeEmail,
 * #42). The posted values are already trimmed, as TrimStrings trims them for
 * registration. Uniqueness of the username and the address is the
 * database's (isUsernameTaken, isEmailRegistered).
 */
export function profileFormEntry(
  posted: Readonly<Record<ProfileField, unknown>>,
): ProfileFormCheck {
  const typed = {
    username: textOf(posted.username),
    name: textOf(posted.name),
    surname: textOf(posted.surname),
    email: textOf(posted.email),
  };
  const shared = registrationProblems(typed);
  const surname =
    typed.surname === ''
      ? 'required'
      : Array.from(typed.surname).length > ANSWER_MAX_LENGTH
        ? 'too-long'
        : null;
  const problems: ProfileProblems = {
    ...(shared.username === undefined ? {} : { username: shared.username }),
    ...(shared.name === undefined ? {} : { name: shared.name }),
    ...(surname === null ? {} : { surname }),
    ...(shared.email === undefined ? {} : { email: shared.email }),
  };
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  const email = storedEmailAddress(normalizeEmail(typed.email));
  if (!email.ok) {
    throw new Error('profileFormEntry: an address that passed is not one');
  }
  return { ok: true, value: { ...typed, email: email.value } };
}
