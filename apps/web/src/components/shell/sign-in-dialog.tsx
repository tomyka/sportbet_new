'use client';

import type { JSX } from 'react';
import { useActionState, useEffect, useState } from 'react';
import { CodeStep, type CodeStepForms } from './code-step';
import { Refusal, type FormAction } from './dialog-parts';
import { Icon } from './icon';
import { RegisterPane } from './register-pane';
import {
  firstError,
  REGISTER_IDLE,
  type RegisterState,
} from './register-state';
import {
  SIGN_IN_DIALOG_ID,
  SIGN_IN_EVENT,
  SIGN_IN_IDLE,
  type DialogTab,
  type ShellSignIn,
  type SignInState,
  type SignInStep,
} from './sign-in-state';

/** modals/login: the address, and "Gauti prisijungimo kodą". Google's way in is 4d's. */
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

const SIGN_IN_FORMS: CodeStepForms = {
  cancel: { testId: 'sign-in-cancel', intent: 'cancel' },
  verify: { testId: 'sign-in-verify', intent: 'verify' },
  resend: { testId: 'sign-in-resend', intent: 'request' },
};

const REGISTER_FORMS: CodeStepForms = {
  cancel: { testId: 'register-cancel', intent: 'cancel' },
  verify: { testId: 'register-confirm', intent: 'confirm' },
  resend: { testId: 'register-resend', intent: 'request' },
};

const TABS: readonly { readonly tab: DialogTab; readonly label: string }[] = [
  { tab: 'login', label: 'Prisijungti' },
  { tab: 'register', label: 'Registruotis' },
];

