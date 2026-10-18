import type { JSX } from 'react';
import { Refusal, type FormAction } from './dialog-parts';
import { GoogleButton } from './google-button';
import { Icon } from './icon';
import type { SignInState } from './sign-in-state';

/** modals/login: the address, and "Gauti prisijungimo kodą"; with Google configured, "arba" and its button. */
export function EmailStep({
  state,
  formAction,
  pending,
  codeMinutes,
  googleEnabled,
}: {
  state: SignInState;
  formAction: FormAction;
  pending: boolean;
  codeMinutes: number;
  googleEnabled: boolean;
}): JSX.Element {
  return (
    <div className="p-6">
      {/* Any refusal: a code typed with no address pending lands here too. */}
      {state.kind === 'refused' ? <Refusal message={state.message} /> : null}
      <form action={formAction} data-testid="sign-in-request">
        <input type="hidden" name="intent" value="request" />
        <div className="mb-4 flex items-stretch overflow-hidden rounded-md border border-border">
          <span
            aria-hidden="true"
            className="flex items-center bg-surface-2 px-3 text-muted"
          >
            <Icon name="envelope" />
          </span>
          <input
            type="email"
            name="email"
            aria-label="El. paštas"
            placeholder="El. paštas"
            autoComplete="email"
            className="min-w-0 flex-1 bg-card py-2 pr-3 pl-1 text-text outline-none placeholder:text-dim"
          />
        </div>
        <p className="mb-3.5 text-[0.78rem] leading-[1.45] text-muted">
          {`Atsiųsime 8 skaitmenų kodą. Jis galios ${String(codeMinutes)} min.`}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="block w-full cursor-pointer rounded-md border-none bg-accent px-3 py-2 font-semibold text-on-accent hover:bg-accent-hover"
        >
          Gauti prisijungimo kodą
        </button>
      </form>
      {googleEnabled ? <GoogleButton /> : null}
    </div>
  );
}
