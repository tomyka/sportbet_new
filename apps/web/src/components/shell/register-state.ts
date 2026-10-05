// The registration side of the sign-in dialog's shapes, shared by the
// server that answers it (server/register) and the client that draws it.
// Type imports only: a client component reads this file.

import type { RegistrationField } from '@sportbet/domain';

/** modals/register's fields: the domain's (RegisteredUserController::store's). */
export type RegisterField = RegistrationField;

/** What the form held when it was refused (sportbet's old()). */
export type RegisterValues = Readonly<Record<RegisterField, string>>;

/** Each refused field's text (sportbet's @error under its input). */
export type RegisterErrors = Readonly<Partial<Record<RegisterField, string>>>;

/** sportbet's $errors->first(): the first refused field's text, in the form's order. */
export function firstError(errors: RegisterErrors): string | null {
  return (
    errors.username ?? errors.name ?? errors.surname ?? errors.email ?? null
  );
}

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  username: '',
  name: '',
  surname: '',
  email: '',
};

/** The answer to the last thing asked of registration in the dialog. */
export type RegisterState =
  | { readonly kind: 'idle' }
  /** Step one passed: a code is on its way; `resent` for the same address again (issue 114). */
  | { readonly kind: 'sent'; readonly resent: boolean }
  /** The form refused: each field's text, and the answers to draw it with again. */
  | {
      readonly kind: 'refused';
      readonly errors: RegisterErrors;
      readonly values: RegisterValues;
    }
  /** Step two refused, or no registration to confirm: one text, in the code step or above the form. */
  | { readonly kind: 'code-refused'; readonly message: string };

export const REGISTER_IDLE: RegisterState = { kind: 'idle' };

/** The dialog's registration Server Action (server/register/register-action.ts), passed in. */
export type RegisterAction = (
  state: RegisterState,
  form: FormData,
) => Promise<RegisterState>;
