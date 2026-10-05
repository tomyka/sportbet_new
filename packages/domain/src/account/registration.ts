import { usernameInvariant } from '../player/player';
import { ANSWER_MAX_LENGTH } from './person-name';
import { ok, refuse, type Result } from '../shared/result';
import {
  emailInvariant,
  normalizeEmail,
  storedEmailAddress,
  type EmailAddress,
} from './email';

/** RegisteredUserController::store's fields, in the form's order. */
export const REGISTRATION_FIELDS = [
  'username',
  'name',
  'surname',
  'email',
] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

/** The form's fields as typed, each trimmed as Laravel's TrimStrings trims it. */
export type TypedRegistration = Readonly<Record<RegistrationField, string>>;

/**
 * Why an answer is refused, the first of sportbet's rules it fails:
 * missing, blank (a username of only characters the username invariant
 * refuses, plan decision 14), not an address, or too long.
 */
export type AnswerProblem = 'required' | 'blank' | 'not-an-email' | 'too-long';

type UsernameProblem = 'required' | 'blank' | 'too-long';
type NameProblem = 'required' | 'too-long';
/** `nullable|string|max:255`: a surname may be left out, never too long. */
type SurnameProblem = 'too-long';
type EmailProblem = 'required' | 'not-an-email' | 'too-long';

/** Each refused field and why: only the problems that field's rules have. */
export interface RegistrationProblems {
  readonly username?: UsernameProblem;
  readonly name?: NameProblem;
  readonly surname?: SurnameProblem;
  readonly email?: EmailProblem;
}

/** What a pending registration keeps and an account is created from. */
export interface RegistrationAnswers {
  readonly username: string;
  readonly name: string;
  readonly surname: string;
  readonly email: EmailAddress;
}

const tooLong = (value: string) => Array.from(value).length > ANSWER_MAX_LENGTH;

/** An address's shape: emailInvariant's pattern, without its length. */
const ADDRESS_SHAPE = new RegExp(emailInvariant.pattern, 'u');

function usernameProblem(typed: string): UsernameProblem | null {
  if (typed === '') return 'required';
  if (tooLong(typed)) return 'too-long';
  // Only characters JavaScript's \s knows and Laravel's trim keeps (e.g.
  // U+2028): sportbet would store it, the username invariant - which every
  // production username satisfies - refuses it, so it is blank.
  return usernameInvariant.schema.safeParse(typed).success ? null : 'blank';
}

function nameProblem(typed: string): NameProblem | null {
  if (typed === '') return 'required';
  return tooLong(typed) ? 'too-long' : null;
}

function surnameProblem(typed: string): SurnameProblem | null {
  return tooLong(typed) ? 'too-long' : null;
}

/**
 * `required|string|lowercase|email|max:255`, with `lowercase` replaced by
 * lowering (the owner, 2026-10-05): sign-in normalizes an address, and so
 * does registration. The length is the stored address's. Whether it is
 * already registered is the database's to answer (isEmailRegistered).
 */
function emailProblem(typed: string): EmailProblem | null {
  if (typed === '') return 'required';
  const normalized = normalizeEmail(typed);
  if (!ADDRESS_SHAPE.test(normalized)) return 'not-an-email';
  return tooLong(normalized) ? 'too-long' : null;
}

/** Each refused field and why; empty when every answer passes. */
export function registrationProblems(
  typed: TypedRegistration,
): RegistrationProblems {
  const username = usernameProblem(typed.username);
  const name = nameProblem(typed.name);
  const surname = surnameProblem(typed.surname);
  const email = emailProblem(typed.email);
  return {
    ...(username === null ? {} : { username }),
    ...(name === null ? {} : { name }),
    ...(surname === null ? {} : { surname }),
    ...(email === null ? {} : { email }),
  };
}

/**
 * The answers as a registration keeps them - the address normalized - or a
 * refusal when any field has a problem (registrationProblems says which).
 */
export function registrationAnswers(
  typed: TypedRegistration,
): Result<RegistrationAnswers, 'answers-refused'> {
  if (Object.keys(registrationProblems(typed)).length > 0) {
    return refuse('answers-refused');
  }
  const email = storedEmailAddress(normalizeEmail(typed.email));
  if (!email.ok) {
    throw new Error('registrationAnswers: an address that passed is not one');
  }
  return ok({
    username: typed.username,
    name: typed.name,
    surname: typed.surname,
    email: email.value,
  });
}
