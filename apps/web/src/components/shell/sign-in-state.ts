// The sign-in dialog's names and shapes, shared by the server that fills
// it (server/sign-in) and the client that draws it. No imports: a client
// component reads this file.

/** sportbet's #loginModal: the one dialog on a page. */
export const SIGN_IN_DIALOG_ID = 'loginModal';

/** What "Prisijungti" dispatches to open the dialog in place. */
export const SIGN_IN_EVENT = 'sportbet:sign-in';

/** sportbet's route('login'): "Prisijungti" without JavaScript. */
export const SIGN_IN_PATH = '/login';

/** The answer to the last thing asked in the dialog (sportbet's flashed errors and code_resent). */
export type SignInState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sent'; readonly resent: boolean }
  | {
      readonly kind: 'refused';
      readonly field: 'email' | 'code';
      readonly message: string;
    };

export const SIGN_IN_IDLE: SignInState = { kind: 'idle' };

/** Which step the dialog draws: the address, or a code still alive (AuthCodeStep::login). */
export type SignInStep =
  | { readonly kind: 'email' }
  | {
      readonly kind: 'code';
      /** The address the visitor typed, never anything of an account. */
      readonly email: string;
      /** When the code went out (ISO), so a new code restarts the countdowns. */
      readonly sentAt: string;
      readonly resendIn: number;
      readonly expiresIn: number;
    };

/** The dialog's Server Action (server/sign-in/sign-in-action.ts), passed in. */
export type SignInAction = (
  state: SignInState,
  form: FormData,
) => Promise<SignInState>;

/** What a guest's shell is told about signing in. */
export interface ShellSignIn {
  readonly step: SignInStep;
  /** Open on arrival: from /login, or with a code to type. */
  readonly open: boolean;
  /** The code's life, as the server's constant says it (sportbet #76). */
  readonly codeMinutes: number;
  readonly action: SignInAction;
}
