import type { SignInState } from '../../components/shell/sign-in-state';

/**
 * The dialog's answers: sportbet's own (lang/lt.json), and, where sportbet
 * answered with Laravel's English validation messages, the owner's (Q2).
 */
export const SIGN_IN_TEXT = {
  /** Q2; sportbet: "The email field is required." */
  emailRequired: 'Įveskite el. pašto adresą.',
  /** Q2; sportbet: "The email field must be a valid email address." */
  emailInvalid: 'Įveskite teisingą el. pašto adresą.',
  /** Q2; sportbet: "The code field is required." */
  codeRequired: 'Įveskite kodą.',
  noPendingEmail: 'Pirmiausia įveskite el. pašto adresą.',
  wrongCode: 'Neteisingas arba pasibaigęs kodas.',
} as const;

/** A refusal of the address (request) or of the code (verify), shown in the dialog. */
export function refused(field: 'email' | 'code', message: string): SignInState {
  return { kind: 'refused', field, message };
}

/** bootstrap/app.php's answer to a throttled step (#75): the minutes until it lifts, at least one. */
export function throttledText(minutes: number): string {
  return `Per daug bandymų. Pabandykite dar kartą po ${String(minutes)} min.`;
}
