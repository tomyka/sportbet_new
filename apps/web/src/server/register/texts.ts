import {
  ANSWER_MAX_LENGTH,
  type RegistrationField,
  type RegistrationProblems,
} from '@sportbet/domain';
import type { RegisterErrors } from '../../components/shell/register-state';
import { SIGN_IN_TEXT } from '../sign-in/texts';

/**
 * Registration's answers: sportbet's own (lang/lt.json), and, where sportbet
 * answers in Laravel's English validation messages, the owner's
 * (spec 4c, "Owner answers", 2026-10-05).
 */
export const REGISTER_TEXT = {
  /** The owner's; sportbet: "The username field is required." */
  usernameRequired: 'Įveskite vartotojo vardą.',
  /** The owner's; sportbet: "The name field is required." */
  nameRequired: 'Įveskite vardą.',
  /** The owner's; sportbet: "The ... field must not be greater than 255 characters." */
  tooLong: `Per ilgas: daugiausia ${String(ANSWER_MAX_LENGTH)} simboliai.`,
  /** The owner's; sportbet: "The email has already been taken." */
  emailRegistered: 'Šis el. pašto adresas jau užregistruotas.',
  noPending: 'Pirmiausia užpildykite registracijos formą.',
  taken:
    'Šis el. paštas arba vartotojo vardas jau užimtas. Pradėkite iš naujo.',
  failed: 'Registracijos užbaigti nepavyko. Bandykite dar kartą.',
} as const;

/** Each field's text for each way the domain can refuse it: total, so a new refusal is a type error here. */
const PROBLEM_TEXT: {
  readonly [F in RegistrationField]: Readonly<
    Record<NonNullable<RegistrationProblems[F]>, string>
  >;
} = {
  username: {
    required: REGISTER_TEXT.usernameRequired,
    // Only characters Laravel's trim keeps: missing (plan decision 14).
    blank: REGISTER_TEXT.usernameRequired,
    'too-long': REGISTER_TEXT.tooLong,
  },
  name: {
    required: REGISTER_TEXT.nameRequired,
    'too-long': REGISTER_TEXT.tooLong,
  },
  surname: { 'too-long': REGISTER_TEXT.tooLong },
  email: {
    required: SIGN_IN_TEXT.emailRequired,
    'not-an-email': SIGN_IN_TEXT.emailInvalid,
    'too-long': REGISTER_TEXT.tooLong,
  },
};

/** Each refused field's text, as sportbet's @error draws it under the field. */
export function problemTexts(problems: RegistrationProblems): RegisterErrors {
  const { username, name, surname, email } = problems;
  return {
    ...(username === undefined
      ? {}
      : { username: PROBLEM_TEXT.username[username] }),
    ...(name === undefined ? {} : { name: PROBLEM_TEXT.name[name] }),
    ...(surname === undefined
      ? {}
      : { surname: PROBLEM_TEXT.surname[surname] }),
    ...(email === undefined ? {} : { email: PROBLEM_TEXT.email[email] }),
  };
}
