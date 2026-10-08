import { isEmailRegistered, type Db } from '@sportbet/db';
import {
  emailAddress,
  registerRequestLimits,
  registrationAnswers,
  registrationProblems,
  type Instant,
  type RegistrationAnswers,
  type TypedRegistration,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type {
  RegisterErrors,
  RegisterState,
} from '../../components/shell/register-state';
import { env } from '../../env';
import { now } from '../clock';
import { clearCookie, OPEN_SIGN_IN_COOKIE } from '../cookies';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { pruneLater } from '../sign-in/prune';
import { sendCode } from '../sign-in/send-code';
import { throttledText } from '../sign-in/texts';
import { throttle } from '../sign-in/throttle';
import { readIntended } from './intended';
import {
  fitsInCookie,
  readPendingRegistration,
  writePendingRegistration,
  type PendingRegistration,
} from './pending-registration';
import { registrationOpenAt } from './registration-window';
import { problemTexts, REGISTER_TEXT } from './texts';

/** The form's fields as sportbet's controller read them: trimmed (TrimStrings). */
const typedRegistration = (form: FormData): TypedRegistration => ({
  username: formText(form, 'username'),
  name: formText(form, 'name'),
  surname: formText(form, 'surname'),
  email: formText(form, 'email'),
});

const refusedForm = (
  errors: RegisterErrors,
  values: TypedRegistration,
): RegisterState => ({ kind: 'refused', errors, values });

const NAME_FIELDS = ['username', 'name', 'surname'] as const;

type NameField = (typeof NAME_FIELDS)[number];

/** The name field holding the most bytes: the one a cookie that cannot fit is refused on (plan decision 13). */
function longestName(answers: RegistrationAnswers): NameField {
  const bytes = (value: string) => Buffer.byteLength(value);
  return NAME_FIELDS.reduce((longest, field) =>
    bytes(answers[field]) > bytes(answers[longest]) ? field : longest,
  );
}

/**
 * RegisteredUserController::store: throttled first (the route's
 * middleware); closed, or the honeypot filled - home, silently; the
 * answers checked, the address normalized (the owner, 2026-10-05) and
 * refused if registered (unique:users); then the answers, the slug /login
 * or /register was given and the moment wait in the signed cookie, and a
 * `registration` code is minted and mailed after the response. Nothing of
 * an account is written. The same address again is a resend (issue 114).
 */
export async function requestRegistration(
  form: FormData,
  ip: string,
): Promise<RegisterState> {
  const db = getDb();
  const at = now();
  const typed = typedRegistration(form);
  const verdict = await throttle(
    db,
    registerRequestLimits(typed.email, ip),
    at,
  );
  if (!verdict.allowed) {
    return refusedForm({ email: throttledText(verdict.minutes) }, typed);
  }
  // Closed, or the honeypot filled (real visitors never see it; bots do).
  if (!(await registrationOpenAt(at)) || formText(form, 'website') !== '') {
    redirect('/');
  }
  const checked = await checkedRegistration(db, typed);
  if (!checked.ok) return checked.state;
  return remember({ db, at, typed, answers: checked.answers });
}

/**
 * The answers checked and the address refused if registered (unique:users,
 * one of the address's rules, checked with the others: every refused field
 * is answered at once, qa G1).
 */
async function checkedRegistration(
  db: Db,
  typed: TypedRegistration,
): Promise<
  | { readonly ok: true; readonly answers: RegistrationAnswers }
  | { readonly ok: false; readonly state: RegisterState }
> {
  const problems = problemTexts(registrationProblems(typed));
  const typedAddress = emailAddress(typed.email);
  if (
    problems.email === undefined &&
    typedAddress.ok &&
    (await isEmailRegistered(db, typedAddress.value))
  ) {
    const errors = { ...problems, email: REGISTER_TEXT.emailRegistered };
    return { ok: false, state: refusedForm(errors, typed) };
  }
  const answers = registrationAnswers(typed);
  return answers.ok
    ? { ok: true, answers: answers.value }
    : { ok: false, state: refusedForm(problems, typed) };
}

/**
 * The answers, the slug /login or /register was given and the moment
 * kept in the signed cookie - refused on the longest name when they cannot
 * fit (plan decision 13) - and a `registration` code minted and mailed
 * after the response. The same address again is a resend (issue 114).
 */
async function remember(input: {
  readonly db: Db;
  readonly at: Instant;
  readonly typed: TypedRegistration;
  readonly answers: RegistrationAnswers;
}): Promise<RegisterState> {
  const { db, at, typed, answers } = input;
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const pending: PendingRegistration = {
    ...answers,
    tournament: readIntended(jar),
    sentAt: at,
  };
  if (!fitsInCookie(pending, secret)) {
    const errors: Partial<Record<NameField, string>> = {};
    errors[longestName(answers)] = REGISTER_TEXT.tooLong;
    return refusedForm(errors, typed);
  }
  const previous = readPendingRegistration(jar, secret, at);
  const address = answers.email;
  after(() => sendCode(address, at, 'registration'));
  pruneLater(db, at);
  writePendingRegistration(jar, pending, secret);
  clearCookie(jar, OPEN_SIGN_IN_COOKIE);
  return { kind: 'sent', resent: previous?.email === address };
}
