'use client';

import { useActionState, useEffect, useState } from 'react';
import { Icon } from './icon';
import {
  SIGN_IN_DIALOG_ID,
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type ShellSignIn,
  type SignInState,
  type SignInStep,
} from './sign-in-state';

type FormAction = (form: FormData) => void;
type CodeStepView = Extract<SignInStep, { kind: 'code' }>;

/** sportbet's Alpine clock(): m:ss. */
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/** Seconds counted down once a second from `seconds`, to zero (the code step's x-data). */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => {
      setLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return left;
}

/** .alert.alert-danger in .sb-auth-body. */
function Refusal({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-3 rounded-[10px] bg-bad-tint px-3 py-2 text-[0.875rem] text-bad"
    >
      {message}
    </div>
  );
}

/** modals/login: the address, and "Gauti prisijungimo kodą". Google's way in is 4c's. */
function EmailStep({
  state,
  formAction,
  pending,
  codeMinutes,
}: {
  state: SignInState;
  formAction: FormAction;
  pending: boolean;
  codeMinutes: number;
}) {
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
    </div>
  );
}

/** partials/auth/login-code-step: one job on screen - the code - and its own way back. */
function CodeStep({
  step,
  state,
  formAction,
  pending,
}: {
  step: CodeStepView;
  state: SignInState;
  formAction: FormAction;
  pending: boolean;
}) {
  const expiresIn = useCountdown(step.expiresIn);
  const resendIn = useCountdown(step.resendIn);
  const resent = state.kind === 'sent' && state.resent;
  const refusal = state.kind === 'refused' ? state.message : null;
  return (
    <div className="p-6">
      <form action={formAction} data-testid="sign-in-cancel">
        <input type="hidden" name="intent" value="cancel" />
        <button
          type="submit"
          className="mb-2 inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent py-1 pr-1.5 text-[0.85rem] font-medium text-muted hover:text-text"
        >
          <Icon name="arrow-left" /> Atgal
        </button>
      </form>
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent"
        >
          <Icon name="envelope" />
        </span>
        <p className="m-0 text-[0.85rem] leading-[1.45] text-muted">
          Kodą išsiuntėme į{' '}
          <strong className="font-semibold text-text">{step.email}</strong>
        </p>
      </div>
      {refusal === null ? null : <Refusal message={refusal} />}
      <form action={formAction} data-testid="sign-in-verify">
        <input type="hidden" name="intent" value="verify" />
        <label htmlFor="sign-in-code" className="sr-only">
          8 skaitmenų kodas
        </label>
        <input
          id="sign-in-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="••••••••"
          autoFocus
          className={`mb-2 block w-full rounded-[12px] border-[1.5px] bg-surface-2 px-4 py-3.5 text-center text-[1.4rem] font-bold tracking-[0.3em] indent-[0.3em] text-text outline-none placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-tint)] ${refusal === null ? 'border-border' : 'border-bad'}`}
        />
        <p className="mb-3.5 text-center text-[0.78rem] text-muted">
          {resent ? (
            <span className="font-semibold text-ok">
              Kodą išsiuntėme iš naujo.
            </span>
          ) : null}
          {expiresIn > 0
            ? `${resent ? ' Galioja dar' : 'Kodas galioja dar'} ${clock(expiresIn)}`
            : 'Kodo galiojimas baigėsi - išsiųskite naują.'}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mb-3 block w-full cursor-pointer rounded-full border-none bg-accent p-3.5 text-base font-bold text-on-accent hover:bg-accent-hover"
        >
          Prisijungti
        </button>
      </form>
      <div className="m-0 text-[0.78rem] leading-[1.5] text-muted">
        Negavote? Patikrinkite šlamšto aplanką arba{' '}
        <form
          action={formAction}
          className="inline"
          data-testid="sign-in-resend"
        >
          <input type="hidden" name="intent" value="request" />
          <input type="hidden" name="email" value={step.email} />
          <button
            type="submit"
            aria-label="Siųsti kodą iš naujo"
            disabled={resendIn > 0 || pending}
            className="cursor-pointer border-none bg-transparent p-0 font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:text-dim disabled:no-underline"
          >
            {resendIn > 0
              ? `siųskite iš naujo (${clock(resendIn)})`
              : 'siųskite iš naujo'}
          </button>
        </form>
        .
      </div>
    </div>
  );
}

/**
 * The sign-in dialog (sportbet's #loginModal, CLAUDE.md > The sign-in
 * dialog): one per page, for a guest; the whole flow in place - ask for a
 * code, type it, resend it, back out - each answered by the one Server
 * Action. It opens on "Prisijungti" (SIGN_IN_EVENT), on arrival from
 * /login, with a code to type, and on an answer to something asked in it;
 * 4b draws its sign-in side only (registration's tab is 4c's), so there
 * are no tabs to hide while a code is in flight.
 */
export function SignInDialog({ step, open, codeMinutes, action }: ShellSignIn) {
  const [state, formAction, pending] = useActionState(action, SIGN_IN_IDLE);
  const [isOpen, setOpen] = useState(
    open || step.kind === 'code' || state.kind !== 'idle',
  );

  useEffect(() => {
    const show = () => {
      setOpen(true);
    };
    window.addEventListener(SIGN_IN_EVENT, show);
    return () => {
      window.removeEventListener(SIGN_IN_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div id={SIGN_IN_DIALOG_ID} data-testid="sign-in-dialog" hidden={!isOpen}>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[1050] bg-scrim"
        onClick={() => {
          setOpen(false);
        }}
      />
      {/* .modal-dialog-centered at 420px, .modal-content with radius 12px */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prisijungti"
        className="fixed top-1/2 left-1/2 z-[1055] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] bg-card text-text shadow-[0_8px_32px_var(--color-shadow-strong)]"
      >
        {/* .sb-auth-header, bare while a code is in flight */}
        <div
          className={`bg-surface px-6 pt-5 text-text ${step.kind === 'code' ? 'pb-1.5' : 'pb-0'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.82rem] font-extrabold tracking-[0.09em] uppercase">
              Sport<i className="text-accent not-italic">Bet</i>
            </span>
            <button
              type="button"
              aria-label="Uždaryti"
              onClick={() => {
                setOpen(false);
              }}
              className="cursor-pointer border-none bg-transparent p-1 text-[0.8rem] text-muted hover:text-text"
            >
              <Icon name="x-lg" />
            </button>
          </div>
        </div>
        {step.kind === 'code' ? (
          <CodeStep
            key={step.sentAt}
            step={step}
            state={state}
            formAction={formAction}
            pending={pending}
          />
        ) : (
          <EmailStep
            state={state}
            formAction={formAction}
            pending={pending}
            codeMinutes={codeMinutes}
          />
        )}
      </div>
    </div>
  );
}
