import type { Flash } from '../../server/flash';
import {
  ACCOUNT_FIELDS,
  type AccountError,
  type CodeError,
  type ProfileInfo,
} from '../../server/profile/profile-messages';
import { REGISTER_TEXT } from '../../server/register/texts';
import { SIGN_IN_TEXT } from '../../server/sign-in/texts';

/**
 * The profile's texts, in Lithuanian (decision 13): sportbet's own
 * (lang/lt.json), registration's where the form is registration's, and the
 * owner's own (the last superadmin's refusal, R-131: his wording).
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

/** One field's text for why it was refused, as sportbet's @error draws it. */
export function accountErrorText(
  field: AccountField,
  error: AccountError,
  minutes: number,
): string {
  switch (error) {
    case 'throttled':
      return minutesText(minutes);
    case 'taken':
      return field === 'username'
        ? PROFILE_TEXT.usernameTaken
        : PROFILE_TEXT.emailTaken;
    case 'too-long':
      return REGISTER_TEXT.tooLong;
    case 'send-failed':
      return PROFILE_TEXT.sendFailed;
    case 'not-an-email':
      return SIGN_IN_TEXT.emailInvalid;
    case 'required':
    case 'blank':
      return REQUIRED[field];
  }
}

/** The code box's and the danger zone's refusals, each its own text. */
const CODE_TEXT: Readonly<Record<CodeError, string>> = {
  none: PROFILE_TEXT.noPendingChange,
  taken: PROFILE_TEXT.addressTaken,
  'send-failed': PROFILE_TEXT.sendFailed,
  'last-superadmin': PROFILE_TEXT.lastSuperadmin,
  invalid: PROFILE_TEXT.wrongCode,
};

export const codeErrorText = (error: CodeError): string => CODE_TEXT[error];

/**
 * The text of one of the profile's `session('info')` messages: a case for
 * each kind of profile-messages.ts's list, which TypeScript requires to be
 * complete (no case, no return).
 */
export function infoText(info: ProfileInfo): string {
  switch (info.kind) {
    case 'profile-updated':
      return 'Profilis atnaujintas.';
    case 'email-change-requested':
      return `Patvirtinimo kodas išsiųstas į ${info.email}. Senasis adresas galioja, kol kodo neįvesite.`;
    case 'email-changed':
      return 'El. paštas pakeistas. Apie pakeitimą pranešėme senuoju adresu.';
    case 'email-change-cancelled':
      return 'El. pašto keitimas atšauktas.';
    case 'deletion-code-sent':
      return 'Patvirtinimo kodas išsiųstas į jūsų el. pašto adresą.';
    case 'notifications-saved':
      return 'Pranešimų nustatymai atnaujinti.';
  }
}

/** The refusals of one bag, as the texts the page lists, in the order of the form. */
export function refusalTexts(
  flash: Flash | null,
  bag: 'account' | 'emailChange' | 'userDeletion',
): readonly string[] {
  if (flash?.kind === 'code-refused') {
    return flash.bag === bag ? [codeErrorText(flash.error)] : [];
  }
  if (flash?.kind !== 'account-refused' || bag !== 'account') return [];
  const { errors } = flash;
  return ACCOUNT_FIELDS.flatMap((field) => {
    const error = errors[field];
    return error === undefined
      ? []
      : [accountErrorText(field, error, flash.minutes ?? 1)];
  });
}
