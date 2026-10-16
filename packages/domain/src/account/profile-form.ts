import { storedEmailAddress, normalizeEmail, type EmailAddress } from './email';
import { ANSWER_MAX_LENGTH } from './person-name';
import { registrationProblems } from './registration';

/** The profile form's fields, in the form's order. */
export const PROFILE_FIELDS = ['username', 'name', 'surname', 'email'] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

type UsernameProblem = 'required' | 'blank' | 'too-long' | 'taken';
type NameProblem = 'required' | 'too-long';
type EmailProblem = 'required' | 'not-an-email' | 'too-long' | 'taken';

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

/**
 * The form checked for format: every refused field, the username and the
 * address when each passed its own rules (the two fields uniqueness is asked
 * of, as Laravel asks it of a field that passed), and the whole entry when
 * nothing is refused.
 */
export interface ProfileFormCheck {
  readonly problems: ProfileProblems;
  readonly username: string | null;
  readonly email: EmailAddress | null;
  readonly entry: ProfileEntry | null;
}

/** Which of the two unique fields another account already holds. */
export interface HeldFields {
  readonly username: boolean;
  readonly email: boolean;
}

/** A posted field as text; a missing or non-text one is empty, as Laravel reads it. */
const textOf = (posted: unknown): string =>
  typeof posted === 'string' ? posted : '';

/** The surname's own rules: required, at most 255 characters. */
function surnameProblem(surname: string): NameProblem | null {
  if (surname === '') return 'required';
  return Array.from(surname).length > ANSWER_MAX_LENGTH ? 'too-long' : null;
}

/** Each refused field of the typed form and why: registration's rules, and the surname's. */
function problemsOf(
  typed: Readonly<Record<ProfileField, string>>,
): ProfileProblems {
  const shared = registrationProblems(typed);
  const surname = surnameProblem(typed.surname);
  return {
    ...(shared.username === undefined ? {} : { username: shared.username }),
    ...(shared.name === undefined ? {} : { name: shared.name }),
    ...(surname === null ? {} : { surname }),
    ...(shared.email === undefined ? {} : { email: shared.email }),
  };
}

/** A typed address that passed its rules, normalized. */
function addressOf(typed: string): EmailAddress {
  const email = storedEmailAddress(normalizeEmail(typed));
  if (!email.ok) {
    throw new Error('profileFormEntry: an address that passed is not one');
  }
  return email.value;
}

/**
 * UserProfileController::updateUserProfile's rules, field by field as
 * Laravel reports every field: username, name and surname required, each at
 * most 255 characters (mb_strlen); the username not blank; the email
 * required, an address and at most 255, then normalized (normalizeEmail,
 * #42). The posted values are already trimmed, as TrimStrings trims them for
 * registration. Format only: uniqueness of the username and the address is
 * asked of the database for the fields that passed (`withHeld`).
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
  const problems = problemsOf(typed);
  const address = problems.email === undefined ? addressOf(typed.email) : null;
  const entry =
    Object.keys(problems).length === 0 && address !== null
      ? { ...typed, email: address }
      : null;
  return {
    problems,
    username: problems.username === undefined ? typed.username : null,
    email: address,
    entry,
  };
}

/**
 * The format's problems with `taken` added for a username or address that
 * passed its format and is another account's: one pass over every field, a
 * field's format refusal first (Laravel lists a field's first failed rule).
 */
export function withHeld(
  problems: ProfileProblems,
  held: HeldFields,
): ProfileProblems {
  return {
    ...problems,
    ...(held.username && problems.username === undefined
      ? { username: 'taken' as const }
      : {}),
    ...(held.email && problems.email === undefined
      ? { email: 'taken' as const }
      : {}),
  };
}