/** .sb-auth-tabs: a real tab list (sportbet issue 107), the chosen one on the accent tint. */
function Tabs({
  active,
  choose,
}: {
  active: DialogTab;
  choose: (tab: DialogTab) => void;
}) {
  return (
    <nav
      role="tablist"
      className="mt-4 flex gap-1 rounded-[12px] bg-surface-2 p-1"
    >
      {TABS.map(({ tab, label }) => (
        <button
          key={tab}
          id={`${tab}Tab`}
          type="button"
          role="tab"
          aria-controls={`${tab}Pane`}
          aria-selected={active === tab}
          onClick={() => {
            choose(tab);
          }}
          className={`h-9 flex-1 cursor-pointer rounded-[9px] border-none p-0 text-[0.875rem] ${active === tab ? 'bg-accent-tint font-bold text-text shadow-[0_1px_3px_var(--color-shadow)]' : 'bg-transparent font-semibold text-muted hover:text-text'}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * The tab drawn: the sign-in's while registration is closed; else the one
 * the visitor chose, else Registruotis after a registration refusal (Q2),
 * else the one the dialog opened on.
 */
function activeTab(
  registrationOpen: boolean,
  chosen: DialogTab | null,
  registerState: RegisterState,
  tab: DialogTab,
): DialogTab {
  if (!registrationOpen) return 'login';
  if (chosen !== null) return chosen;
  return registerState.kind === 'refused' ||
    registerState.kind === 'code-refused'
    ? 'register'
    : tab;
}

/**
 * What the register code step shows (register-code-step's
 * $errors->first()): a refused code, or a refused resend's first field
 * error - a throttle, or the address registered meanwhile.
 */
function registerRefusal(state: RegisterState): string | null {
  if (state.kind === 'code-refused') return state.message;
  return state.kind === 'refused' ? firstError(state.errors) : null;
}

/** Whether the dialog is open: from `initially`, opened by "Prisijungti" (SIGN_IN_EVENT), shut by Escape. */
function useDialogOpen(
  initially: boolean,
): readonly [boolean, (open: boolean) => void] {
  const [isOpen, setOpen] = useState(initially);
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
  return [isOpen, setOpen];
}

/** Both flows' Server Actions as useActionState holds them. */
interface Flows {
  readonly state: SignInState;
  readonly formAction: FormAction;
  readonly pending: boolean;
  readonly registerState: RegisterState;
  readonly registerFormAction: FormAction;
  readonly registering: boolean;
}

/** Both flows' Server Actions, each held by useActionState from idle. */
function useFlows(
  action: ShellSignIn['action'],
  registerAction: ShellSignIn['registerAction'],
): Flows {
  const [state, formAction, pending] = useActionState(action, SIGN_IN_IDLE);
  const [registerState, registerFormAction, registering] = useActionState(
    registerAction,
    REGISTER_IDLE,
  );
  return {
    state,
    formAction,
    pending,
    registerState,
    registerFormAction,
    registering,
  };
}

/** What the dialog draws under its header: a code to type, of either flow, or the forms. */
function DialogBody({
  step,
  flows,
  active,
  registrationOpen,
  codeMinutes,
}: {
  step: SignInStep;
  flows: Flows;
  active: DialogTab;
  registrationOpen: boolean;
  codeMinutes: number;
}): JSX.Element {
  if (step.kind === 'code') return <SignInCode step={step} flows={flows} />;
  if (step.kind === 'register-code') {
    return <RegisterCode step={step} flows={flows} />;
  }
  return (
    <FormPanes
      flows={flows}
      active={active}
      registrationOpen={registrationOpen}
      codeMinutes={codeMinutes}
    />
  );
}

/** A sign-in code to type: its life and resend counted down. */
function SignInCode({
  step,
  flows,
}: {
  step: Extract<SignInStep, { kind: 'code' }>;
  flows: Flows;
}): JSX.Element {
  const { state } = flows;
  return (
    <CodeStep
      key={step.sentAt}
      email={step.email}
      resendIn={step.resendIn}
      expiresIn={step.expiresIn}
      refusal={state.kind === 'refused' ? state.message : null}
      resent={state.kind === 'sent' && state.resent}
      formAction={flows.formAction}
      pending={flows.pending}
      forms={SIGN_IN_FORMS}
      codeInputId="sign-in-code"
      submitLabel="Prisijungti"
      resendFields={{ email: step.email }}
    />
  );
}

/** A registration code to type; its resend posts the four answers again. */
function RegisterCode({
  step,
  flows,
}: {
  step: Extract<SignInStep, { kind: 'register-code' }>;
  flows: Flows;
}): JSX.Element {
  const { registerState } = flows;
  return (
    <CodeStep
      key={step.sentAt}
      email={step.email}
      resendIn={step.resendIn}
      expiresIn={step.expiresIn}
      refusal={registerRefusal(registerState)}
      resent={registerState.kind === 'sent' && registerState.resent}
      formAction={flows.registerFormAction}
      pending={flows.registering}
      forms={REGISTER_FORMS}
      codeInputId="register-code"
      submitLabel="Užbaigti registraciją"
      resendFields={{
        username: step.username,
        name: step.name,
        surname: step.surname,
        email: step.email,
      }}
    />
  );
}

/** The forms: the sign-in's address, and while registration is open, the register pane - one shown, by tab. */
function FormPanes({
  flows,
  active,
  registrationOpen,
  codeMinutes,
}: {
  flows: Flows;
  active: DialogTab;
  registrationOpen: boolean;
  codeMinutes: number;
}): JSX.Element {
  return (
    <>
      <div
        id="loginPane"
        role={registrationOpen ? 'tabpanel' : undefined}
        aria-labelledby={registrationOpen ? 'loginTab' : undefined}
        hidden={active !== 'login'}
      >
        <EmailStep
          state={flows.state}
          formAction={flows.formAction}
          pending={flows.pending}
          codeMinutes={codeMinutes}
        />
      </div>
      {registrationOpen ? (
        <div
          id="registerPane"
          role="tabpanel"
          aria-labelledby="registerTab"
          hidden={active !== 'register'}
        >
          <RegisterPane
            state={flows.registerState}
            formAction={flows.registerFormAction}
            pending={flows.registering}
          />
        </div>
      ) : null}
    </>
  );
}

/** .sb-auth-header: the wordmark and the close button, then the tabs when drawn; bottom padding only while a code is in flight. */
function DialogHeader({
  emailStep,
  withTabs,
  active,
  choose,
  close,
}: {
  emailStep: boolean;
  withTabs: boolean;
  active: DialogTab;
  choose: (tab: DialogTab) => void;
  close: () => void;
}): JSX.Element {
  return (
    <div
      className={`bg-surface px-6 pt-5 text-text ${emailStep ? 'pb-0' : 'pb-1.5'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.82rem] font-extrabold tracking-[0.09em] uppercase">
          Sport<i className="text-accent not-italic">Bet</i>
        </span>
        <button
          type="button"
          aria-label="Uždaryti"
          onClick={close}
          className="cursor-pointer border-none bg-transparent p-1 text-[0.8rem] text-muted hover:text-text"
        >
          <Icon name="x-lg" />
        </button>
      </div>
      {withTabs ? <Tabs active={active} choose={choose} /> : null}
    </div>
  );
}

/**
 * The sign-in dialog (sportbet's #loginModal, CLAUDE.md > The sign-in
 * dialog): one per page, for a guest; both flows in place - sign in or
 * register, a code typed, resent, or backed out of - each answered by its
 * own Server Action. It opens on "Prisijungti" (SIGN_IN_EVENT), on arrival
 * from /login or /register (on that tab), with a code to type, and on an
 * answer to something asked in it. The tabs are drawn only while
 * registration is open and no code is in flight.
 */
export function SignInDialog({
  step,
  open,
  tab,
  registrationOpen,
  codeMinutes,
  action,
  registerAction,
}: ShellSignIn): JSX.Element {
  const flows = useFlows(action, registerAction);
  const [isOpen, setOpen] = useDialogOpen(
    open ||
      step.kind !== 'email' ||
      flows.state.kind !== 'idle' ||
      flows.registerState.kind !== 'idle',
  );
  const [chosen, setChosen] = useState<DialogTab | null>(null);
  const active = activeTab(registrationOpen, chosen, flows.registerState, tab);
  const close = () => {
    setOpen(false);
  };
  return (
    <div id={SIGN_IN_DIALOG_ID} data-testid="sign-in-dialog" hidden={!isOpen}>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[1050] bg-scrim"
        onClick={close}
      />
      {/* .modal-dialog-centered at 420px, .modal-content with radius 12px */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prisijungti"
        className="fixed top-1/2 left-1/2 z-[1055] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] bg-card text-text shadow-[0_8px_32px_var(--color-shadow-strong)]"
      >
        <DialogHeader
          emailStep={step.kind === 'email'}
          withTabs={step.kind === 'email' && registrationOpen}
          active={active}
          choose={setChosen}
          close={close}
        />
        <DialogBody
          step={step}
          flows={flows}
          active={active}
          registrationOpen={registrationOpen}
          codeMinutes={codeMinutes}
        />
      </div>
    </div>
  );
}
