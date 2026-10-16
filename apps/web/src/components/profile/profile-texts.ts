import type { Flash } from '../../server/flash';
import type {
  ACCOUNT_FIELDS,
  ProfileError,
} from '../../server/profile/profile-messages';
import { REGISTER_TEXT } from '../../server/register/texts';
import { SIGN_IN_TEXT } from '../../server/sign-in/texts';

/**
 * The profile's texts, in Lithuanian (decision 13): sportbet's own
 * (lang/lt.json), registration's where the form is registration's, and the
 * owner's three new ones (R-131 and the two of 2026-10-13).
 */
export const PROFILE_TEXT = {
  surnameRequired: 'Įveskite pavardę.',
  usernameTaken: 'Šis vartotojo vardas jau užimtas.',
  emailTaken: REGISTER_TEXT.emailRegistered,
  sendFailed: 'Nepavyko išsiųsti patvirtinimo kodo. Bandykite vėliau.',
  noPendingChange: 'Nėra laukiančio el. pašto keitimo.',
  wrongCode: 'Neteisingas arba pasibaigęs patvirtinimo kodas.',
  addressTaken: 'Šis el. paštas jau susietas su kita paskyra.',
  /** R-131: the last superadmin cannot delete their own account. */
  lastSuperadmin:
    'Paskutinio superadministratoriaus paskyros ištrinti negalima. Pirmiausia paskirkite kitą superadministratorių.',
} as const;

type AccountField = (typeof ACCOUNT_FIELDS)[number];

const minutesText = (minutes: number): string =>
  `Per daug bandymų. Pabandykite po ${String(minutes)} min.`;

/** What each field says when it is empty (a username that is only blanks is empty too). */
const REQUIRED: Readonly<Record<AccountField, string>> = {
  username: REGISTER_TEXT.usernameRequired,
  name: REGISTER_TEXT.nameRequired,
  surname: PROFILE_TEXT.surnameRequired,
  email: SIGN_IN_TEXT.emailRequired,
};

/** The texts that do not depend on the field: what every field says for these refusals. */
const FIELD_TEXT: Readonly<Partial<Record<ProfileError, string>>> = {
  'too-long': REGISTER_TEXT.tooLong,
  'send-failed': PROFILE_TEXT.sendFailed,
  'not-an-email': SIGN_IN_TEXT.emailInvalid,
};

/** One field's text for why it was refused, as sportbet's @error draws it. */
export function accountErrorText(
  field: AccountField,
  error: ProfileError,
  minutes: number,
): string {
  if (error === 'throttled') return minutesText(minutes);
  if (error === 'taken') {
    return field === 'username'
      ? PROFILE_TEXT.usernameTaken
      : PROFILE_TEXT.emailTaken;
  }
  return FIELD_TEXT[error] ?? REQUIRED[field];
}

/** The code box's and the danger zone's refusals; anything else is a wrong code. */
const CODE_TEXT: Readonly<Partial<Record<ProfileError, string>>> = {
  none: PROFILE_TEXT.noPendingChange,
  taken: PROFILE_TEXT.addressTaken,
  'send-failed': PROFILE_TEXT.sendFailed,
  'last-superadmin': PROFILE_TEXT.lastSuperadmin,
};

export const codeErrorText = (error: ProfileError): string =>
  CODE_TEXT[error] ?? PROFILE_TEXT.wrongCode;

/** The refusals of one bag, as the texts the page lists, in the order of the form. */
export function refusalTexts(
  flash: Flash | null,
  bag: 'account' | 'emailChange' | 'userDeletion',
): readonly string[] {
  if (flash?.kind !== 'profile-refused' || flash.bag !== bag) return [];
  const { errors } = flash;
  if (bag !== 'account') {
    return errors.code === undefined ? [] : [codeErrorText(errors.code)];
  }
  const fields = ['username', 'name', 'surname', 'email'] as const;
  return fields.flatMap((field) => {
    const error = errors[field];
    return error === undefined
      ? []
      : [accountErrorText(field, error, flash.minutes ?? 1)];
  });
}
